import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import { AnimatePresence, motion } from 'motion/react';
import { useQuery } from '@tanstack/react-query';
import DOMPurify from 'dompurify';
import { ArrowLeft, ChevronDown, ExternalLink, Eye, FlaskConical, Lightbulb, Pencil, Play, RotateCcw, Timer } from 'lucide-react';
import { api, useList, useResource } from '../../lib/api';
import type { DsaTest } from '../../lib/types';
import { Chequered } from '../../components/f1';
import { firstRevisit, md, useDsa, useSeason } from '../../lib/dsa';
import { MEGAS, WEEKS, findProblem } from '../../core/dsa/plan';
import { framesFromEvents, type Frame } from '../../core/dsa/viz';
import type { Lang } from '../../core/dsa/vizCode';
import type { DsaProgress } from '../../lib/types';
import { CodeView } from '../../components/CodeView';
import { FrameView, PlayerBar, usePlayer } from '../../components/VizStage';
import { Button, Card, Page, PageHeader, Rise, SectionTitle, Segmented, Textarea, cx } from '../../components/ui';
import { DiffChip, STATUS } from './shared';
import { CoachPanel, type JudgeSummary } from './Coach';

export type RunResult = { phase: 'compile' | 'run'; ok: boolean; exitCode: number | null; timedOut: boolean; stdout: string; stderr: string; events: unknown[]; ms: number; error?: string };

export const LANGS: { value: Lang; label: string }[] = [
  { value: 'cpp', label: 'C++' },
  { value: 'java', label: 'Java' },
  { value: 'py', label: 'Python' },
];
const SOL_KEY: Record<Lang, 'sol_cpp' | 'sol_java' | 'sol_py'> = { cpp: 'sol_cpp', java: 'sol_java', py: 'sol_py' };

// Earlier versions seeded the editor with a full stdin-reading program, and switching languages
// saved it as if it were the user's work. A saved solution that is still exactly one of these is
// treated as empty, so the problem opens on LeetCode's function template instead.
const LEGACY_STARTERS = [
  '// Write the LeetCode method here, plus a main() to run it locally.',
  'public static void main(String[] args) {\n        Scanner in = new Scanner(System.in);\n\n    }',
  'def main():\n    data = sys.stdin.read().split()\n\nmain()',
];
const isLegacyStarter = (code: string | null | undefined) => !!code && LEGACY_STARTERS.some((m) => code.includes(m)) && code.length < 320;

/** Used only when LeetCode's own template can't be loaded (offline before the first visit). */
const FALLBACK: Record<Lang, string> = {
  cpp: `class Solution {
public:
    // LeetCode's template for this problem couldn't be loaded — write the method here.
    // Example: vector<int> twoSum(vector<int>& nums, int target) { ... }
};
`,
  java: `class Solution {
    // LeetCode's template for this problem couldn't be loaded — write the method here.
    // Example: public int[] twoSum(int[] nums, int target) { ... }
}
`,
  py: `class Solution:
    # LeetCode's template for this problem couldn't be loaded — write the method here.
    # Example: def twoSum(self, nums: List[int], target: int) -> List[int]:
    pass
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
        <Textarea autoCorrect="off" autoCapitalize="off" spellCheck={false} rows={3} placeholder="stdin" value={stdin} onChange={(e) => setStdin(e.target.value)} className="font-mono text-label" />
        <Textarea autoCorrect="off" autoCapitalize="off" spellCheck={false} rows={3} placeholder="expected output (optional — checked on run)" value={expected} onChange={(e) => setExpected(e.target.value)} className="font-mono text-label" />
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
            <div className="flex flex-wrap items-center gap-2 text-mini font-bold uppercase">
              <span className={cx('slant px-2.5 py-0.5 text-black', res.ok ? 'bg-green' : res.timedOut ? 'bg-yellow' : 'bg-accent text-white')}>
                {res.phase === 'compile' ? 'Compile error' : res.timedOut ? 'Time limit' : res.ok ? 'Finished' : `Exit ${res.exitCode}`}
              </span>
              {verdict && <span className={cx('slant px-2.5 py-0.5 text-black', verdict === 'pass' ? 'bg-purple' : 'bg-accent text-white')}>{verdict === 'pass' ? 'Output matches' : 'Wrong answer'}</span>}
              <span className="font-mono text-ink-3">{res.ms} ms</span>
              {frames.length > 0 && <span className="font-mono text-ink-3">{frames.length} viz frames</span>}
            </div>
            {(res.stdout || res.stderr) && (
              <pre className="max-h-64 overflow-auto rounded-md border border-line bg-bg p-3 font-mono text-label leading-relaxed">
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

type LcQuestion = {
  id: string;
  title: string;
  difficulty: string;
  html: string;
  tags: string[];
  hints: string[];
  snippets: Partial<Record<Lang, string>>;
  exampleLines: string[];
  expected: string[];
  meta: { systemdesign?: boolean; params?: unknown[] };
  support: { ok: boolean; reason?: string };
};
type CaseResult = { input: string[]; expected?: string; output?: string; pass?: boolean };
type JudgeResult = RunResult & { results: CaseResult[] };

export function useQuestion(slug: string) {
  return useQuery({ queryKey: ['lc', slug], queryFn: () => api<LcQuestion>(`/lc/${slug}`), staleTime: Infinity, retry: 1 });
}

function Statement({ q, error }: { q?: LcQuestion; error?: Error | null }) {
  const [hints, setHints] = useState(0);
  const html = useMemo(() => (q ? DOMPurify.sanitize(q.html, { ADD_ATTR: ['target'] }) : ''), [q]);
  if (error) return <p className="text-sm text-warn">Couldn't load the statement: {error.message}. Open it on LeetCode instead — it'll be cached here once it loads.</p>;
  if (!q)
    return (
      <div className="space-y-3">
        {[80, 95, 60, 90, 70].map((w, i) => (
          <motion.div key={i} className="h-3 rounded bg-surface-2" style={{ width: `${w}%` }} animate={{ opacity: [0.4, 0.8, 0.4] }} transition={{ duration: 1.4, repeat: Infinity, delay: i * 0.1 }} />
        ))}
      </div>
    );
  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {q.tags.map((t) => (
          <span key={t} className="rounded bg-surface-2 px-2 py-0.5 text-tiny font-semibold text-ink-2">
            {t}
          </span>
        ))}
      </div>
      <div className="prose-f1 lc-statement" dangerouslySetInnerHTML={{ __html: html }} />
      {q.hints.length > 0 && (
        <div className="mt-4 space-y-2 border-t border-line pt-4">
          {q.hints.slice(0, hints).map((h, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="prose-f1 rounded-md border-l-[3px] border-yellow bg-bg px-3 py-2 text-sm" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(`<b>Hint ${i + 1}.</b> ${h}`) }} />
          ))}
          {hints < q.hints.length && (
            <Button size="sm" variant="ghost" onClick={() => setHints(hints + 1)}>
              <Lightbulb className="size-4 text-yellow" /> Reveal hint {hints + 1} of {q.hints.length}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

/** Runs the solution against LeetCode's examples (or custom input) with the generated harness. */
function JudgePanel({ slug, lang, code, q, onAllPass, onResult }: { slug: string; lang: Lang; code: string; q?: LcQuestion; onAllPass: () => void; onResult: (s: JudgeSummary) => void }) {
  const [res, setRes] = useState<JudgeResult | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [customOn, setCustomOn] = useState(false);
  const [custom, setCustom] = useState('');
  const [anyOrder, setAnyOrder] = useState(false);
  const [open, setOpen] = useState<number | null>(null);
  const [frames, setFrames] = useState<Frame[]>([]);
  const p = usePlayer(frames.length);
  useEffect(() => {
    if (q && !custom) setCustom(q.exampleLines.join('\n'));
  }, [q, custom]);

  const run = async () => {
    setRunning(true);
    setErr(null);
    try {
      const r = await api<JudgeResult>('/judge', { method: 'POST', body: JSON.stringify({ slug, lang, code, ignoreOrder: anyOrder, input: customOn ? custom : undefined }) });
      setRes(r);
      onResult({
        passed: r.results.filter((x) => x.pass).length,
        total: r.results.length,
        compileError: r.phase === 'compile' ? r.stderr : undefined,
        failing: r.results.find((x) => x.pass === false || x.output === undefined) ?? null,
        stderr: r.phase === 'run' && r.stderr ? r.stderr : undefined,
      });
      setFrames(framesFromEvents(r.events));
      const first = r.results.findIndex((x) => x.pass === false);
      setOpen(first >= 0 ? first : null);
      if (!customOn && r.results.length && r.results.every((x) => x.pass)) (navigator.vibrate?.([30, 40, 60]), onAllPass());
    } catch (e) {
      setErr((e as Error).message);
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

  if (q && !q.support.ok) return <p className="rounded-md border border-line bg-bg p-3 text-sm text-ink-2">Local judge: {q.support.reason}</p>;
  const passed = res?.results.filter((r) => r.pass).length ?? 0;
  const allPass = !!res && res.phase === 'run' && !customOn && res.results.length > 0 && passed === res.results.length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button className="h-11" onClick={() => void run()} disabled={running || !code.trim() || !q}>
          <FlaskConical className="size-4" /> {running ? 'Judging…' : customOn ? 'Run custom input' : `Run ${q ? Math.floor(q.exampleLines.length / (q.meta.systemdesign ? 2 : Math.max(1, q.meta.params?.length ?? 1))) : ''} examples`}
        </Button>
        <label className="flex items-center gap-1.5 text-xs font-semibold uppercase text-ink-3">
          <input type="checkbox" checked={customOn} onChange={(e) => setCustomOn(e.target.checked)} className="accent-[var(--accent)]" /> Custom input
        </label>
        <label className="flex items-center gap-1.5 text-xs font-semibold uppercase text-ink-3" title="For problems that accept the answer in any order">
          <input type="checkbox" checked={anyOrder} onChange={(e) => setAnyOrder(e.target.checked)} className="accent-[var(--accent)]" /> Any order
        </label>
        <span className="text-tiny text-ink-3 max-sm:hidden">Ctrl/⌘ + Enter</span>
      </div>
      {customOn && <Textarea autoCorrect="off" autoCapitalize="off" spellCheck={false} rows={4} value={custom} onChange={(e) => setCustom(e.target.value)} className="font-mono text-label" placeholder="One argument per line, LeetCode format" />}
      {err && <p className="text-sm text-warn">{err}</p>}
      <AnimatePresence>
        {res && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-2">
            {res.phase === 'compile' ? (
              <div className="rounded-md border border-accent/50 bg-bg p-3">
                <p className="mb-2 text-xs font-black uppercase tracking-widest text-accent-2">Compile error</p>
                <pre className="max-h-64 overflow-auto font-mono text-mini leading-relaxed text-ink-2">{res.stderr}</pre>
              </div>
            ) : (
              <>
                <div className={cx('flex items-center gap-3 rounded-md px-3 py-2.5', allPass ? 'bg-green/15' : 'bg-bg')}>
                  {allPass && <Chequered className="h-8 w-11" />}
                  <p className={cx('text-lg font-black italic uppercase', allPass ? 'text-green' : res.timedOut ? 'text-yellow' : 'text-ink')}>
                    {res.timedOut ? 'Time limit exceeded' : customOn ? `${res.results.length} case(s) ran` : `${passed}/${res.results.length} passed`}
                  </p>
                  <span className="ml-auto font-mono text-xs text-ink-3">{res.ms} ms</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {res.results.map((r, i) => (
                    <motion.button
                      key={i}
                      initial={{ scale: 0.5, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ delay: i * 0.06, type: 'spring', stiffness: 500, damping: 22 }}
                      onClick={() => setOpen(open === i ? null : i)}
                      className={cx('slant px-3 py-1 text-mini font-black italic', r.pass === true ? 'bg-green text-black' : r.pass === false ? 'bg-accent text-white' : r.output === undefined ? 'bg-yellow text-black' : 'bg-surface-2 text-ink', open === i && 'ring-2 ring-ink')}
                    >
                      Case {i + 1}
                    </motion.button>
                  ))}
                </div>
                {open !== null && res.results[open] && (
                  <div className="space-y-2 rounded-md border border-line bg-bg p-3 font-mono text-label">
                    <div>
                      <p className="mb-0.5 text-micro font-black uppercase tracking-widest text-ink-3">Input</p>
                      {res.results[open].input.map((l, i) => (
                        <p key={i} className="break-all text-ink-2">{l}</p>
                      ))}
                    </div>
                    {res.results[open].expected !== undefined && (
                      <div>
                        <p className="mb-0.5 text-micro font-black uppercase tracking-widest text-ink-3">Expected</p>
                        <p className="break-all text-green">{res.results[open].expected}</p>
                      </div>
                    )}
                    <div>
                      <p className="mb-0.5 text-micro font-black uppercase tracking-widest text-ink-3">Your output</p>
                      <p className={cx('break-all', res.results[open].pass === false ? 'text-accent-2' : 'text-ink')}>{res.results[open].output ?? '— no output (crashed or timed out before this case)'}</p>
                    </div>
                  </div>
                )}
                {(res.stdout || res.stderr) && (
                  <details className="rounded-md border border-line bg-bg p-3" open={!!res.stderr && !res.ok}>
                    <summary className="cursor-pointer text-tiny font-black uppercase tracking-widest text-ink-3">Console</summary>
                    <pre className="mt-2 max-h-56 overflow-auto font-mono text-mini leading-relaxed">
                      {res.stdout}
                      {res.stderr && <span className="text-accent-2">{(res.stdout ? '\n' : '') + res.stderr}</span>}
                    </pre>
                  </details>
                )}
                {frames.length > 0 && (
                  <div className="space-y-4 rounded-lg border border-line bg-bg p-4">
                    <FrameView frame={frames[p.i]} id="judge" />
                    <PlayerBar p={p} count={frames.length} msg={frames[p.i]?.msg} />
                  </div>
                )}
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** If a timed test containing this problem is running, show its clock and let a green run count. */
function useLiveTest(id: string) {
  const { data: tests = [] } = useList<DsaTest>('dsa_tests');
  const { update } = useResource<DsaTest>('dsa_tests');
  const live = tests.find((t) => !t.finished_at && Date.parse(t.started_at) + t.duration_min * 60_000 > Date.now());
  const inTest = live && (live.kind === 'mock' ? live.ref === id : (live.kind === 'weekly' ? WEEKS[Number(live.ref) - 1]?.test : MEGAS.find((m) => m.id === live.ref)?.problems)?.some((p) => p.id === id));
  const markSolved = () => {
    if (!live) return;
    const results = JSON.parse(live.results ?? '{}');
    update({ id: live.id, results: JSON.stringify({ ...results, [id]: { outcome: 'solved', at: Date.now() } }) });
  };
  return inTest ? { live, markSolved } : null;
}

function TestBanner({ test }: { test: NonNullable<ReturnType<typeof useLiveTest>> }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const left = Math.max(0, Date.parse(test.live.started_at) + test.live.duration_min * 60_000 - now) / 1000;
  return (
    <div className="sticky top-2 z-30 mb-4 flex items-center gap-3 rounded-lg border border-accent bg-bg/95 px-4 py-2.5 backdrop-blur">
      <span className="size-2 animate-pulse rounded-full bg-accent" />
      <span className="text-mini font-black uppercase italic tracking-wider">Test running</span>
      <span className="font-mono text-sm font-bold tabular-nums">
        {Math.floor(left / 3600)}:{String(Math.floor((left % 3600) / 60)).padStart(2, '0')}:{String(Math.floor(left % 60)).padStart(2, '0')}
      </span>
      <Link to={`/dsa/test/${test.live.kind}/${test.live.ref}`} className="ml-auto text-xs font-bold uppercase text-accent-2 hover:underline">
        Back to the grid
      </Link>
    </div>
  );
}

export function DsaProblem() {
  const id = useParams().id ?? '';
  const p = findProblem(id);
  const { get, save, ready } = useDsa();
  const { lang, setLang } = useSeason();
  const lc = useQuestion(id);
  const q = lc.data;
  const prog = get(id);
  const test = useLiveTest(id);
  const [code, setCode] = useState<string>('');
  const [notes, setNotes] = useState('');
  const [preview, setPreview] = useState(false);
  const [leftTab, setLeftTab] = useState<'statement' | 'notes' | 'coach'>('statement');
  const [mobileTab, setMobileTab] = useState<'problem' | 'code' | 'coach' | 'notes'>('problem');
  const [judge, setJudge] = useState<JudgeSummary | null>(null);
  const [timerStart, setTimerStart] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const [celebrate, setCelebrate] = useState(false);
  const loaded = useRef<string | null>(null);
  // The untouched template for the current language — never saved as if it were a solution.
  const pristine = useRef<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const lcSettled = lc.isSuccess || lc.isError;

  // Load once per (problem, language) after progress + statement arrive; from then on the editor
  // is the source of truth — re-syncing on every refetch would clobber what's being typed.
  // No saved solution → LeetCode's own template for that language, so it drops straight into the judge.
  useEffect(() => {
    const key = `${id}|${lang}`;
    if (!ready || !lcSettled || loaded.current === key) return;
    loaded.current = key;
    const saved = prog?.[SOL_KEY[lang]];
    const template = q?.snippets[lang] ?? FALLBACK[lang];
    const initial = saved && !isLegacyStarter(saved) ? saved : template;
    setCode(initial);
    pristine.current = initial === template ? template : null;
    setNotes(prog?.notes ?? '');
  }, [id, lang, prog, ready, lcSettled, q]);

  useEffect(() => {
    if (!timerStart) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [timerStart]);

  const persist = (patch: Partial<DsaProgress>) => {
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => save({ problem: id, ...patch }), 700);
  };
  const markSolved = () => {
    save({ problem: id, status: 'solved', ...(!prog?.solved_at ? { solved_at: new Date().toISOString(), revisit_at: firstRevisit(prog?.confidence ?? 2) } : {}), ...(timerStart ? { minutes: (prog?.minutes ?? 0) + Math.round((Date.now() - timerStart) / 60000) } : {}) });
    setTimerStart(null);
    test?.markSolved();
    setCelebrate(false);
  };

  if (!p) return <Page><PageHeader title="Unknown problem" /></Page>;
  const week = WEEKS.find((w) => w.n === p.week);
  const elapsed = timerStart ? Math.max(0, Math.floor((now - timerStart) / 1000)) : 0;

  const notesPanel = (
    <>
      <div className="mb-2 flex justify-end">
        <button onClick={() => setPreview(!preview)} className="flex items-center gap-1 text-xs font-bold uppercase text-ink-3 hover:text-ink">
          {preview ? <Pencil className="size-3.5" /> : <Eye className="size-3.5" />} {preview ? 'Edit' : 'Preview'}
        </button>
      </div>
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
          className="font-mono text-label leading-relaxed"
        />
      )}
      <p className="mt-2 text-tiny text-ink-3">Markdown + tables. Saved automatically.</p>
    </>
  );

  const coachPanel = (
    <CoachPanel
      slug={id}
      title={p.title}
      lang={lang}
      code={code}
      judge={judge}
      locked={!!test}
      onSaveToNotes={(text) => {
        const next = `${notes ? `${notes.trimEnd()}\n\n` : ''}${text}`;
        setNotes(next);
        save({ problem: id, notes: next });
        setLeftTab('notes');
        setMobileTab('notes');
      }}
    />
  );

  const codePanel = (
    <>
      <SectionTitle
        action={
          <div className="flex items-center gap-1">
            {q?.snippets[lang] && (
              <button
                onClick={() => (setCode(q.snippets[lang]!), (pristine.current = q.snippets[lang]!), persist({ [SOL_KEY[lang]]: null }))}
                className="mr-1 grid size-8 place-items-center rounded-md text-ink-3 hover:bg-surface-2 hover:text-ink"
                aria-label="Reset to the LeetCode template"
                title="Reset to the LeetCode template"
              >
                <RotateCcw className="size-4" />
              </button>
            )}
            <Segmented value={lang} onChange={(l) => (code !== pristine.current && save({ problem: id, [SOL_KEY[lang]]: code }), setLang(l), (loaded.current = null))} options={LANGS} />
          </div>
        }
      >
        Solution
      </SectionTitle>
      <CodeView
        lang={lang}
        value={code}
        minHeight={320}
        maxHeight={620}
        onChange={(v) => {
          setCode(v);
          persist({ [SOL_KEY[lang]]: v });
        }}
      />
      <div className="mt-4">
        <JudgePanel slug={id} lang={lang} code={code} q={q} onAllPass={() => setCelebrate(true)} onResult={setJudge} />
      </div>
      <details className="mt-4 rounded-md border border-line p-3">
        <summary className="flex cursor-pointer items-center gap-1 text-tiny font-black uppercase tracking-widest text-ink-3">
          <ChevronDown className="size-3.5" /> Raw run (full program + stdin)
        </summary>
        <div className="mt-3">
          <RunPanel lang={lang} code={code} />
        </div>
      </details>
    </>
  );

  return (
    <Page>
      {test && <TestBanner test={test} />}
      <Rise className="mb-3">
        <Link to={week ? `/dsa/week/${week.n}` : '/dsa'} className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-ink-3 hover:text-ink">
          <ArrowLeft className="size-4" /> {week ? `R${week.n} · ${week.gp} GP` : 'Season HQ'}
        </Link>
      </Rise>
      <PageHeader
        eyebrow={week?.topic ?? 'Test problem'}
        title={
          <span className="normal-case">
            {q && <span className="mr-2 text-ink-3">{q.id}.</span>}
            {p.title}
          </span>
        }
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
              onClick={() => (s.value === 'solved' ? markSolved() : save({ problem: id, status: s.value }))}
              className={cx('slant px-3 py-1 text-tiny font-black italic uppercase transition', (prog?.status ?? 'todo') === s.value ? 'text-black' : 'bg-surface-2 text-ink-3 hover:text-ink')}
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

      <AnimatePresence>
        {celebrate && (prog?.status ?? 'todo') !== 'solved' && (
          <motion.div initial={{ opacity: 0, y: -12, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -8 }} className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-green/50 bg-green/10 px-4 py-3">
            <Chequered className="h-9 w-12" />
            <p className="flex-1 font-black italic uppercase text-green">All examples green — {test ? 'count it on the test grid?' : 'mark it solved?'}</p>
            <Button onClick={markSolved}>Mark solved</Button>
            <Button variant="ghost" onClick={() => setCelebrate(false)}>
              Not yet
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Phone: one panel at a time */}
      <div className="xl:hidden">
        <Segmented
          className="sticky top-2 z-20 mb-3 w-full"
          value={mobileTab}
          onChange={setMobileTab}
          options={[
            { value: 'problem', label: 'Problem' },
            { value: 'code', label: 'Code' },
            { value: 'coach', label: 'Coach' },
            { value: 'notes', label: 'Notes' },
          ]}
        />
        <Card>{mobileTab === 'problem' ? <Statement q={q} error={lc.error} /> : mobileTab === 'code' ? codePanel : mobileTab === 'coach' ? coachPanel : notesPanel}</Card>
      </div>

      {/* Desktop: statement/notes beside the editor */}
      <div className="hidden gap-4 xl:grid xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <Card className="self-start xl:sticky xl:top-16 xl:max-h-[calc(100dvh-5rem)] xl:overflow-y-auto">
          <Segmented
            className="mb-4"
            value={leftTab}
            onChange={setLeftTab}
            options={[
              { value: 'statement', label: 'Statement' },
              { value: 'coach', label: 'Pit radio' },
              { value: 'notes', label: "Engineer's notes" },
            ]}
          />
          {leftTab === 'statement' ? <Statement q={q} error={lc.error} /> : leftTab === 'coach' ? coachPanel : notesPanel}
        </Card>
        <Card>{codePanel}</Card>
      </div>
    </Page>
  );
}
