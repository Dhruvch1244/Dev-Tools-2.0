import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate, useParams } from 'react-router';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeft, ArrowRight, BookOpenCheck, Flame, Lock, NotebookPen, Play, Star, Trophy, X, Zap } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { api, useList, useResource } from '../../lib/api';
import { useDsa, useSeason } from '../../lib/dsa';
import { haptic, today } from '../../lib/format';
import { COURSES, courseFor, isGraded, moduleById, starsFor, unlocked, type Card, type Course, type Module } from '../../core/dsa/course';
import { WEEKS, currentWeek, findProblem } from '../../core/dsa/plan';
import type { DsaProgress, LearnRow } from '../../lib/types';
import { BlankCard, BugCard, LearnCard, MatchCard, McqCard, OrderCard, PredictCard, SimCard, SpeedCard } from '../../components/academy/Cards';
import { Chequered } from '../../components/f1';
import { AnimatedNumber, Button, Card as Panel, Page, PageHeader, Rise, SectionTitle, cx } from '../../components/ui';
import { DiffChip } from './shared';

const useLearn = () => {
  const { data = [] } = useList<LearnRow>('learn');
  const by = new Map(data.map((r) => [r.module, r]));
  return { rows: data, by, stars: Object.fromEntries(data.map((r) => [r.module, r.stars])) as Record<string, number> };
};

function Stars({ n, size = 'size-4', animate }: { n: number; size?: string; animate?: boolean }) {
  return (
    <span className="flex gap-0.5">
      {[1, 2, 3].map((k) => (
        <motion.span key={k} initial={animate ? { scale: 0, rotate: -90 } : false} animate={{ scale: 1, rotate: 0 }} transition={{ delay: animate ? 0.4 + k * 0.25 : 0, type: 'spring', stiffness: 260, damping: 12 }}>
          <Star className={cx(size, k <= n ? 'fill-yellow text-yellow' : 'text-line-strong')} />
        </motion.span>
      ))}
    </span>
  );
}

// =============================================================================================
// Course map
// =============================================================================================
/** The week as a circuit: corners are modules, Q is the boss. Done corners glow, the next pulses. */
function Circuit({ course, stars, onOpen }: { course: Course; stars: Record<string, number>; onOpen: (m: Module) => void }) {
  const open = unlocked(course, stars);
  const n = course.modules.length;
  // A wavy track down the page: alternate left/right so it reads like a run of corners.
  const pts = course.modules.map((_, i) => ({ x: i % 2 ? 70 : 30, y: 60 + i * 120 }));
  const h = 60 + (n - 1) * 120 + 60;
  const d = pts.reduce((acc, p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `${acc} C ${pts[i - 1].x} ${pts[i - 1].y + 60}, ${p.x} ${p.y - 60}, ${p.x} ${p.y}`), '');
  const next = course.modules.find((m) => open.has(m.id) && !stars[m.id]);
  return (
    <div className="relative mx-auto w-full max-w-md" style={{ height: h }}>
      <svg viewBox={`0 0 100 ${h}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
        <path d={d} fill="none" stroke="var(--surface-2)" strokeWidth="9" vectorEffect="non-scaling-stroke" strokeLinecap="round" />
        <path d={d} fill="none" stroke="var(--line-strong)" strokeWidth="1.5" strokeDasharray="5 7" vectorEffect="non-scaling-stroke" />
        <motion.path d={d} fill="none" stroke="var(--accent)" strokeWidth="3" vectorEffect="non-scaling-stroke" strokeLinecap="round" initial={{ pathLength: 0 }} animate={{ pathLength: Math.max(0.001, course.modules.filter((m) => stars[m.id]).length / Math.max(1, n - 1)) }} transition={{ duration: 1.2, ease: 'easeOut' }} />
      </svg>
      {course.modules.map((m, i) => {
        const isOpen = open.has(m.id);
        const s = stars[m.id] ?? 0;
        const isNext = next?.id === m.id;
        return (
          <motion.button
            key={m.id}
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.1 + i * 0.07, type: 'spring', stiffness: 260, damping: 18 }}
            disabled={!isOpen}
            onClick={() => onOpen(m)}
            className="absolute flex w-[44%] flex-col items-center text-center"
            // Centre on the track point via motion's x/y so its scale animation doesn't wipe the offset.
            style={{ left: `${pts[i].x}%`, top: pts[i].y, x: '-50%', y: '-32px' }}
          >
            <span className="relative">
              {isNext && <motion.span className="absolute inset-0 rounded-full bg-accent" animate={{ scale: [1, 1.5], opacity: [0.5, 0] }} transition={{ duration: 1.6, repeat: Infinity }} />}
              <span className={cx('relative grid size-16 place-items-center rounded-full border-4 font-black italic', m.boss ? 'text-lg' : 'text-base', s ? 'border-yellow bg-yellow/15 text-yellow' : isOpen ? 'border-accent bg-accent text-white' : 'border-line bg-surface text-ink-3')}>
                {isOpen ? m.corner : <Lock className="size-5" />}
              </span>
            </span>
            <span className={cx('mt-1.5 line-clamp-2 rounded bg-bg/80 px-1 text-tiny font-bold leading-tight', isOpen ? 'text-ink' : 'text-ink-3')}>{m.title}</span>
            {s > 0 && <Stars n={s} size="size-3" />}
          </motion.button>
        );
      })}
    </div>
  );
}

export function AcademyHome() {
  const nav = useNavigate();
  const { start } = useSeason();
  const cw = Math.min(COURSES.length, Math.max(1, currentWeek(start, today())));
  const [week, setWeek] = useState(cw);
  const course = courseFor(week) ?? COURSES[0];
  const { rows, stars } = useLearn();
  const { get } = useDsa();
  const xp = rows.reduce((a, r) => a + r.xp, 0);
  const doneHere = course.modules.filter((m) => stars[m.id]).length;
  // Streak: consecutive days (to today/yesterday) with any lesson finished.
  const days = new Set(rows.filter((r) => r.done_at).map((r) => r.done_at!.slice(0, 10)));
  let streak = 0;
  for (let d = new Date(); ; d.setDate(d.getDate() - 1)) {
    const k = d.toISOString().slice(0, 10);
    if (days.has(k)) streak++;
    else if (streak > 0 || k !== today()) break;
  }
  // What you touched last — and which corner of the course covers it.
  const { data: progress = [] } = useDsaRecent();
  const recent = progress.slice(0, 4).map((p) => ({ p, prob: findProblem(p.problem), mod: COURSES.flatMap((c) => c.modules).find((m) => m.cards.some((c) => (c.kind === 'problem' && c.id === p.problem) || ((c.kind === 'sim' || c.kind === 'learn') && JSON.stringify(c).includes(p.problem)))) }));

  return (
    <Page>
      <Rise className="mb-3">
        <Link to="/dsa" className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-ink-3 hover:text-ink">
          <ArrowLeft className="size-4" /> Season HQ
        </Link>
      </Rise>
      <PageHeader eyebrow="Driver academy" title="Learn" />
      <Rise className="mb-4 grid grid-cols-3 gap-2">
        {[
          { icon: Zap, label: 'XP', v: xp, c: 'text-yellow' },
          { icon: Flame, label: 'Day streak', v: streak, c: 'text-accent' },
          { icon: Trophy, label: `Week ${week}`, v: `${doneHere}/${course.modules.length}`, c: 'text-green' },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-line bg-surface p-3">
            <s.icon className={cx('size-4', s.c)} />
            <p className="mt-1 text-2xl font-black italic">{typeof s.v === 'number' ? <AnimatedNumber value={s.v} /> : s.v}</p>
            <p className="text-micro font-black uppercase tracking-[0.15em] text-ink-3">{s.label}</p>
          </div>
        ))}
      </Rise>
      <Rise className="no-scrollbar mb-4 flex gap-2 overflow-x-auto">
        {COURSES.map((c) => (
          <button key={c.week} onClick={() => setWeek(c.week)} className={cx('slant shrink-0 px-4 py-1.5 text-mini font-black italic uppercase', week === c.week ? 'bg-accent text-white' : 'bg-surface-2 text-ink-2')}>
            R{c.week} · {WEEKS[c.week - 1].gp}
          </button>
        ))}
        <span className="slant shrink-0 bg-surface px-4 py-1.5 text-mini font-black italic uppercase text-ink-3">R3+ soon</span>
      </Rise>
      <Rise className="mb-2">
        <p className="text-2xl font-black italic uppercase leading-tight">{course.title}</p>
        <p className="text-ink-2">{course.tagline}</p>
      </Rise>

      {recent.length > 0 && (
        <Rise className="my-4">
          <Panel>
            <SectionTitle>Where you left off</SectionTitle>
            <ul className="space-y-1.5">
              {recent.map(({ p, prob, mod }) => (
                <li key={p.problem} className="flex items-center gap-2 rounded-md bg-bg px-3 py-2 text-sm">
                  <span className={cx('size-2 shrink-0 rounded-full', p.status === 'solved' ? 'bg-green' : p.status === 'revisit' ? 'bg-yellow' : 'bg-ink-3')} />
                  <Link to={`/dsa/p/${p.problem}`} className="min-w-0 flex-1 truncate font-semibold">
                    {prob?.title ?? p.problem}
                  </Link>
                  <span className="shrink-0 text-tiny uppercase text-ink-3">{p.status}</span>
                  {mod && (
                    <button onClick={() => nav(`/dsa/learn/${mod.id}`)} className="shrink-0 rounded bg-accent-soft px-2 py-0.5 text-micro font-bold uppercase text-accent">
                      {mod.corner} lesson
                    </button>
                  )}
                </li>
              ))}
            </ul>
            {get('product-of-array-except-self')?.status === 'todo' && <p className="mt-2 text-tiny text-ink-3">Product of Array Except Self is half done — its lesson is Week 1 · T6.</p>}
          </Panel>
        </Rise>
      )}

      <Circuit course={course} stars={stars} onOpen={(m) => nav(`/dsa/learn/${m.id}`)} />

      <Rise className="mt-6 flex flex-wrap gap-2">
        <Link to={`/dsa/week/${course.week}`}>
          <Button variant="soft">
            <BookOpenCheck className="size-4" /> Week {course.week} problem set
          </Button>
        </Link>
        <Link to={`/dsa/test/weekly/${course.week}`}>
          <Button variant="ghost">
            <Trophy className="size-4" /> Sunday qualifying test
          </Button>
        </Link>
      </Rise>
    </Page>
  );
}

/** Recently touched problems, newest first (the same cache the problem pages use). */
function useDsaRecent() {
  return useQuery({
    queryKey: ['dsa'],
    queryFn: () => api<DsaProgress[]>('/dsa'),
    select: (rows) => [...rows].filter((r) => r.updated_at).sort((a, b) => b.updated_at.localeCompare(a.updated_at)),
  });
}

// =============================================================================================
// Lesson player
// =============================================================================================
export function Lesson() {
  const id = useParams().module ?? '';
  const nav = useNavigate();
  const found = moduleById(id);
  const learn = useLearn();
  const { create, update } = useResource<LearnRow>('learn');
  const flow = useMemo(() => (found ? found.module.cards.filter((c) => c.kind !== 'problem') : []), [found]);
  const warmups = useMemo(() => (found ? found.module.cards.filter((c): c is Extract<Card, { kind: 'problem' }> => c.kind === 'problem') : []), [found]);
  const [i, setI] = useState(0);
  const [tyres, setTyres] = useState(3);
  const [xp, setXp] = useState(0);
  const [combo, setCombo] = useState(0);
  const [mistakes, setMistakes] = useState(0);
  const [answers, setAnswers] = useState(0);
  const [pop, setPop] = useState<{ k: number; text: string } | null>(null);
  const [finished, setFinished] = useState(false);
  const [quit, setQuit] = useState(false);

  useEffect(() => {
    const html = document.documentElement;
    const prev = html.style.overflow;
    html.style.overflow = 'hidden';
    return () => void (html.style.overflow = prev);
  }, []);
  useEffect(() => void (setI(0), setTyres(3), setXp(0), setCombo(0), setMistakes(0), setAnswers(0), setFinished(false)), [id]);

  if (!found) return null;
  const { course, module: m } = found;
  const card = flow[i];
  const graded = flow.filter(isGraded).length;

  const onAnswer = (ok: boolean) => {
    setAnswers((a) => a + 1);
    if (ok) {
      const gain = 10 + Math.min(10, combo * 2);
      setXp((x) => x + gain);
      setCombo((c) => c + 1);
      setPop({ k: Date.now(), text: `+${gain}${combo >= 2 ? ` · ${combo + 1}× combo` : ''}` });
      haptic(10);
    } else {
      setTyres((t) => Math.max(0, t - 1));
      setMistakes((x) => x + 1);
      setCombo(0);
      haptic(30);
    }
  };
  const next = () => {
    if (!isGraded(card)) setXp((x) => x + 2);
    if (i + 1 < flow.length) setI(i + 1);
    else finish();
  };
  const finish = () => {
    // Out of tyres still finishes the lap — but caps it at one star so the corner stays worth redoing.
    const stars = tyres === 0 ? 1 : starsFor(mistakes, Math.max(graded, answers));
    const prev = learn.by.get(m.id);
    const row = { module: m.id, stars: Math.max(prev?.stars ?? 0, stars), xp: (prev?.xp ?? 0) + xp, attempts: (prev?.attempts ?? 0) + 1, done_at: new Date().toISOString() };
    if (prev) update({ id: prev.id, ...row });
    else create(row);
    setFinished(true);
    haptic(25);
  };
  const nextModule = course.modules[course.modules.findIndex((x) => x.id === m.id) + 1];
  const stars = tyres === 0 ? 1 : starsFor(mistakes, Math.max(graded, answers));
  const props = { seed: i * 97 + m.id.length, onAnswer, onNext: next };

  return createPortal(
    <div className="fixed inset-x-0 z-[90] flex flex-col bg-bg" style={{ top: 'var(--vvt, 0px)', height: 'var(--vvh, 100dvh)' }}>
      <header className="flex items-center gap-3 px-4 pb-2 pt-[calc(env(safe-area-inset-top)+10px)]">
        <button onClick={() => (finished || i === 0 ? nav('/dsa/learn') : setQuit(true))} aria-label="Leave lesson" className="grid size-10 place-items-center rounded-xl bg-surface text-ink-2">
          <X className="size-5" />
        </button>
        <div className="h-3 flex-1 overflow-hidden rounded-full bg-surface-2">
          <motion.div className="h-full rounded-full bg-accent" animate={{ width: `${((finished ? flow.length : i) / flow.length) * 100}%` }} transition={{ type: 'spring', stiffness: 120, damping: 20 }} />
        </div>
        <div className="flex items-center gap-1" aria-label={`${tyres} tyres left`}>
          {[0, 1, 2].map((k) => (
            <motion.span key={k} animate={k >= tyres ? { scale: [1, 1.4, 0.8], opacity: 0.25 } : { scale: 1, opacity: 1 }} className="grid size-5 place-items-center rounded-full border-[3px] border-accent bg-bg">
              <span className="size-1.5 rounded-full bg-ink-3" />
            </motion.span>
          ))}
        </div>
        <span className="flex items-center gap-1 font-mono text-sm font-bold text-yellow">
          <Zap className="size-4 fill-current" /> {xp}
        </span>
      </header>
      <p className="px-4 text-micro font-black uppercase tracking-[0.2em] text-ink-3">
        R{course.week} · {m.corner} · {m.title}
      </p>

      <AnimatePresence>
        {pop && (
          <motion.span key={pop.k} initial={{ opacity: 0, y: 10, scale: 0.8 }} animate={{ opacity: 1, y: -10, scale: 1 }} exit={{ opacity: 0, y: -30 }} transition={{ duration: 0.5 }} onAnimationComplete={() => setTimeout(() => setPop(null), 400)} className="pointer-events-none absolute right-4 top-[calc(env(safe-area-inset-top)+56px)] z-10 rounded-md bg-yellow px-2 py-0.5 font-mono text-sm font-black text-black">
            {pop.text}
          </motion.span>
        )}
      </AnimatePresence>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-4">
        <div className="mx-auto max-w-2xl">
          {!finished && card && (
            <AnimatePresence mode="wait">
              <motion.div key={i} initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }} transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}>
                {tyres === 0 && isGraded(card) && <p className="mb-3 rounded-lg bg-accent/10 px-3 py-2 text-sm text-accent">Out of tyres — finish the lap for practice; redo it later for stars.</p>}
                {card.kind === 'learn' && <LearnCard card={card} {...props} />}
                {card.kind === 'sim' && <SimCard card={card} {...props} />}
                {card.kind === 'predict' && <PredictCard card={card} {...props} />}
                {card.kind === 'mcq' && <McqCard card={card} {...props} />}
                {card.kind === 'blank' && <BlankCard card={card} {...props} />}
                {card.kind === 'bug' && <BugCard card={card} {...props} />}
                {card.kind === 'match' && <MatchCard card={card} {...props} />}
                {card.kind === 'order' && <OrderCard card={card} {...props} />}
                {card.kind === 'speed' && <SpeedCard card={card} {...props} />}
              </motion.div>
            </AnimatePresence>
          )}

          {finished && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-5 text-center">
              <Chequered className="mx-auto h-24 w-36" />
              <p className="text-label font-black uppercase tracking-[0.25em] text-ink-3">{m.boss ? 'Qualifying complete' : 'Corner cleared'}</p>
              <p className="text-3xl font-black italic uppercase leading-tight">{m.title}</p>
              <div className="flex justify-center">
                <Stars n={stars} size="size-10" animate />
              </div>
              <div className="grid grid-cols-3 gap-2">
                {[
                  ['XP', <AnimatedNumber key="x" value={xp} />],
                  ['Mistakes', mistakes],
                  ['Tyres left', tyres],
                ].map(([k, v]) => (
                  <div key={k as string} className="rounded-xl border border-line bg-surface p-3">
                    <p className="text-2xl font-black italic">{v}</p>
                    <p className="text-micro font-black uppercase tracking-[0.15em] text-ink-3">{k}</p>
                  </div>
                ))}
              </div>
              {warmups.length > 0 && <WarmupGrid items={warmups} />}
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {nextModule ? (
                  <Button className="h-12" onClick={() => nav(`/dsa/learn/${nextModule.id}`)}>
                    Next: {nextModule.corner} <ArrowRight className="size-4" />
                  </Button>
                ) : (
                  <Link to={`/dsa/week/${course.week}`}>
                    <Button className="h-12 w-full">
                      Week {course.week} problems <ArrowRight className="size-4" />
                    </Button>
                  </Link>
                )}
                <Button variant="ghost" className="h-12" onClick={() => nav('/dsa/learn')}>
                  Back to the circuit
                </Button>
              </div>
            </motion.div>
          )}
        </div>
      </div>

      <AnimatePresence>
        {quit && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-20 grid place-items-center bg-black/70 p-6">
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="w-full max-w-sm space-y-3 rounded-2xl border border-line bg-surface p-5 text-center">
              <p className="text-xl font-black italic uppercase">Box this lap?</p>
              <p className="text-sm text-ink-2">Progress in this lesson won’t be saved.</p>
              <Button className="w-full" onClick={() => setQuit(false)}>
                Keep going
              </Button>
              <Button variant="ghost" className="w-full" onClick={() => nav('/dsa/learn')}>
                Leave
              </Button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>,
    document.body,
  );
}

/** Warm-ups handed out after a lesson, with your status on each. */
function WarmupGrid({ items }: { items: Extract<Card, { kind: 'problem' }>[] }) {
  const { get } = useDsa();
  return (
    <div className="space-y-2 text-left">
      <p className="flex items-center gap-1.5 text-micro font-black uppercase tracking-[0.2em] text-ink-3">
        <NotebookPen className="size-3.5" /> Warm-up grid — easy ones to lock it in
      </p>
      {items.map((p, k) => {
        const st = get(p.id)?.status;
        return (
          <motion.div key={p.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.8 + k * 0.08 }}>
            <Link to={`/dsa/p/${p.id}`} className="flex items-center gap-3 rounded-xl border border-line bg-surface p-3">
              <span className="font-mono text-sm font-bold text-ink-3">P{k + 1}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{p.title}</p>
                <p className="truncate text-tiny text-ink-3">{p.why}</p>
              </div>
              <DiffChip d={p.diff} />
              {st === 'solved' ? <Star className="size-4 fill-green text-green" /> : <Play className="size-4 text-accent" />}
            </Link>
          </motion.div>
        );
      })}
    </div>
  );
}
