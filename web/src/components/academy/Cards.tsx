import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowRight, Check, CircleX, Lightbulb, Play, Timer, X } from 'lucide-react';
import { md } from '../../lib/dsa';
import { haptic } from '../../lib/format';
import { ALGOS, type Algo } from '../../core/dsa/viz';
import { COURSE_ALGOS } from '../../core/dsa/courseViz';
import { predictQuestions, shuffled, type Card } from '../../core/dsa/course';
import { FrameView, PlayerBar, usePlayer } from '../VizStage';
import { Button, cx } from '../ui';

export type Answer = (correct: boolean) => void;
type Props<K extends Card['kind']> = { card: Extract<Card, { kind: K }>; seed: number; onAnswer: Answer; onNext: () => void };

const algoOf = (id: string): Algo | undefined => [...ALGOS, ...COURSE_ALGOS].find((a) => a.id === id);
function useFrames(id: string, inputs?: Record<string, string>) {
  return useMemo(() => {
    const a = algoOf(id);
    if (!a) return [];
    try {
      return a.run({ ...Object.fromEntries(a.inputs.map((i) => [i.key, i.value])), ...inputs });
    } catch {
      return [];
    }
  }, [id, inputs]);
}

// ---------------------------------------------------------------------------------------------
// Shared bits
// ---------------------------------------------------------------------------------------------
export function Next({ onNext, label = 'Continue', disabled }: { onNext: () => void; label?: string; disabled?: boolean }) {
  return (
    <Button className="h-12 w-full text-base" disabled={disabled} onClick={onNext}>
      {label} <ArrowRight className="size-4" />
    </Button>
  );
}

/** Green/red banner after an answer, with the why. */
export function Verdict({ ok, why, extra }: { ok: boolean; why?: string; extra?: string }) {
  return (
    <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} className={cx('rounded-xl border p-3', ok ? 'border-green/40 bg-green/10' : 'border-accent/40 bg-accent/10')}>
      <p className={cx('flex items-center gap-2 font-black italic uppercase', ok ? 'text-green' : 'text-accent')}>
        {ok ? <Check className="size-5" /> : <CircleX className="size-5" />} {ok ? 'Purple sector!' : 'Not quite'}
      </p>
      {why && <p className="mt-1 text-sm text-ink-2">{why}</p>}
      {extra && <p className="mt-1 font-mono text-tiny text-ink">{extra}</p>}
    </motion.div>
  );
}

type ChoiceState = 'idle' | 'right' | 'wrong' | 'dim';
function Choice({ state, onClick, children, mono }: { state: ChoiceState; onClick?: () => void; children: React.ReactNode; mono?: boolean }) {
  return (
    <motion.button
      type="button"
      whileTap={state === 'idle' ? { scale: 0.97 } : undefined}
      animate={state === 'wrong' ? { x: [0, -8, 8, -5, 5, 0] } : state === 'right' ? { scale: [1, 1.03, 1] } : {}}
      transition={{ duration: 0.35 }}
      disabled={state !== 'idle'}
      onClick={onClick}
      className={cx(
        'w-full rounded-xl border-2 px-4 py-3 text-left text-[15px] font-semibold transition-colors',
        mono && 'font-mono text-sm',
        state === 'idle' && 'border-line bg-surface hover:border-line-strong active:bg-surface-2',
        state === 'right' && 'border-green bg-green/15 text-green',
        state === 'wrong' && 'border-accent bg-accent/15 text-accent',
        state === 'dim' && 'border-line bg-surface opacity-45',
      )}
    >
      {children}
    </motion.button>
  );
}

function CodeBlock({ code }: { code: string }) {
  return <pre className="overflow-x-auto rounded-lg border border-line bg-bg p-3 font-mono text-[13px] leading-relaxed text-ink">{code}</pre>;
}

// ---------------------------------------------------------------------------------------------
// Learn & sim
// ---------------------------------------------------------------------------------------------
function MiniSim({ algo, inputs, auto }: { algo: string; inputs?: Record<string, string>; auto?: boolean }) {
  const frames = useFrames(algo, inputs);
  const p = usePlayer(frames.length);
  useEffect(() => {
    if (auto && !matchMedia('(prefers-reduced-motion: reduce)').matches) p.setPlaying(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto, frames.length]);
  const f = frames[p.i];
  if (!f) return null;
  return (
    <div className="space-y-3 rounded-xl border border-line bg-surface p-3">
      <FrameView frame={f} id={`mini-${algo}`} />
      <PlayerBar p={p} count={frames.length} msg={f.msg} />
    </div>
  );
}

export function LearnCard({ card, onNext }: Props<'learn'>) {
  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-black italic uppercase leading-tight">{card.title}</h2>
      <div className="prose-f1 text-[15px] leading-relaxed" dangerouslySetInnerHTML={{ __html: md(card.body) }} />
      {card.viz && <MiniSim algo={card.viz.algo} inputs={card.viz.inputs} />}
      <Next onNext={onNext} label="Got it" />
    </div>
  );
}

export function SimCard({ card, onNext }: Props<'sim'>) {
  const frames = useFrames(card.algo, card.inputs);
  const p = usePlayer(frames.length);
  const [seenEnd, setSeenEnd] = useState(false);
  useEffect(() => void (p.i >= frames.length - 1 && setSeenEnd(true)), [p.i, frames.length]);
  const f = frames[p.i];
  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-black italic uppercase leading-tight">{card.title}</h2>
      <p className="flex gap-2 text-sm text-ink-2">
        <Play className="mt-0.5 size-4 shrink-0 text-accent" /> {card.intro}
      </p>
      {f && (
        <div className="space-y-3 rounded-xl border border-line bg-surface p-3">
          <FrameView frame={f} id={`sim-${card.algo}`} />
          <PlayerBar p={p} count={frames.length} msg={f.msg} />
        </div>
      )}
      <Next onNext={onNext} label={seenEnd ? 'Continue' : 'Skip ahead'} />
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Predict the next step
// ---------------------------------------------------------------------------------------------
export function PredictCard({ card, seed, onAnswer, onNext }: Props<'predict'>) {
  const frames = useFrames(card.algo, card.inputs);
  const qs = useMemo(() => predictQuestions(frames, card.var, card.questions ?? 3, seed), [frames, card.var, card.questions, seed]);
  const [qi, setQi] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const q = qs[qi];
  if (!q) return <Next onNext={onNext} />;
  const shown = picked == null ? frames[q.at] : frames[q.at + 1];
  const pick = (v: number) => {
    setPicked(v);
    onAnswer(v === q.answer);
  };
  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-2xl font-black italic uppercase leading-tight">{card.title}</h2>
        <span className="font-mono text-sm text-ink-3">
          {qi + 1}/{qs.length}
        </span>
      </div>
      <div className="space-y-3 rounded-xl border border-line bg-surface p-3">
        <FrameView frame={shown} id={`pred-${card.algo}`} />
        <AnimatePresence mode="wait">
          <motion.p key={`${qi}-${picked != null}`} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} className="border-l-[3px] border-accent bg-bg px-3 py-2 text-[14px] leading-snug">
            {shown.msg}
          </motion.p>
        </AnimatePresence>
      </div>
      <p className="font-bold">
        One step forward — what will <span className="rounded bg-ink px-1.5 font-mono text-bg">{card.var}</span> be?
      </p>
      <div className="grid grid-cols-2 gap-2">
        {q.choices.map((c) => (
          <Choice key={c} mono state={picked == null ? 'idle' : c === q.answer ? 'right' : c === picked ? 'wrong' : 'dim'} onClick={() => pick(c)}>
            {c}
          </Choice>
        ))}
      </div>
      {picked != null && (
        <>
          <Verdict ok={picked === q.answer} extra={picked === q.answer ? undefined : `It becomes ${q.answer}.`} />
          <Next onNext={() => (qi + 1 < qs.length ? (setQi(qi + 1), setPicked(null)) : onNext())} label={qi + 1 < qs.length ? 'Next step' : 'Continue'} />
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Multiple choice, fill the blank, spot the bug
// ---------------------------------------------------------------------------------------------
export function McqCard({ card, seed, onAnswer, onNext }: Props<'mcq'>) {
  const order = useMemo(() => shuffled(card.choices.map((_, i) => i), seed), [card, seed]);
  const [picked, setPicked] = useState<number | null>(null);
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold leading-snug">{card.q}</h2>
      {card.code && <CodeBlock code={card.code} />}
      <div className="space-y-2">
        {order.map((i) => (
          <Choice key={i} state={picked == null ? 'idle' : i === card.answer ? 'right' : i === picked ? 'wrong' : 'dim'} onClick={() => (setPicked(i), onAnswer(i === card.answer))}>
            {card.choices[i]}
          </Choice>
        ))}
      </div>
      {picked != null && (
        <>
          <Verdict ok={picked === card.answer} why={card.why} />
          <Next onNext={onNext} />
        </>
      )}
    </div>
  );
}

export function BlankCard({ card, seed, onAnswer, onNext }: Props<'blank'>) {
  const order = useMemo(() => shuffled(card.choices.map((_, i) => i), seed), [card, seed]);
  const [picked, setPicked] = useState<number | null>(null);
  const [before, after] = card.code.split('____');
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold leading-snug">{card.title}</h2>
      <pre className="overflow-x-auto rounded-lg border border-line bg-bg p-3 font-mono text-[13px] leading-relaxed">
        {before}
        <motion.span key={picked ?? 'blank'} initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className={cx('inline-block rounded px-1.5', picked == null ? 'bg-accent/25 text-accent' : picked === card.answer ? 'bg-green/25 text-green' : 'bg-accent/25 text-accent line-through')}>
          {picked == null ? '____' : card.choices[picked]}
        </motion.span>
        {after}
      </pre>
      <div className="grid grid-cols-2 gap-2">
        {order.map((i) => (
          <Choice key={i} mono state={picked == null ? 'idle' : i === card.answer ? 'right' : i === picked ? 'wrong' : 'dim'} onClick={() => (setPicked(i), onAnswer(i === card.answer))}>
            {card.choices[i]}
          </Choice>
        ))}
      </div>
      {picked != null && (
        <>
          <Verdict ok={picked === card.answer} why={card.why} />
          <Next onNext={onNext} />
        </>
      )}
    </div>
  );
}

export function BugCard({ card, onAnswer, onNext }: Props<'bug'>) {
  const lines = card.code.split('\n');
  const [picked, setPicked] = useState<number | null>(null);
  return (
    <div className="space-y-4">
      <h2 className="flex gap-2 text-xl font-bold leading-snug">
        <span className="slant shrink-0 self-start bg-accent px-1.5 text-micro font-black text-white">DEBUG</span> {card.title}
      </h2>
      <div className="overflow-x-auto rounded-lg border border-line bg-bg py-2 font-mono text-[13px]">
        {lines.map((l, i) => {
          const st = picked == null ? 'idle' : i === card.bug ? 'bug' : i === picked ? 'wrong' : 'dim';
          return (
            <motion.button
              key={i}
              disabled={picked != null}
              onClick={() => (setPicked(i), onAnswer(i === card.bug), haptic(8))}
              animate={st === 'wrong' ? { x: [0, -6, 6, -3, 3, 0] } : {}}
              className={cx('flex w-full gap-3 px-3 py-1 text-left whitespace-pre transition-colors', st === 'idle' && 'hover:bg-surface-2 active:bg-surface-2', st === 'bug' && 'bg-accent/20 text-accent', st === 'wrong' && 'bg-yellow/10 text-yellow', st === 'dim' && 'opacity-50')}
            >
              <span className="w-5 shrink-0 text-right text-ink-3">{i + 1}</span>
              <span>{l || ' '}</span>
            </motion.button>
          );
        })}
      </div>
      {picked != null && (
        <>
          <Verdict ok={picked === card.bug} why={card.why} />
          <div className="flex gap-2 rounded-lg bg-green/10 p-3 text-sm">
            <Lightbulb className="mt-0.5 size-4 shrink-0 text-green" />
            <span className="prose-f1" dangerouslySetInnerHTML={{ __html: md(`**Fix:** ${card.fix}`) }} />
          </div>
          <Next onNext={onNext} />
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Match pairs, order the lines
// ---------------------------------------------------------------------------------------------
export function MatchCard({ card, seed, onAnswer, onNext }: Props<'match'>) {
  const right = useMemo(() => shuffled(card.pairs.map((_, i) => i), seed), [card, seed]);
  const [sel, setSel] = useState<number | null>(null);
  const [done, setDone] = useState<Set<number>>(new Set());
  const [bad, setBad] = useState<number | null>(null);
  const tryMatch = (r: number) => {
    if (sel == null) return;
    if (r === sel) {
      setDone((d) => new Set([...d, r]));
      onAnswer(true);
      haptic(10);
    } else {
      setBad(r);
      onAnswer(false);
      setTimeout(() => setBad(null), 450);
    }
    setSel(null);
  };
  const all = done.size === card.pairs.length;
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold leading-snug">{card.title}</h2>
      <p className="text-tiny text-ink-3">Tap a problem, then what it needs.</p>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-2">
          {card.pairs.map(([l], i) => (
            <motion.button key={l} layout disabled={done.has(i)} onClick={() => setSel(i)} className={cx('min-h-16 w-full rounded-xl border-2 p-2.5 text-left text-sm font-semibold', done.has(i) ? 'border-green/40 bg-green/10 text-green' : sel === i ? 'border-accent bg-accent/10' : 'border-line bg-surface')}>
              {l}
            </motion.button>
          ))}
        </div>
        <div className="space-y-2">
          {right.map((i) => (
            <motion.button key={i} layout disabled={done.has(i) || sel == null} onClick={() => tryMatch(i)} animate={bad === i ? { x: [0, -6, 6, -3, 3, 0] } : {}} className={cx('min-h-16 w-full rounded-xl border-2 p-2.5 text-left text-sm', done.has(i) ? 'border-green/40 bg-green/10 text-green' : bad === i ? 'border-accent bg-accent/10' : 'border-line bg-bg', sel == null && !done.has(i) && 'opacity-70')}>
              {card.pairs[i][1]}
            </motion.button>
          ))}
        </div>
      </div>
      {all && (
        <>
          <Verdict ok why="All matched." />
          <Next onNext={onNext} />
        </>
      )}
    </div>
  );
}

export function OrderCard({ card, seed, onAnswer, onNext }: Props<'order'>) {
  const bank = useMemo(() => shuffled(card.lines.map((_, i) => i), seed), [card, seed]);
  const [placed, setPlaced] = useState<number[]>([]);
  const [bad, setBad] = useState<number | null>(null);
  const tap = (i: number) => {
    if (i === placed.length) {
      setPlaced((p) => [...p, i]);
      onAnswer(true);
      haptic(8);
    } else {
      setBad(i);
      onAnswer(false);
      setTimeout(() => setBad(null), 450);
    }
  };
  const all = placed.length === card.lines.length;
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold leading-snug">{card.title}</h2>
      <div className="min-h-24 rounded-lg border border-line bg-bg py-2 font-mono text-[13px]">
        <AnimatePresence>
          {placed.map((i) => (
            <motion.div key={i} layoutId={`line-${i}`} className="whitespace-pre px-3 py-0.5 text-green">
              {card.lines[i]}
            </motion.div>
          ))}
        </AnimatePresence>
        {!all && <p className="px-3 py-0.5 text-ink-3">▍ tap the next line…</p>}
      </div>
      <div className="space-y-1.5">
        {bank
          .filter((i) => !placed.includes(i))
          .map((i) => (
            <motion.button key={i} layoutId={`line-${i}`} onClick={() => tap(i)} animate={bad === i ? { x: [0, -6, 6, -3, 3, 0] } : {}} className={cx('block w-full overflow-x-auto whitespace-pre rounded-lg border px-3 py-2 text-left font-mono text-[13px]', bad === i ? 'border-accent bg-accent/10' : 'border-line bg-surface')}>
              {card.lines[i].trimStart()}
            </motion.button>
          ))}
      </div>
      {all && (
        <>
          <Verdict ok why={card.why} />
          <Next onNext={onNext} />
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Speed round
// ---------------------------------------------------------------------------------------------
export function SpeedCard({ card, onAnswer, onNext }: Props<'speed'>) {
  const [started, setStarted] = useState(false);
  const [i, setI] = useState(0);
  const [left, setLeft] = useState(card.seconds);
  const [score, setScore] = useState(0);
  const [flash, setFlash] = useState<'right' | 'wrong' | null>(null);
  const over = i >= card.items.length || left <= 0;
  const reported = useRef(false);
  useEffect(() => {
    if (!started || over) return;
    const id = setInterval(() => setLeft((s) => s - 1), 1000);
    return () => clearInterval(id);
  }, [started, over]);
  // Questions the clock ran out on count as misses.
  useEffect(() => {
    if (over && started && !reported.current) {
      reported.current = true;
      for (let k = i; k < card.items.length; k++) onAnswer(false);
    }
  }, [over, started, i, card.items.length, onAnswer]);
  const pick = (c: number) => {
    const ok = c === card.items[i].answer;
    onAnswer(ok);
    if (ok) setScore((s) => s + 1);
    setFlash(ok ? 'right' : 'wrong');
    haptic(ok ? 8 : 20);
    setTimeout(() => (setFlash(null), setI((x) => x + 1)), 280);
  };
  if (!started)
    return (
      <div className="space-y-5 text-center">
        <h2 className="text-2xl font-black italic uppercase">{card.title}</h2>
        <p className="text-ink-2">
          {card.items.length} questions · {card.seconds} seconds. Wrong answers and time-outs cost tyres.
        </p>
        <Button className="h-14 w-full text-base" onClick={() => setStarted(true)}>
          <Timer className="size-5" /> Lights out
        </Button>
      </div>
    );
  const it = card.items[Math.min(i, card.items.length - 1)];
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
          <motion.div className={cx('h-full', left <= 10 ? 'bg-accent' : 'bg-yellow')} animate={{ width: `${(left / card.seconds) * 100}%` }} transition={{ ease: 'linear', duration: 1 }} />
        </div>
        <span className={cx('w-10 text-right font-mono font-bold tabular-nums', left <= 10 && 'text-accent')}>{Math.max(0, left)}s</span>
      </div>
      {!over ? (
        <AnimatePresence mode="wait">
          <motion.div key={i} initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }} transition={{ duration: 0.15 }} className="space-y-3">
            <p className="text-micro font-black uppercase tracking-[0.2em] text-ink-3">
              {i + 1} / {card.items.length}
            </p>
            <p className={cx('text-xl font-bold leading-snug transition-colors', flash === 'right' && 'text-green', flash === 'wrong' && 'text-accent')}>{it.q}</p>
            <div className="grid grid-cols-2 gap-2">
              {it.choices.map((c, k) => (
                <Choice key={c} state="idle" mono={c.startsWith('O(')} onClick={() => !flash && pick(k)}>
                  {c}
                </Choice>
              ))}
            </div>
          </motion.div>
        </AnimatePresence>
      ) : (
        <div className="space-y-4">
          <motion.p initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-center text-6xl font-black italic">
            {score}
            <span className="text-2xl text-ink-3">/{card.items.length}</span>
          </motion.p>
          <ul className="space-y-1 text-sm">
            {card.items.map((x) => (
              <li key={x.q} className="flex justify-between gap-3 rounded-md bg-bg px-3 py-1.5">
                <span className="text-ink-2">{x.q}</span>
                <span className="shrink-0 font-mono text-green">{x.choices[x.answer]}</span>
              </li>
            ))}
          </ul>
          <Next onNext={onNext} />
        </div>
      )}
    </div>
  );
}

export { X as CloseIcon };
