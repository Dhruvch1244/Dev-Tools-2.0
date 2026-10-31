// Pure gym logic — no React/DOM imports (dsgn pillar #1), so it can be unit-tested headless.

export type DayType = 'push' | 'pull' | 'legs' | 'upper' | 'lower' | 'rest';

/** The 7-day split, in order. Two rest days per lap. */
export const CYCLE: DayType[] = ['push', 'pull', 'legs', 'rest', 'upper', 'lower', 'rest'];

/**
 * Anchor: Wed 2026-10-28 was Legs (cycle index 2) — confirmed by the user.
 * Skipped/extra days are handled by a stored `shift` (days), never by rewriting history:
 * past workouts keep the day type they were logged as.
 */
export const ANCHOR = { date: '2026-10-28', index: 2 };

export const DAY_META: Record<DayType, { label: string; short: string; focus: string; color: string }> = {
  push: { label: 'Push', short: 'PSH', focus: 'Chest · Shoulders · Triceps', color: '#e10600' },
  pull: { label: 'Pull', short: 'PUL', focus: 'Back · Rear delts · Biceps', color: '#4fb3ff' },
  legs: { label: 'Legs', short: 'LEG', focus: 'Quads · Hamstrings · Glutes · Calves', color: '#ffd23f' },
  upper: { label: 'Upper', short: 'UPR', focus: 'Chest · Back · Shoulders · Arms', color: '#b26bff' },
  lower: { label: 'Lower', short: 'LWR', focus: 'Posterior chain · Quads · Core', color: '#2bd46b' },
  rest: { label: 'Rest', short: 'BOX', focus: 'Pit stop — recover, walk, stretch', color: '#6a7080' },
};

const dayNum = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000);
};
const mod = (n: number, m: number) => ((n % m) + m) % m;

export function cycleIndex(date: string, shift = 0) {
  return mod(ANCHOR.index + dayNum(date) - dayNum(ANCHOR.date) - shift, CYCLE.length);
}
export const dayTypeOn = (date: string, shift = 0) => CYCLE[cycleIndex(date, shift)];

export type Exercise = { name: string; sets: number; reps: string };

/** Starting templates; the user edits these per day type (stored as an overlay in settings). */
export const DEFAULT_TEMPLATES: Record<Exclude<DayType, 'rest'>, Exercise[]> = {
  push: [
    { name: 'Barbell Bench Press', sets: 4, reps: '6-8' },
    { name: 'Overhead Press', sets: 3, reps: '6-8' },
    { name: 'Incline Dumbbell Press', sets: 3, reps: '8-10' },
    { name: 'Cable Lateral Raise', sets: 4, reps: '12-15' },
    { name: 'Triceps Pushdown', sets: 3, reps: '10-12' },
    { name: 'Overhead Triceps Extension', sets: 3, reps: '10-12' },
  ],
  pull: [
    { name: 'Barbell Row', sets: 4, reps: '6-8' },
    { name: 'Lat Pulldown', sets: 3, reps: '8-10' },
    { name: 'Seated Cable Row', sets: 3, reps: '10-12' },
    { name: 'Face Pull', sets: 3, reps: '12-15' },
    { name: 'Barbell Curl', sets: 3, reps: '8-10' },
    { name: 'Hammer Curl', sets: 3, reps: '10-12' },
  ],
  legs: [
    { name: 'Back Squat', sets: 4, reps: '5-8' },
    { name: 'Romanian Deadlift', sets: 3, reps: '8-10' },
    { name: 'Leg Press', sets: 3, reps: '10-12' },
    { name: 'Lying Leg Curl', sets: 3, reps: '10-12' },
    { name: 'Leg Extension', sets: 3, reps: '12-15' },
    { name: 'Standing Calf Raise', sets: 4, reps: '10-15' },
  ],
  upper: [
    { name: 'Incline Barbell Press', sets: 4, reps: '6-8' },
    { name: 'Weighted Pull-up', sets: 4, reps: '6-8' },
    { name: 'Dumbbell Shoulder Press', sets: 3, reps: '8-10' },
    { name: 'Chest-Supported Row', sets: 3, reps: '8-10' },
    { name: 'EZ-Bar Curl', sets: 3, reps: '10-12' },
    { name: 'Skull Crusher', sets: 3, reps: '10-12' },
  ],
  lower: [
    { name: 'Conventional Deadlift', sets: 3, reps: '3-5' },
    { name: 'Hack Squat', sets: 3, reps: '8-10' },
    { name: 'Bulgarian Split Squat', sets: 3, reps: '8-10' },
    { name: 'Hip Thrust', sets: 3, reps: '8-12' },
    { name: 'Seated Calf Raise', sets: 4, reps: '12-15' },
    { name: 'Hanging Leg Raise', sets: 3, reps: '10-15' },
  ],
};

export type SetRow = { exercise: string; weight: number; reps: number };

/** Epley estimate. Rep counts above ~12 make any 1RM formula unreliable, so cap the input. */
export const e1rm = (weight: number, reps: number) => (reps <= 0 ? 0 : weight * (1 + Math.min(reps, 12) / 30));
export const volume = (sets: SetRow[]) => sets.reduce((a, s) => a + s.weight * s.reps, 0);
/**
 * How good a set is, for PRs and sector colours. Loaded sets compare by e1RM; bodyweight sets
 * (logged at 0 kg — calf raises on a step, push-ups) compare by reps, and any loaded set ranks above
 * a bodyweight one. Volume stays external load only, so bodyweight sets add sets, not kilos.
 */
export const setScore = (weight: number, reps: number) => (weight > 0 ? e1rm(weight, reps) : Math.max(0, reps) / 1000);

/**
 * F1 timing colours for a set, like a sector on the timing screen:
 *   purple — the session's best set for this exercise AND it beats every earlier session
 *            (on the very first session it's the benchmark, so it also goes purple)
 *   green  — beats the previous session's best
 *   yellow — neither
 * Only the session-best set can be purple; otherwise a first session paints every set purple.
 */
export function sectorColor(set: SetRow, sessionBest: number, priorBest: number, lastSessionBest: number): 'purple' | 'green' | 'yellow' {
  const v = setScore(set.weight, set.reps);
  if (v > 0 && v === sessionBest && v > priorBest) return 'purple';
  if (v > lastSessionBest) return 'green';
  return 'yellow';
}

/** Best e1RM per exercise across sets, optionally excluding one workout. */
export function bestByExercise(sets: (SetRow & { workout_id: string })[], excludeWorkout?: string) {
  const m = new Map<string, number>();
  for (const s of sets) if (s.workout_id !== excludeWorkout) m.set(s.exercise, Math.max(m.get(s.exercise) ?? 0, setScore(s.weight, s.reps)));
  return m;
}

// ---------- Progressive overload (double progression) ----------
const BIG_LOWER = /squat|deadlift|leg press|hip thrust|rack pull|hack/i;

export function repRange(reps: string): [number, number] {
  const m = /(\d+)\s*-\s*(\d+)/.exec(reps);
  if (m) return [Number(m[1]), Number(m[2])];
  const n = Number(reps) || 8;
  return [n, n];
}

export type Suggestion = { weight: number; reps: number; why: string };

/**
 * Double progression: keep the weight and add reps until every working set reaches the top of the
 * range, then add weight (+5 kg for big lower-body lifts, +2.5 kg otherwise) and drop back to the
 * bottom of the range. No history → no guess; the coach says how to pick a starting weight.
 */
export function suggestNext(exercise: string, reps: string, last: SetRow[]): Suggestion | null {
  if (!last.length) return null;
  const [lo, hi] = repRange(reps);
  const top = Math.max(...last.map((s) => s.weight));
  const atTop = last.filter((s) => s.weight === top);
  const step = BIG_LOWER.test(exercise) ? 5 : 2.5;
  // Bodyweight: progress by reps; past the top of the range, more reps or a harder version.
  if (top <= 0) {
    const best = Math.max(...last.map((s) => s.reps));
    if (last.every((s) => s.reps >= hi)) return { weight: 0, reps: best + 1, why: `Every set hit ${hi} at bodyweight — go for ${best + 1}, or hold a dumbbell / go single-leg` };
    return { weight: 0, reps: Math.min(hi, best + 1), why: `Bodyweight — beat ${best} reps (aim ${Math.min(hi, best + 1)})` };
  }
  if (atTop.every((s) => s.reps >= hi)) return { weight: top + step, reps: lo, why: `All sets hit ${hi} at ${top} kg — add ${step} kg` };
  const best = Math.max(...atTop.map((s) => s.reps));
  return { weight: top, reps: Math.min(hi, best + 1), why: `Stay at ${top} kg, beat ${best} reps (aim ${Math.min(hi, best + 1)})` };
}

/** Plates per side for a barbell load (kg), greedy over a standard plate set. */
export function platesPerSide(total: number, bar = 20): number[] | null {
  let side = (total - bar) / 2;
  if (side < 0) return null;
  const out: number[] = [];
  for (const p of [25, 20, 15, 10, 5, 2.5, 1.25]) while (side >= p - 1e-9) (out.push(p), (side -= p));
  return side > 0.01 ? null : out;
}
