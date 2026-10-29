import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Droplets, Minus, Moon, Plus, Scale } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, useList, useSettings, wasQueued } from '../lib/api';
import { bouncy, spring } from '../lib/motion';
import { addDays, haptic, relativeDay, today } from '../lib/format';
import type { Health } from '../lib/types';
import { AnimatedNumber, Card, IconButton, Page, PageHeader, cx } from '../components/ui';
import { GuidedJournal } from '../components/GuidedJournal';
import { LifeInsights } from '../components/LifeInsights';
import { useSearchParams } from 'react-router';

export const MOODS = ['😞', '😕', '😐', '🙂', '😄'];

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
    <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 lg:col-span-2 lg:grid-cols-1">
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
            enterKeyHint="done"
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

export function LifePage() {
  // ?journal=1 (from the evening push) opens straight into tonight's questions.
  const [params] = useSearchParams();
  return (
    <Page>
      <PageHeader eyebrow="Mood · Health · Journal" title="Life" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <LifeInsights />
        <HealthToday />
        <GuidedJournal autoStart={params.get('journal') === '1'} />
      </div>
    </Page>
  );
}
