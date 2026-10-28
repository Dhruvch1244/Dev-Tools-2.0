// Compiles and runs the user's own C++ / Java / Python on this laptop, and collects `viz` events
// the program prints so the UI can animate the run.
//
// Why on the server and not in the browser: the user solves in C++/Java/Python; only the real
// toolchains give real behaviour (UB, integer overflow, TLE). This is a personal, loopback-bound
// app running code the owner wrote — the limits below are about runaway loops, not isolation.
// Set RUNNER=off to disable the endpoint entirely.
//
// The viz helpers are injected without shifting the user's line numbers:
//   C++    → `-include viz.h` on the compiler command line
//   Python → `sitecustomize.py` on PYTHONPATH puts `viz` in builtins
//   Java   → a sibling `Viz.java` compiled alongside Main
import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export type Lang = 'cpp' | 'java' | 'py';
export type RunResult = {
  phase: 'compile' | 'run';
  ok: boolean;
  exitCode: number | null;
  timedOut: boolean;
  stdout: string;
  stderr: string;
  events: unknown[];
  ms: number;
};

const OUTPUT_CAP = 1 << 20;
const EVENT_CAP = 20_000;
const VIZ_PREFIX = '@@viz ';

function exec(cmd: string, args: string[], opts: { cwd: string; stdin?: string; timeoutMs: number; env?: Record<string, string> }) {
  return new Promise<{ code: number | null; out: string; err: string; timedOut: boolean; ms: number }>((resolve) => {
    const t0 = performance.now();
    const child = spawn(cmd, args, { cwd: opts.cwd, env: { PATH: process.env.PATH ?? '', HOME: opts.cwd, ...opts.env }, stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    let timedOut = false;
    child.stdout.on('data', (d) => out.length < OUTPUT_CAP && (out += d));
    child.stderr.on('data', (d) => err.length < OUTPUT_CAP * 4 && (err += d));
    const timer = setTimeout(() => ((timedOut = true), child.kill('SIGKILL')), opts.timeoutMs);
    child.on('error', (e) => (err += String(e)));
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, out, err, timedOut, ms: Math.round(performance.now() - t0) });
    });
    child.stdin.on('error', () => {});
    child.stdin.end(opts.stdin ?? '');
  });
}

/** Separate viz protocol lines from the program's real stderr. */
function splitViz(stderr: string) {
  const events: unknown[] = [];
  const rest: string[] = [];
  for (const line of stderr.split('\n')) {
    if (line.startsWith(VIZ_PREFIX)) {
      if (events.length < EVENT_CAP) {
        try {
          events.push(JSON.parse(line.slice(VIZ_PREFIX.length)));
        } catch {
          rest.push(line);
        }
      }
    } else rest.push(line);
  }
  return { events, stderr: rest.join('\n').trimEnd() };
}

// Memory cap via prlimit for native/python; the JVM reserves huge virtual space, so it gets -Xmx instead.
const limited = (cmd: string, args: string[]) => ['prlimit', ['--as=1073741824', '--', cmd, ...args]] as const;

async function runOnce(lang: Lang, code: string, stdin: string): Promise<RunResult> {
  const dir = await mkdtemp(join(tmpdir(), 'dt2-run-'));
  try {
    if (lang === 'cpp') {
      await writeFile(join(dir, 'viz.h'), VIZ_CPP);
      await writeFile(join(dir, 'main.cpp'), code);
      const c = await exec('g++', ['-std=c++20', '-O2', '-pipe', '-include', 'viz.h', 'main.cpp', '-o', 'main'], { cwd: dir, timeoutMs: 30_000 });
      if (c.code !== 0) return { phase: 'compile', ok: false, exitCode: c.code, timedOut: c.timedOut, stdout: '', stderr: c.err, events: [], ms: c.ms };
      const [cmd, args] = limited('./main', []);
      return finish(await exec(cmd, [...args], { cwd: dir, stdin, timeoutMs: 5_000 }));
    }
    if (lang === 'java') {
      const cls = /public\s+(?:final\s+)?class\s+(\w+)/.exec(code)?.[1] ?? 'Main';
      await writeFile(join(dir, `${cls}.java`), code);
      await writeFile(join(dir, 'Viz.java'), VIZ_JAVA);
      const c = await exec('javac', ['-encoding', 'UTF-8', `${cls}.java`, 'Viz.java'], { cwd: dir, timeoutMs: 30_000 });
      if (c.code !== 0) return { phase: 'compile', ok: false, exitCode: c.code, timedOut: c.timedOut, stdout: '', stderr: c.err, events: [], ms: c.ms };
      return finish(await exec('java', ['-Xmx256m', '-Xss64m', '-XX:+UseSerialGC', cls], { cwd: dir, stdin, timeoutMs: 8_000 }));
    }
    await writeFile(join(dir, 'sitecustomize.py'), VIZ_PY);
    await writeFile(join(dir, 'main.py'), code);
    const [cmd, args] = limited('python3', ['main.py']);
    return finish(await exec(cmd, [...args], { cwd: dir, stdin, timeoutMs: 6_000, env: { PYTHONPATH: dir, PYTHONIOENCODING: 'utf-8' } }));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function finish(r: { code: number | null; out: string; err: string; timedOut: boolean; ms: number }): RunResult {
  const { events, stderr } = splitViz(r.err);
  return { phase: 'run', ok: r.code === 0 && !r.timedOut, exitCode: r.code, timedOut: r.timedOut, stdout: r.out, stderr, events, ms: r.ms };
}

// One queue for all runs (dsgn pillar #2): compiles are CPU-heavy, so two at a time at most.
const MAX_PARALLEL = 2;
let active = 0;
const waiting: (() => void)[] = [];
export async function run(lang: Lang, code: string, stdin = ''): Promise<RunResult> {
  if (active >= MAX_PARALLEL) await new Promise<void>((r) => waiting.push(r));
  active++;
  try {
    return await runOnce(lang, code, stdin);
  } finally {
    active--;
    waiting.shift()?.();
  }
}

// ---------------------------------------------------------------------------------------------
// viz helpers. Every call prints one JSON line to stderr; the client folds them into frames.
//   array(name, list)          ptr(name, arrayName, index)     table(name, 2d)
//   cell(tableName, r, c)      var(name, value)                step(message)
// ---------------------------------------------------------------------------------------------

const VIZ_PY = String.raw`import builtins, json, sys

class _Viz:
    def _emit(self, **o):
        sys.stderr.write("@@viz " + json.dumps(o, default=str) + "\n")
    def array(self, name, value): self._emit(op="array", name=name, value=list(value))
    def ptr(self, name, target, index): self._emit(op="ptr", name=name, target=target, index=index)
    def table(self, name, value): self._emit(op="table", name=name, value=[list(r) for r in value])
    def cell(self, name, r, c): self._emit(op="cell", name=name, r=r, c=c)
    def var(self, name, value): self._emit(op="var", name=name, value=value)
    def step(self, msg=""): self._emit(op="step", msg=str(msg))

builtins.viz = _Viz()
`;

const VIZ_CPP = String.raw`#pragma once
#include <bits/stdc++.h>
namespace viz {
inline std::string esc(const std::string& s) {
  std::string o = "\"";
  for (char ch : s) {
    if (ch == '"' || ch == '\\') { o += '\\'; o += ch; }
    else if (ch == '\n') o += "\\n";
    else o += ch;
  }
  return o + "\"";
}
inline std::string j(const std::string& s) { return esc(s); }
inline std::string j(const char* s) { return esc(s); }
inline std::string j(char c) { return esc(std::string(1, c)); }
inline std::string j(bool b) { return b ? "true" : "false"; }
template <class T, std::enable_if_t<std::is_arithmetic_v<T>, int> = 0>
inline std::string j(T v) { std::ostringstream os; os << v; return os.str(); }
template <class T> std::string j(const std::vector<T>& v) {
  std::string o = "[";
  for (size_t i = 0; i < v.size(); i++) { if (i) o += ","; o += j(v[i]); }
  return o + "]";
}
inline void emit(const std::string& body) { std::cerr << "@@viz {" << body << "}\n"; }
template <class T> void array(const std::string& name, const std::vector<T>& v) { emit("\"op\":\"array\",\"name\":" + esc(name) + ",\"value\":" + j(v)); }
inline void array(const std::string& name, const std::string& s) { std::vector<char> v(s.begin(), s.end()); array(name, v); }
inline void ptr(const std::string& name, const std::string& target, long long i) { emit("\"op\":\"ptr\",\"name\":" + esc(name) + ",\"target\":" + esc(target) + ",\"index\":" + std::to_string(i)); }
template <class T> void table(const std::string& name, const std::vector<std::vector<T>>& t) { emit("\"op\":\"table\",\"name\":" + esc(name) + ",\"value\":" + j(t)); }
inline void cell(const std::string& name, int r, int c) { emit("\"op\":\"cell\",\"name\":" + esc(name) + ",\"r\":" + std::to_string(r) + ",\"c\":" + std::to_string(c)); }
template <class T> void var(const std::string& name, const T& v) { emit("\"op\":\"var\",\"name\":" + esc(name) + ",\"value\":" + j(v)); }
inline void step(const std::string& msg = "") { emit("\"op\":\"step\",\"msg\":" + esc(msg)); }
}  // namespace viz
`;

const VIZ_JAVA = String.raw`import java.util.*;

final class Viz {
  private static String esc(String s) { return "\"" + s.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n") + "\""; }
  private static String j(Object o) {
    if (o == null) return "null";
    if (o instanceof Number || o instanceof Boolean) return o.toString();
    if (o instanceof int[] a) { StringBuilder b = new StringBuilder("["); for (int i = 0; i < a.length; i++) { if (i > 0) b.append(','); b.append(a[i]); } return b.append(']').toString(); }
    if (o instanceof long[] a) { StringBuilder b = new StringBuilder("["); for (int i = 0; i < a.length; i++) { if (i > 0) b.append(','); b.append(a[i]); } return b.append(']').toString(); }
    if (o instanceof char[] a) { StringBuilder b = new StringBuilder("["); for (int i = 0; i < a.length; i++) { if (i > 0) b.append(','); b.append(esc(String.valueOf(a[i]))); } return b.append(']').toString(); }
    if (o instanceof boolean[] a) { StringBuilder b = new StringBuilder("["); for (int i = 0; i < a.length; i++) { if (i > 0) b.append(','); b.append(a[i]); } return b.append(']').toString(); }
    if (o instanceof Object[] a) { StringBuilder b = new StringBuilder("["); for (int i = 0; i < a.length; i++) { if (i > 0) b.append(','); b.append(j(a[i])); } return b.append(']').toString(); }
    if (o instanceof Collection<?> c) { StringBuilder b = new StringBuilder("["); boolean f = true; for (Object x : c) { if (!f) b.append(','); f = false; b.append(j(x)); } return b.append(']').toString(); }
    return esc(o.toString());
  }
  private static void emit(String body) { System.err.println("@@viz {" + body + "}"); }
  static void array(String name, Object value) { emit("\"op\":\"array\",\"name\":" + esc(name) + ",\"value\":" + j(value instanceof String s ? s.toCharArray() : value)); }
  static void ptr(String name, String target, long index) { emit("\"op\":\"ptr\",\"name\":" + esc(name) + ",\"target\":" + esc(target) + ",\"index\":" + index); }
  static void table(String name, Object value) { emit("\"op\":\"table\",\"name\":" + esc(name) + ",\"value\":" + j(value)); }
  static void cell(String name, int r, int c) { emit("\"op\":\"cell\",\"name\":" + esc(name) + ",\"r\":" + r + ",\"c\":" + c); }
  static void var(String name, Object value) { emit("\"op\":\"var\",\"name\":" + esc(name) + ",\"value\":" + j(value)); }
  static void step(String msg) { emit("\"op\":\"step\",\"msg\":" + esc(msg)); }
  static void step() { step(""); }
}
`;
