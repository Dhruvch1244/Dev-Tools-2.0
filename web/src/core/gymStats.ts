// Which muscles a session (or a week) actually hit, and whether the week is in a productive range.
// Every exercise has a primary muscle in the library; compound lifts also train others, counted as
// fractional sets (a bench set = 1 chest + ½ front delts + ½ triceps) — the usual way hypertrophy
// research tallies weekly volume. Pure: no React, no I/O.

import { EXERCISES, muscleOf, type Muscle } from './exercises';
import { e1rm, type DayType } from './gym';

/** Body-map regions — the library's muscles minus Cardio. */
export type Region = Exclude<Muscle, 'Cardio'>;
export const REGIONS: Region[] = ['Chest', 'Shoulders', 'Rear delts', 'Back', 'Traps', 'Biceps', 'Triceps', 'Forearms', 'Core', 'Quads', 'Hamstrings', 'Glutes', 'Calves'];

/**
 * Weekly hard-set ranges per muscle for an intermediate lifter (roughly MEV → MRV from the
 * Renaissance Periodization landmarks, trimmed for a 5-day PPL+UL week). Under `min` the muscle
 * is maintained at best; over `max` recovery usually suffers before growth improves.
 */
export const WEEK_RANGE: Record<Region, [min: number, max: number]> = {
  Chest: [10, 20],
  Back: [10, 22],
  Shoulders: [8, 20],
  'Rear delts': [6, 16],
  Traps: [4, 14],
  Biceps: [8, 18],
  Triceps: [6, 16],
  Forearms: [0, 12],
  Core: [4, 16],
  Quads: [8, 18],
  Hamstrings: [6, 14],
  Glutes: [4, 14],
  Calves: [8, 16],
};

/** Secondary work by name pattern, checked in order; the primary muscle is always 1. */
const SECONDARY: [RegExp, Partial<Record<Region, number>>][] = [
  [/calf raise/i, {}],
  [/romanian|stiff-leg|rdl/i, { Glutes: 0.5, Back: 0.25 }],
  [/deadlift|rack pull|good morning/i, { Hamstrings: 0.5, Glutes: 0.5, Traps: 0.5, Forearms: 0.25, Back: 0.5 }],
  [/squat|leg press|lunge|step-up|split squat|hack|pendulum|belt/i, { Glutes: 0.5, Core: 0.25 }],
  [/hip thrust|glute bridge/i, { Hamstrings: 0.25 }],
  [/bench|chest press|push-up|dip|incline.*press|decline.*press|floor press|squeeze press/i, { Shoulders: 0.5, Triceps: 0.5 }],
  [/fly|crossover|pec deck/i, { Shoulders: 0.25 }],
  [/overhead press|shoulder press|push press|arnold|landmine|military|pike|handstand/i, { Triceps: 0.5, Traps: 0.25 }],
  [/pull-up|chin-up|pulldown|pullover/i, { Biceps: 0.5, 'Rear delts': 0.25 }],
  [/upright row|shrug/i, { Shoulders: 0.25 }],
  [/row/i, { Biceps: 0.5, 'Rear delts': 0.5, Traps: 0.25 }],
  [/face pull|rear delt|reverse pec/i, { Traps: 0.25 }],
  [/curl/i, { Forearms: 0.25 }],
  [/farmer|carry/i, { Traps: 0.5, Core: 0.5 }],
];

/** Muscles one set of an exercise trains, with weights (1 = primary). Unknown names → empty. */
export function contribution(exercise: string): Partial<Record<Region, number>> {
  const primary = muscleOf(exercise);
  if (!primary || primary === 'Cardio') return {};
  const out: Partial<Record<Region, number>> = { [primary]: 1 };
  // Leg curls are "Hamstrings" but contain "curl" — only arm curls get the forearm share.
  const rules = primary === 'Hamstrings' ? SECONDARY.filter(([re]) => !re.test('curl')) : SECONDARY;
  for (const [re, adds] of rules) {
    if (!re.test(exercise)) continue;
    for (const [m, w] of Object.entries(adds) as [Region, number][]) if (m !== primary) out[m] = Math.max(out[m] ?? 0, w);
    break;
  }
  return out;
}

/** Fractional hard sets per muscle for a list of sets. */
export function muscleSets(sets: { exercise: string }[]): Record<Region, number> {
  const out = Object.fromEntries(REGIONS.map((r) => [r, 0])) as Record<Region, number>;
  for (const s of sets) for (const [m, w] of Object.entries(contribution(s.exercise)) as [Region, number][]) out[m] += w;
  return out;
}

/** 0..1 intensity per region for the body map (relative to the busiest muscle, or to a fixed scale). */
export function heat(counts: Record<Region, number>, scale?: number): Record<Region, number> {
  const max = scale ?? Math.max(1, ...Object.values(counts));
  return Object.fromEntries(REGIONS.map((r) => [r, Math.min(1, counts[r] / max)])) as Record<Region, number>;
}

/** Muscles a planned list of exercises targets (for showing a session before it starts). */
export function plannedHeat(exercises: { name: string; sets: number }[]) {
  return heat(muscleSets(exercises.flatMap((e) => Array.from({ length: e.sets }, () => ({ exercise: e.name })))));
}

export type MuscleStatus = { muscle: Region; sets: number; min: number; max: number; status: 'low' | 'ok' | 'high' };
export type WeekReport = {
  from: string;
  to: string;
  sessions: number;
  planned: number;
  sets: number;
  volume: number;
  volumeChange: number | null; // vs the previous 7 days, %
  muscles: MuscleStatus[];
  pushPull: number | null; // pressing sets ÷ pulling sets
  prs: { exercise: string; weight: number; reps: number }[];
  flags: string[];
};

type SetLike = { workout_id: string; date: string; exercise: string; weight: number; reps: number };
type WorkoutLike = { id: string; date: string; day_type: string; finished_at: string | null };

const addDays = (d: string, n: number) => {
  const x = new Date(`${d}T12:00:00Z`);
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
};

/**
 * The last 7 days ending `to`: sessions vs the split's plan, sets per muscle against the ranges,
 * push:pull balance, PRs (beating everything before the week), and plain-language flags.
 */
export function weekReport(to: string, sets: SetLike[], workouts: WorkoutLike[], planType: (d: string) => DayType): WeekReport {
  const from = addDays(to, -6);
  const inWeek = (d: string) => d >= from && d <= to;
  const week = sets.filter((s) => inWeek(s.date));
  const prevWeek = sets.filter((s) => s.date >= addDays(from, -7) && s.date < from);
  const vol = (xs: SetLike[]) => xs.reduce((a, s) => a + s.weight * s.reps, 0);
  const days = Array.from({ length: 7 }, (_, i) => addDays(from, i));
  const planned = days.filter((d) => planType(d) !== 'rest').length;
  const sessions = new Set(workouts.filter((w) => inWeek(w.date) && (w.finished_at || week.some((s) => s.workout_id === w.id))).map((w) => w.date)).size;
  const counts = muscleSets(week);
  const muscles: MuscleStatus[] = REGIONS.map((m) => {
    const [min, max] = WEEK_RANGE[m];
    const n = Math.round(counts[m] * 10) / 10;
    return { muscle: m, sets: n, min, max, status: n < min ? 'low' : n > max ? 'high' : 'ok' };
  });
  const press = counts.Chest + counts.Shoulders + counts.Triceps * 0.5;
  const pull = counts.Back + counts['Rear delts'] + counts.Biceps * 0.5;
  const before = new Map<string, number>();
  for (const s of sets) if (s.date < from) before.set(s.exercise, Math.max(before.get(s.exercise) ?? 0, e1rm(s.weight, s.reps)));
  const bestInWeek = new Map<string, SetLike>();
  for (const s of week) {
    const b = bestInWeek.get(s.exercise);
    if (!b || e1rm(s.weight, s.reps) > e1rm(b.weight, b.reps)) bestInWeek.set(s.exercise, s);
  }
  const prs = [...bestInWeek.values()].filter((s) => (before.get(s.exercise) ?? 0) > 0 && e1rm(s.weight, s.reps) > before.get(s.exercise)!).map(({ exercise, weight, reps }) => ({ exercise, weight, reps }));

  const flags: string[] = [];
  const v = vol(week);
  const pv = vol(prevWeek);
  const volumeChange = pv > 0 ? Math.round(((v - pv) / pv) * 100) : null;
  if (week.length) {
    const low = muscles.filter((m) => m.status === 'low' && m.min > 0).sort((a, b) => a.sets / a.min - b.sets / b.min);
    const high = muscles.filter((m) => m.status === 'high');
    if (low.length) flags.push(`Under-trained: ${low.slice(0, 4).map((m) => `${m.muscle} ${m.sets}/${m.min}`).join(', ')} sets`);
    if (high.length) flags.push(`Too much: ${high.map((m) => `${m.muscle} ${m.sets} sets (cap ~${m.max})`).join(', ')} — recovery may lag`);
    if (pull > 0 && press / pull > 1.4) flags.push(`Pressing outweighs pulling ${(press / pull).toFixed(1)}:1 — add rows/face pulls for shoulder health`);
    if (press > 0 && pull / press > 1.6) flags.push(`Pulling outweighs pressing ${(pull / press).toFixed(1)}:1`);
    if (volumeChange != null && volumeChange > 30) flags.push(`Volume up ${volumeChange}% on last week — big jumps raise injury risk; ~10–20% is plenty`);
    if (volumeChange != null && volumeChange < -30) flags.push(`Volume down ${-volumeChange}% on last week`);
  }
  if (sessions < planned - 1) flags.push(`${sessions}/${planned} planned sessions done`);
  if (prs.length) flags.push(`${prs.length} PR${prs.length > 1 ? 's' : ''} this week 🟣`);
  return { from, to, sessions, planned, sets: week.length, volume: Math.round(v), volumeChange, muscles, pushPull: pull > 0 ? Math.round((press / pull) * 10) / 10 : null, prs, flags };
}

/** Library names grouped by muscle — given to the AI so its plans use names the app can track. */
export function libraryFor(muscles: Muscle[]) {
  return muscles.map((m) => `${m}: ${EXERCISES.filter((e) => e.muscle === m).map((e) => e.name).join(', ')}`).join('\n');
}
