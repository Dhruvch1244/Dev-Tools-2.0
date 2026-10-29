import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeft, ArrowUp, Flag, Radio, Square, Timer } from 'lucide-react';
import { api, useList, useResource } from '../../lib/api';
import { streamCoach } from '../../lib/coach';
import { md, useSeason } from '../../lib/dsa';
import { findProblem } from '../../core/dsa/plan';
import type { DsaTest } from '../../lib/types';
import { CodeView } from '../../components/CodeView';
import { Mic } from '../../components/Mic';
import { Button, Card, Page, PageHeader, Segmented, cx } from '../../components/ui';
import { useToast } from '../../components/toast';
import { DiffChip } from './shared';
import { JudgePanel, LANGS, Statement, useQuestion } from './Problem';
import type { JudgeSummary } from './Coach';

type Msg = { role: 'user' | 'interviewer'; text: string; error?: boolean };
type Score = { verdict: string; scores: Record<string, number>; hints_used: number; strengths: string[]; improve: string[]; summary: string; next: string };
const STAGES = ['clarify', 'approach', 'code', 'test', 'wrap'] as const;
const STAGE_LABEL: Record<(typeof STAGES)[number], string> = { clarify: 'Clarify', approach: 'Approach', code: 'Code', test: 'Test', wrap: 'Wrap-up' };
const OPENING = "Hi! I'll be your interviewer today. Take a minute to read the problem. When you're ready, tell me in your own words what it's asking, and ask me anything about the input or edge cases. Think out loud as you go. That's what I'm assessing.";
const tagOf = (t: string) => /\[\[stage:(\w+)\]\]/.exec(t)?.[1] as (typeof STAGES)[number] | undefined;
const clean = (t: string) => t.replace(/\[\[stage:\w*\]?\]?\s*$/m, '').replace(/\[\[stage:\w+\]\]/g, '').trim();
const store = (k: string, v: unknown) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {}
};
const load = <T,>(k: string, d: T): T => {
  try {
    return JSON.parse(localStorage.getItem(k) ?? 'null') ?? d;
  } catch {
    return d;
  }
};

/**
 * Mock interview room: an AI interviewer runs the session (clarify → approach → code → test →
 * wrap-up) while you code and run the examples; at the end it writes a hiring-committee scorecard.
 */
export function DsaInterview() {
  const id = useParams().id ?? '';
  const p = findProblem(id);
  const lc = useQuestion(id);
  const q = lc.data;
  const toast = useToast();
  const { lang, setLang } = useSeason();
  const { data: tests = [] } = useList<DsaTest>('dsa_tests');
  const { create, update } = useResource<DsaTest>('dsa_tests');
  const test = tests.find((t) => t.kind === 'mock' && t.ref === id && !t.finished_at);
  const done = tests.filter((t) => t.kind === 'mock' && t.ref === id && t.finished_at).sort((a, b) => b.started_at.localeCompare(a.started_at))[0];
  const key = test ? `interview:${test.id}` : '';
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [code, setCode] = useState('');
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [judge, setJudge] = useState<JudgeSummary | null>(null);
  const [now, setNow] = useState(Date.now());
  const [tab, setTab] = useState<'talk' | 'problem' | 'code'>('talk');
  const [scoring, setScoring] = useState(false);
  const [score, setScore] = useState<Score | null>(null);
  const ctl = useRef<AbortController | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const loaded = useRef('');

  // Restore an interview in progress (transcript + code survive a reload).
  useEffect(() => {
    if (!test || !q || loaded.current === test.id) return;
    loaded.current = test.id;
    setMsgs(load<Msg[]>(`${key}:msgs`, [{ role: 'interviewer', text: OPENING }]));
    setCode(load(`${key}:code`, q.snippets[lang] ?? ''));
  }, [test, q, key, lang]);
  useEffect(() => void (key && store(`${key}:msgs`, msgs)), [key, msgs]);
  useEffect(() => void (key && store(`${key}:code`, code)), [key, code]);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [msgs]);
  useEffect(() => {
    if (done?.results && !score) {
      const r = JSON.parse(done.results);
      if (r.interview) setScore(r.interview);
    }
  }, [done, score]);

  if (!p) return <Page><PageHeader title="Unknown problem" /></Page>;
  const elapsed = test ? Math.max(0, (now - Date.parse(test.started_at)) / 60000) : 0;
  const left = test ? Math.max(0, test.duration_min * 60 - Math.floor((now - Date.parse(test.started_at)) / 1000)) : 0;
  const stage = [...msgs].reverse().map((m) => (m.role === 'interviewer' ? tagOf(m.text) : undefined)).find(Boolean) ?? 'clarify';
  const payload = (message: string) => ({ slug: id, title: p.title, lang, code, judge: judge ?? undefined, history: msgs.filter((m) => !m.error).map((m) => ({ role: m.role, text: clean(m.text) })), message, elapsedMin: elapsed, durationMin: test?.duration_min ?? 45 });

  const start = async (mins: number) => {
    setScore(null);
    await create({ kind: 'mock', ref: id, started_at: new Date().toISOString(), duration_min: mins, results: '{}' });
  };
  const say = async (text: string) => {
    const message = text.trim();
    if (!message || busy || !test) return;
    setMsgs((m) => [...m, { role: 'user', text: message }, { role: 'interviewer', text: '' }]);
    setInput('');
    setBusy(true);
    ctl.current = new AbortController();
    const patch = (fn: (m: Msg) => Msg) => setMsgs((all) => [...all.slice(0, -1), fn(all[all.length - 1])]);
    try {
      await streamCoach('interview', payload(message), (d) => patch((m) => ({ ...m, text: m.text + d })), ctl.current.signal);
    } catch (e) {
      if ((e as Error).name !== 'AbortError') patch((m) => ({ ...m, error: true, text: m.text || (e as Error).message }));
    } finally {
      setBusy(false);
    }
  };
  const finish = async () => {
    if (!test) return;
    ctl.current?.abort();
    setScoring(true);
    try {
      const s = await api<Score>('/dsa/mock/score', { method: 'POST', body: JSON.stringify(payload('(end)')) });
      const avg = Object.values(s.scores).reduce((a, b) => a + b, 0) / 5;
      update({ id: test.id, finished_at: new Date().toISOString(), score: Math.round(avg * 25), results: JSON.stringify({ [id]: judge && judge.total && judge.passed === judge.total ? { solved: true } : {}, interview: s, transcript: msgs.map((m) => ({ role: m.role, text: clean(m.text) })) }) });
      setScore(s);
    } catch (e) {
      toast({ message: `Couldn't score: ${(e as Error).message}` });
    } finally {
      setScoring(false);
    }
  };

  const mm = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;

  const talk = (
    <div className="flex h-full min-h-[420px] flex-col">
      <div className="mb-3 flex gap-1">
        {STAGES.map((s, i) => (
          <div key={s} className="flex-1">
            <div className={cx('h-1.5 -skew-x-12', STAGES.indexOf(stage) >= i ? 'bg-accent' : 'bg-surface-2')} />
            <p className={cx('mt-1 text-center text-micro font-bold uppercase', stage === s ? 'text-ink' : 'text-ink-3')}>{STAGE_LABEL[s]}</p>
          </div>
        ))}
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
        {msgs.map((m, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className={cx('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
            {m.role === 'user' ? (
              <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-accent px-3.5 py-2 text-white">{m.text}</p>
            ) : (
              <div className={cx('max-w-[92%] rounded-2xl rounded-bl-sm border bg-bg px-3.5 py-2.5', m.error ? 'border-accent/50' : 'border-line')}>
                <p className="mb-0.5 flex items-center gap-1 text-micro font-black uppercase tracking-[0.2em] text-sky">
                  <Radio className="size-3" /> Interviewer
                </p>
                {m.text ? <div className="prose-f1 text-[15px]" dangerouslySetInnerHTML={{ __html: md(clean(m.text)) }} /> : <motion.p className="text-sm text-ink-3" animate={{ opacity: [0.4, 1, 0.4] }} transition={{ repeat: Infinity, duration: 1.3 }}>…</motion.p>}
              </div>
            )}
          </motion.div>
        ))}
        <div ref={end} />
      </div>
      <form onSubmit={(e) => (e.preventDefault(), void say(input))} className="mt-3 flex items-end gap-2">
        <textarea
          rows={2}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && (e.preventDefault(), void say(input))}
          placeholder="Think out loud — your approach, questions, complexity…"
          className="field min-h-11 flex-1 resize-none text-base"
          disabled={!test}
        />
        <Mic value={input} onChange={setInput} />
        <button type={busy ? 'button' : 'submit'} onClick={busy ? () => ctl.current?.abort() : undefined} disabled={!test || (!busy && !input.trim())} aria-label={busy ? 'Stop' : 'Send'} className="grid size-11 shrink-0 place-items-center rounded-xl bg-accent text-white disabled:opacity-40">
          {busy ? <Square className="size-4" fill="currentColor" /> : <ArrowUp className="size-5" />}
        </button>
      </form>
      {test && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {['Here’s my brute force idea:', 'Can I assume the input fits in memory?', 'I think the optimal is O(n) because…', 'I’m done coding. Let me dry-run an example.'].map((s) => (
            <button key={s} onClick={() => setInput(s + ' ')} className="rounded-md bg-surface-2 px-2.5 py-1 text-tiny text-ink-2">
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );

  const editor = (
    <>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-micro font-black uppercase tracking-[0.2em] text-ink-3">Your code</p>
        <Segmented value={lang} onChange={(l) => (setLang(l), q?.snippets[l] && !code.trim() && setCode(q.snippets[l]!))} options={LANGS} />
      </div>
      <CodeView lang={lang} value={code} minHeight={300} maxHeight={560} onChange={setCode} />
      <div className="mt-3">
        <JudgePanel slug={id} lang={lang} code={code} q={q} onAllPass={() => toast({ message: 'All examples green — tell the interviewer and walk through edge cases' })} onResult={setJudge} />
      </div>
    </>
  );

  return (
    <Page>
      <Link to="/dsa" className="mb-3 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-ink-3 hover:text-ink">
        <ArrowLeft className="size-4" /> Season HQ
      </Link>
      <PageHeader
        eyebrow="Mock interview"
        title={<span className="normal-case">{p.title}</span>}
        action={
          test ? (
            <div className="flex items-center gap-2">
              <span className={cx('flex items-center gap-1.5 rounded-md px-3 py-2 font-mono text-lg font-bold', left < 300 ? 'bg-accent text-white' : 'bg-surface-2')}>
                <Timer className="size-4" /> {mm}
              </span>
              <Button variant="danger" disabled={scoring} onClick={() => void finish()}>
                <Flag className="size-4" /> {scoring ? 'Scoring…' : 'End & score'}
              </Button>
            </div>
          ) : undefined
        }
      />
      <div className="-mt-3 mb-4 flex items-center gap-2">
        <DiffChip d={p.diff} />
        {test && left === 0 && <span className="text-sm font-bold text-accent">Time's up — wrap up and end the interview.</span>}
      </div>

      <AnimatePresence>
        {score && !test && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-4 rounded-xl border border-line bg-surface p-5">
            <p className="text-micro font-black uppercase tracking-[0.25em] text-ink-3">Hiring committee</p>
            <p className={cx('text-3xl font-black italic uppercase', /strong|^hire/i.test(score.verdict) ? 'text-green' : /lean hire/i.test(score.verdict) ? 'text-yellow' : 'text-accent')}>{score.verdict}</p>
            <div className="mt-3 grid grid-cols-5 gap-2">
              {Object.entries(score.scores).map(([k, v]) => (
                <div key={k}>
                  <div className="flex gap-0.5">
                    {[1, 2, 3, 4].map((n) => (
                      <span key={n} className={cx('h-2 flex-1 -skew-x-12', n <= v ? (v >= 3 ? 'bg-green' : v === 2 ? 'bg-yellow' : 'bg-accent') : 'bg-surface-2')} />
                    ))}
                  </div>
                  <p className="mt-1 text-micro font-bold uppercase text-ink-3">{k.replace('_', ' ')}</p>
                </div>
              ))}
            </div>
            <p className="mt-3 text-[15px]">{score.summary}</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <p className="text-micro font-black uppercase text-green">Strengths</p>
                <ul className="mt-1 list-disc pl-5 text-sm text-ink-2">{score.strengths.map((s) => <li key={s}>{s}</li>)}</ul>
              </div>
              <div>
                <p className="text-micro font-black uppercase text-accent">Work on</p>
                <ul className="mt-1 list-disc pl-5 text-sm text-ink-2">{score.improve.map((s) => <li key={s}>{s}</li>)}</ul>
              </div>
            </div>
            {score.next && <p className="mt-3 rounded-md bg-bg p-3 text-sm"><b>Next:</b> {score.next}</p>}
            {score.hints_used > 0 && <p className="mt-2 text-tiny text-ink-3">Nudges taken: {score.hints_used}</p>}
          </motion.div>
        )}
      </AnimatePresence>

      {!test ? (
        <Card className="text-center">
          <p className="text-xl font-black italic uppercase">{score ? 'Run it again?' : 'Ready when you are'}</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-ink-3">An AI interviewer runs it like the real thing: clarify, approach, code, test. No solutions handed out, nudges cost points, and you get a scorecard at the end. Think out loud. Typing or the mic both work.</p>
          <div className="mt-4 flex justify-center gap-2">
            {[30, 45, 60].map((n) => (
              <Button key={n} variant={n === (p.diff === 'H' ? 60 : 45) ? 'primary' : 'soft'} onClick={() => void start(n)}>
                <Timer className="size-4" /> {n} min
              </Button>
            ))}
          </div>
        </Card>
      ) : (
        <>
          <div className="xl:hidden">
            <Segmented className="sticky top-2 z-20 mb-3 w-full" value={tab} onChange={setTab} options={[{ value: 'talk', label: 'Interviewer' }, { value: 'problem', label: 'Problem' }, { value: 'code', label: 'Code' }]} />
            <Card>{tab === 'talk' ? talk : tab === 'problem' ? <Statement q={q} error={lc.error} /> : editor}</Card>
          </div>
          <div className="hidden gap-4 xl:grid xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
            <div className="space-y-4">
              <Card className="max-h-[38vh] overflow-y-auto">
                <Statement q={q} error={lc.error} />
              </Card>
              <Card className="h-[calc(62vh-6rem)]">{talk}</Card>
            </div>
            <Card>{editor}</Card>
          </div>
        </>
      )}
    </Page>
  );
}
