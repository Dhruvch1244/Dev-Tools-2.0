import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeft, ExternalLink, Eye, Pencil, Play, Timer } from 'lucide-react';
import { api } from '../../lib/api';
import { firstRevisit, md, useDsa, useSeason } from '../../lib/dsa';
import { WEEKS, findProblem } from '../../core/dsa/plan';
import { framesFromEvents, type Frame } from '../../core/dsa/viz';
import type { Lang } from '../../core/dsa/vizCode';
import type { DsaProgress } from '../../lib/types';
import { CodeView } from '../../components/CodeView';
import { FrameView, PlayerBar, usePlayer } from '../../components/VizStage';
import { Button, Card, Page, PageHeader, Rise, SectionTitle, Segmented, Textarea, cx } from '../../components/ui';
import { DiffChip, STATUS } from './shared';

export type RunResult = { phase: 'compile' | 'run'; ok: boolean; exitCode: number | null; timedOut: boolean; stdout: string; stderr: string; events: unknown[]; ms: number; error?: string };

export const LANGS: { value: Lang; label: string }[] = [
  { value: 'cpp', label: 'C++' },
  { value: 'java', label: 'Java' },
  { value: 'py', label: 'Python' },
];
const SOL_KEY: Record<Lang, 'sol_cpp' | 'sol_java' | 'sol_py'> = { cpp: 'sol_cpp', java: 'sol_java', py: 'sol_py' };

const STARTER: Record<Lang, string> = {
  cpp: `#include <bits/stdc++.h>
using namespace std;

// Write the LeetCode method here, plus a main() to run it locally.
// viz::array / ptr / table / cell / var / step animate your run.

int main() {
    ios::sync_with_stdio(false); cin.tie(nullptr);

}
`,
  java: `import java.util.*;

public class Main {
    // Viz.array / ptr / table / cell / var / step animate your run.
    public static void main(String[] args) {
        Scanner in = new Scanner(System.in);

    }
}
`,
  py: `import sys
from collections import *
from heapq import *

# viz.array / ptr / table / cell / var / step animate your run.
def main():
    data = sys.stdin.read().split()

main()
`,
};

/** Shared runner panel: stdin, expected output, run, output + animated trace. */
export function RunPanel({ lang, code }: { lang: Lang; code: string }) {
  const [stdin, setStdin] = useState('');
  const [expected, setExpected] = useState('');
  const [res, setRes] = useState<RunResult | null>(null);
  const [running, setRunning] = useState(false);
  const [frames, setFrames] = useState<Frame[]>([]);
  const p = usePlayer(frames.length);

  const run = async () => {
    setRunning(true);
    try {
      const r = await api<RunResult>('/run', { method: 'POST', body: JSON.stringify({ lang, code, stdin }) });
      setRes(r);
      setFrames(framesFromEvents(r.events));
    } catch (e) {
      setRes({ phase: 'run', ok: false, exitCode: null, timedOut: false, stdout: '', stderr: String((e as Error).message), events: [], ms: 0 });
      setFrames([]);
    } finally {
      setRunning(false);
    }
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') (e.preventDefault(), void run());
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  const verdict = res && expected.trim() ? (res.stdout.trim().split(/\s+/).join(' ') === expected.trim().split(/\s+/).join(' ') ? 'pass' : 'fail') : null;

  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <Textarea rows={3} placeholder="stdin" value={stdin} onChange={(e) => setStdin(e.target.value)} className="font-mono text-[13px]" />
        <Textarea rows={3} placeholder="expected output (optional — checked on run)" value={expected} onChange={(e) => setExpected(e.target.value)} className="font-mono text-[13px]" />
      </div>
      <div className="flex items-center gap-3">
        <Button onClick={() => void run()} disabled={running || !code.trim()}>
          <Play className="size-4 fill-current" /> {running ? 'Compiling…' : 'Run'}
        </Button>
        <span className="text-xs text-ink-3">Ctrl/⌘ + Enter · runs on this laptop with real {lang === 'cpp' ? 'g++ -O2 -std=c++20' : lang === 'java' ? 'javac / java' : 'python3'}</span>
      </div>
      <AnimatePresence>
        {res && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-[12px] font-bold uppercase">
              <span className={cx('slant px-2.5 py-0.5 text-black', res.ok ? 'bg-green' : res.timedOut ? 'bg-yellow' : 'bg-accent text-white')}>
                {res.phase === 'compile' ? 'Compile error' : res.timedOut ? 'Time limit' : res.ok ? 'Finished' : `Exit ${res.exitCode}`}
              </span>
              {verdict && <span className={cx('slant px-2.5 py-0.5 text-black', verdict === 'pass' ? 'bg-purple' : 'bg-accent text-white')}>{verdict === 'pass' ? 'Output matches' : 'Wrong answer'}</span>}
              <span className="font-mono text-ink-3">{res.ms} ms</span>
              {frames.length > 0 && <span className="font-mono text-ink-3">{frames.length} viz frames</span>}
            </div>
            {(res.stdout || res.stderr) && (
              <pre className="max-h-64 overflow-auto rounded-md border border-line bg-bg p-3 font-mono text-[12.5px] leading-relaxed">
                {res.stdout}
                {res.stderr && <span className="text-accent-2">{(res.stdout ? '\n' : '') + res.stderr}</span>}
              </pre>
            )}
            {frames.length > 0 && (
              <div className="space-y-4 rounded-lg border border-line bg-bg p-4">
                <FrameView frame={frames[p.i]} id="run" />
                <PlayerBar p={p} count={frames.length} msg={frames[p.i]?.msg} />
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function DsaProblem() {
  const id = useParams().id ?? '';
  const p = findProblem(id);
  const { get, save, ready } = useDsa();
  const { lang, setLang } = useSeason();
  const prog = get(id);
  const [code, setCode] = useState<string>('');
  const [notes, setNotes] = useState('');
  const [preview, setPreview] = useState(false);
  const [timerStart, setTimerStart] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const loaded = useRef<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Load once per (problem, language) after the server data arrives; from then on the editor is
  // the source of truth — re-syncing on every refetch would clobber what's being typed.
  useEffect(() => {
    const key = `${id}|${lang}`;
    if (!ready || loaded.current === key) return;
    loaded.current = key;
    setCode(prog?.[SOL_KEY[lang]] ?? STARTER[lang]);
    setNotes(prog?.notes ?? '');
  }, [id, lang, prog, ready]);

  useEffect(() => {
    if (!timerStart) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [timerStart]);

  const persist = (patch: Partial<DsaProgress>) => {
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => save({ problem: id, ...patch }), 700);
  };

  if (!p) return <Page><PageHeader title="Unknown problem" /></Page>;
  const week = WEEKS.find((w) => w.n === p.week);
  const elapsed = timerStart ? Math.max(0, Math.floor((now - timerStart) / 1000)) : 0;

  return (
    <Page>
      <Rise className="mb-3">
        <Link to={week ? `/dsa/week/${week.n}` : '/dsa'} className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-ink-3 hover:text-ink">
          <ArrowLeft className="size-4" /> {week ? `R${week.n} · ${week.gp} GP` : 'Season HQ'}
        </Link>
      </Rise>
      <PageHeader
        eyebrow={week?.topic ?? 'Test problem'}
        title={<span className="normal-case">{p.title}</span>}
        action={
          <a href={p.url} target="_blank" rel="noreferrer">
            <Button variant="soft">
              LeetCode <ExternalLink className="size-4" />
            </Button>
          </a>
        }
      />
      <Rise className="-mt-3 mb-5 flex flex-wrap items-center gap-3">
        <DiffChip d={p.diff} />
        <div className="flex gap-1">
          {STATUS.map((s) => (
            <button
              key={s.value}
              onClick={() => {
                const now = new Date().toISOString();
                save({ problem: id, status: s.value, ...(s.value === 'solved' && !prog?.solved_at ? { solved_at: now, revisit_at: firstRevisit(prog?.confidence ?? 2) } : {}), ...(timerStart ? { minutes: (prog?.minutes ?? 0) + Math.round((Date.now() - timerStart) / 60000) } : {}) });
                if (s.value === 'solved') setTimerStart(null);
              }}
              className={cx('slant px-3 py-1 text-[11px] font-black italic uppercase transition', (prog?.status ?? 'todo') === s.value ? 'text-black' : 'bg-surface-2 text-ink-3 hover:text-ink')}
              style={(prog?.status ?? 'todo') === s.value ? { background: s.color } : undefined}
            >
              {s.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1 text-xs font-bold uppercase text-ink-3">
          Confidence
          {[1, 2, 3].map((c) => (
            <button key={c} onClick={() => save({ problem: id, confidence: c, ...(prog?.solved_at ? { revisit_at: firstRevisit(c) } : {}) })} className={cx('ml-1 h-5 w-6 -skew-x-12 transition', (prog?.confidence ?? 0) >= c ? 'bg-yellow' : 'bg-surface-2')} aria-label={`Confidence ${c} of 3`} />
          ))}
        </div>
        <button onClick={() => (setNow(Date.now()), setTimerStart(timerStart ? null : Date.now()))} className={cx('ml-auto flex items-center gap-1.5 rounded-md px-3 py-1.5 font-mono text-sm font-bold', timerStart ? 'bg-accent text-white' : 'bg-surface-2 text-ink-2')}>
          <Timer className="size-4" /> {timerStart ? `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, '0')}` : `${prog?.minutes ?? 0} min logged`}
        </button>
      </Rise>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Card>
          <SectionTitle action={<Segmented value={lang} onChange={(l) => (save({ problem: id, [SOL_KEY[lang]]: code }), setLang(l), (loaded.current = null))} options={LANGS} />}>Solution</SectionTitle>
          <CodeView
            lang={lang}
            value={code}
            minHeight={320}
            maxHeight={560}
            onChange={(v) => {
              setCode(v);
              persist({ [SOL_KEY[lang]]: v });
            }}
          />
          <div className="mt-4">
            <RunPanel lang={lang} code={code} />
          </div>
        </Card>
        <Card>
          <SectionTitle
            action={
              <button onClick={() => setPreview(!preview)} className="flex items-center gap-1 text-xs font-bold uppercase text-ink-3 hover:text-ink">
                {preview ? <Pencil className="size-3.5" /> : <Eye className="size-3.5" />} {preview ? 'Edit' : 'Preview'}
              </button>
            }
          >
            Engineer's notes
          </SectionTitle>
          {preview ? (
            <div className="prose-f1 min-h-[300px]" dangerouslySetInnerHTML={{ __html: md(notes || '_Nothing yet._') }} />
          ) : (
            <Textarea
              rows={16}
              value={notes}
              onChange={(e) => {
                setNotes(e.target.value);
                persist({ notes: e.target.value });
              }}
              placeholder={'## Approach\nWhat pattern? Why does it work?\n\n## Complexity\n| | |\n|---|---|\n| Time | O(n) |\n| Space | O(n) |\n\n## Mistakes I made'}
              className="font-mono text-[13px] leading-relaxed"
            />
          )}
          <p className="mt-2 text-[11px] text-ink-3">Markdown + tables. Saved automatically.</p>
        </Card>
      </div>
    </Page>
  );
}
