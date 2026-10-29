import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Link } from 'react-router';
import { BookOpen, Droplets, Flame, Minus, Moon, Plus, Scale, Trash2 } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, useList, useResource, useSettings, wasQueued } from '../lib/api';
import { bouncy, listItem, spring } from '../lib/motion';
import { addDays, haptic, parseDate, relativeDay, today } from '../lib/format';
import type { Habit, HabitLog, Health, Journal } from '../lib/types';
import { AnimatedNumber, Button, Card, Empty, IconButton, Input, Page, PageHeader, SectionTitle, cx } from '../components/ui';

export const MOODS = ['😞', '😕', '😐', '🙂', '😄'];

// ---------- Habits ----------
export function useHabits() {
  const { data: habits = [] } = useList<Habit>('habits');
  const from = addDays(today(), -120);
  const { data: logs = [] } = useQuery({ queryKey: ['habit_logs', from], queryFn: () => api<HabitLog[]>(`/habit_logs?from=${from}`) });
  const qc = useQueryClient();
  const toggle = useMutation({
    mutationFn: (v: HabitLog) => api('/habit_logs/toggle', { method: 'POST', body: JSON.stringify(v) }),
    onMutate: (v) =>
      qc.setQueryData<HabitLog[]>(['habit_logs', from], (old = []) =>
        old.some((l) => l.habit_id === v.habit_id && l.date === v.date) ? old.filter((l) => !(l.habit_id === v.habit_id && l.date === v.date)) : [...old, v],
      ),
    onSettled: (d) => (wasQueued(d) ? undefined : qc.invalidateQueries({ queryKey: ['habit_logs'] })),
  });
  const done = useMemo(() => new Set(logs.map((l) => `${l.habit_id}|${l.date}`)), [logs]);
  const isDone = (id: string, date: string) => done.has(`${id}|${date}`);
  /** Consecutive days ending today (or yesterday, so an unchecked today doesn't zero the streak yet). */
  const streak = (id: string) => {
    let d = isDone(id, today()) ? today() : addDays(today(), -1);
    let n = 0;
    while (isDone(id, d)) (n++, (d = addDays(d, -1)));
    return n;
  };
  return { habits: habits.filter((h) => !h.archived), isDone, streak, toggle: (habit_id: string, date: string) => (haptic(12), toggle.mutate({ habit_id, date })) };
}

const HABIT_COLORS = ['#8f7dff', '#ff7ac6', '#4fe3c1', '#ffb547', '#5cb8ff'];

function Habits() {
  const { habits, isDone, streak, toggle } = useHabits();
  const { create, remove } = useResource<Habit>('habits');
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('💪');
  const week = Array.from({ length: 7 }, (_, i) => addDays(today(), i - 6));

  return (
    <Card className="lg:col-span-3">
      <SectionTitle action={<Link to="/routines" className="text-xs font-bold uppercase text-accent hover:underline">Routines →</Link>}>Habits</SectionTitle>
      <div className="mb-3 hidden grid-cols-[1fr_repeat(7,32px)_40px] items-center gap-1.5 pr-1 text-center text-[10px] font-semibold uppercase tracking-wider text-ink-3 sm:grid">
        <span />
        {week.map((d) => (
          <span key={d} className={cx(d === today() && 'text-accent')}>
            {parseDate(d).toLocaleDateString(undefined, { weekday: 'narrow' })}
          </span>
        ))}
        <span />
      </div>
      <ul className="space-y-2">
        <AnimatePresence initial={false}>
          {habits.map((h, i) => {
            const color = h.color ?? HABIT_COLORS[i % HABIT_COLORS.length];
            const s = streak(h.id);
            return (
              <motion.li key={h.id} layout {...listItem} className="group grid grid-cols-[1fr_auto] items-center gap-1.5 rounded-2xl bg-surface p-2.5 sm:grid-cols-[1fr_repeat(7,32px)_40px]">
                <div className="flex min-w-0 items-center gap-2.5 pl-1">
                  <span className="text-xl">{h.emoji}</span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{h.name}</p>
                    <p className={cx('flex items-center gap-1 text-xs', s ? 'text-amber' : 'text-ink-3')}>
                      <motion.span key={s} initial={{ scale: 0.4, rotate: -20 }} animate={{ scale: 1, rotate: 0 }} transition={bouncy}>
                        <Flame className={cx('size-3', s && 'fill-current')} />
                      </motion.span>
                      {s} day streak
                    </p>
                  </div>
                </div>
                {/* phone: just today; desktop: the week */}
                <div className="flex gap-1.5 sm:contents">
                  {week.map((d) => {
                    const on = isDone(h.id, d);
                    return (
                      <motion.button
                        key={d}
                        aria-label={`${h.name} on ${relativeDay(d)}`}
                        aria-pressed={on}
                        onClick={() => toggle(h.id, d)}
                        whileTap={{ scale: 0.8 }}
                        transition={bouncy}
                        className={cx('relative grid size-8 place-items-center rounded-xl border transition-colors', d !== today() && 'max-sm:hidden', on ? 'border-transparent' : 'border-line hover:border-line-strong')}
                      >
                        <motion.span initial={false} animate={{ scale: on ? 1 : 0, opacity: on ? 1 : 0 }} transition={bouncy} className="absolute inset-0 rounded-xl" style={{ background: color }} />
                        {d === today() && !on && <span className="size-1.5 rounded-full bg-accent" />}
                      </motion.button>
                    );
                  })}
                </div>
                <IconButton label={`Delete ${h.name}`} onClick={() => remove(h.id)} className="opacity-0 transition-opacity group-hover:opacity-100 max-sm:hidden">
                  <Trash2 className="size-4" />
                </IconButton>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ul>
      {habits.length === 0 && <Empty icon={<Flame className="size-6" />} title="Start a streak" hint="Gym, reading, no-sugar, 10k steps… small daily wins." />}
      <form
        className="mt-4 flex gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!name.trim()) return;
          await create({ name: name.trim(), emoji: emoji || '✨', color: HABIT_COLORS[habits.length % HABIT_COLORS.length], archived: 0 });
          setName('');
        }}
      >
        <input aria-label="Emoji" value={emoji} onChange={(e) => setEmoji([...e.target.value].slice(-1).join(''))} className="field w-14 text-center text-lg" />
        <Input placeholder="New habit" value={name} onChange={(e) => setName(e.target.value)} />
        <Button type="submit" disabled={!name.trim()}>
          Add
        </Button>
      </form>
    </Card>
  );
}

// ---------- Health ----------
export function useHealthToday() {
  const t = today();
  const { data = [] } = useList<Health>('health', { from: addDays(t, -60) });
  const qc = useQueryClient();
  const set = useMutation({
    mutationFn: ({ kind, value, date = t }: { kind: Health['kind']; value: number; date?: string }) => api(`/health/${date}/${kind}`, { method: 'PUT', body: JSON.stringify({ value }) }),
    onMutate: ({ kind, value, date = t }) =>
      qc.setQueriesData<Health[]>({ queryKey: ['health'] }, (old) => {
        if (!Array.isArray(old)) return old;
        const hit = old.some((h) => h.date === date && h.kind === kind);
        return hit ? old.map((h) => (h.date === date && h.kind === kind ? { ...h, value } : h)) : [{ id: 'tmp', date, kind, value, created_at: '', updated_at: '' }, ...old];
      }),
    onSettled: (d) => (wasQueued(d) ? undefined : qc.invalidateQueries({ queryKey: ['health'] })),
  });
  const get = (kind: Health['kind'], date = t) => data.find((h) => h.date === date && h.kind === kind)?.value;
  const lastWeight = data.find((h) => h.kind === 'weight' && h.date < t);
  return { get, set: set.mutate, all: data, lastWeight };
}

function WaterGlass({ value, goal }: { value: number; goal: number }) {
  const pct = Math.min(1, value / goal);
  return (
    <div className="relative h-28 w-20 overflow-hidden rounded-b-[22px] rounded-t-md border-2 border-line-strong">
      <motion.div className="absolute inset-x-0 bottom-0" initial={{ height: 0 }} animate={{ height: `${pct * 100}%` }} transition={{ type: 'spring', stiffness: 60, damping: 12 }}>
        <svg className="wave absolute -top-2 left-0 h-3 w-[200%]" viewBox="0 0 200 12" preserveAspectRatio="none" style={{ animation: 'wave 2.4s linear infinite' }}>
          <path d="M0 6 Q 25 0 50 6 T 100 6 T 150 6 T 200 6 V12 H0Z" fill="#5cb8ff" />
        </svg>
        <div className="h-full w-full bg-[#5cb8ff]" />
      </motion.div>
    </div>
  );
}

function Stepper({ value, onChange, step = 1, min = 0 }: { value: number; onChange: (v: number) => void; step?: number; min?: number }) {
  return (
    <div className="flex items-center gap-1">
      <IconButton label="Decrease" onClick={() => onChange(Math.max(min, +(value - step).toFixed(1)))} className="bg-surface-2">
        <Minus className="size-4" />
      </IconButton>
      <IconButton label="Increase" onClick={() => onChange(+(value + step).toFixed(1))} className="bg-surface-2">
        <Plus className="size-4" />
      </IconButton>
    </div>
  );
}

function HealthToday() {
  const { get, set, lastWeight } = useHealthToday();
  const { settings } = useSettings();
  const goal = settings.waterGoal ?? 8;
  const water = get('water') ?? 0;
  const sleep = get('sleep') ?? 0;
  const weight = get('weight');
  const mood = get('mood');
  const [w, setW] = useState('');
  useEffect(() => setW(weight != null ? String(weight) : ''), [weight]);

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:col-span-2 lg:grid-cols-1">
      <Card className="flex items-center gap-5">
        <WaterGlass value={water} goal={goal} />
        <div className="flex-1">
          <p className="flex items-center gap-1.5 text-sm text-ink-3">
            <Droplets className="size-4 text-[#5cb8ff]" /> Water
          </p>
          <p className="font-display text-3xl font-semibold">
            <AnimatedNumber value={water} />
            <span className="text-base text-ink-3"> / {goal} glasses</span>
          </p>
          <div className="mt-2">
            <Stepper value={water} onChange={(v) => (haptic(10), set({ kind: 'water', value: v }))} />
          </div>
        </div>
      </Card>
      <Card>
        <div className="flex items-center justify-between">
          <div>
            <p className="flex items-center gap-1.5 text-sm text-ink-3">
              <Moon className="size-4 text-accent" /> Sleep last night
            </p>
            <p className="font-display text-3xl font-semibold">
              <AnimatedNumber value={sleep} format={(n) => n.toFixed(1)} />
              <span className="text-base text-ink-3"> h</span>
            </p>
          </div>
          <Stepper value={sleep} step={0.5} onChange={(v) => set({ kind: 'sleep', value: v })} />
        </div>
        <div className="mt-4 flex items-center gap-3 border-t border-line pt-4">
          <Scale className="size-4 shrink-0 text-ink-3" />
          <input
            inputMode="decimal"
            aria-label="Weight in kg"
            placeholder="Weight (kg)"
            value={w}
            onChange={(e) => setW(e.target.value.replace(/[^\d.]/g, ''))}
            onBlur={() => Number(w) && set({ kind: 'weight', value: Number(w) })}
            className="field h-10 w-32"
          />
          {weight != null && lastWeight && (
            <span className={cx('text-xs font-medium', weight > lastWeight.value ? 'text-warn' : 'text-good')}>
              {weight > lastWeight.value ? '▲' : '▼'} {Math.abs(weight - lastWeight.value).toFixed(1)} kg since {relativeDay(lastWeight.date).toLowerCase()}
            </span>
          )}
        </div>
      </Card>
      <Card>
        <p className="mb-3 text-sm text-ink-3">How are you feeling?</p>
        <div className="flex justify-between">
          {MOODS.map((m, i) => (
            <motion.button
              key={m}
              aria-label={`Mood ${i + 1} of 5`}
              aria-pressed={mood === i + 1}
              onClick={() => (haptic(10), set({ kind: 'mood', value: i + 1 }))}
              whileHover={{ scale: 1.15, y: -3 }}
              whileTap={{ scale: 0.85 }}
              transition={bouncy}
              className="relative grid size-12 place-items-center text-2xl"
            >
              {mood === i + 1 && <motion.span layoutId="mood-pill" transition={spring} className="absolute inset-0 rounded-2xl bg-accent-soft ring-1 ring-accent/40" />}
              <span className={cx('relative transition', mood && mood !== i + 1 && 'opacity-40 grayscale')}>{m}</span>
            </motion.button>
          ))}
        </div>
      </Card>
    </div>
  );
}

// ---------- Journal ----------
function JournalCard() {
  const t = today();
  const { data: entries = [] } = useList<Journal>('journal', { from: addDays(t, -60) });
  const qc = useQueryClient();
  const todays = entries.find((e) => e.date === t);
  const [body, setBody] = useState('');
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const loaded = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    if (!loaded.current && todays) {
      setBody(todays.body ?? '');
      loaded.current = true;
    }
  }, [todays]);

  const onChange = (v: string) => {
    setBody(v);
    loaded.current = true;
    setStatus('saving');
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      await api(`/journal/${t}`, { method: 'PUT', body: JSON.stringify({ body: v, mood: todays?.mood ?? null }) });
      void qc.invalidateQueries({ queryKey: ['journal'] });
      setStatus('saved');
    }, 700);
  };

  const past = entries.filter((e) => e.date !== t && e.body?.trim());

  return (
    <Card className="lg:col-span-5">
      <SectionTitle
        action={
          <AnimatePresence mode="wait">
            {status !== 'idle' && (
              <motion.span key={status} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} className="text-xs text-ink-3">
                {status === 'saving' ? 'Saving…' : 'Saved ✓'}
              </motion.span>
            )}
          </AnimatePresence>
        }
      >
        <span className="flex items-center gap-2">
          <BookOpen className="size-4 text-pink" /> Journal · {parseDate(t).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
        </span>
      </SectionTitle>
      <textarea
        value={body}
        onChange={(e) => onChange(e.target.value)}
        rows={5}
        placeholder="What happened today? What are you grateful for? What's on your mind?"
        className="w-full resize-none rounded-2xl bg-transparent text-[15px] leading-relaxed outline-none placeholder:text-ink-3"
      />
      {past.length > 0 && (
        <div className="mt-4 space-y-2 border-t border-line pt-4">
          {past.slice(0, 7).map((e) => (
            <details key={e.id} className="group rounded-2xl bg-surface px-4 py-3">
              <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-medium">
                {relativeDay(e.date)}
                <span className="text-ink-3 transition group-open:rotate-90">›</span>
              </summary>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-ink-2">{e.body}</p>
            </details>
          ))}
        </div>
      )}
    </Card>
  );
}

export function LifePage() {
  return (
    <Page>
      <PageHeader eyebrow="Habits · Health · Journal" title="Life" />
      <div className="grid gap-4 lg:grid-cols-5">
        <Habits />
        <HealthToday />
        <JournalCard />
      </div>
    </Page>
  );
}
