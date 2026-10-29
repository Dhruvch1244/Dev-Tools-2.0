// Auto-plan the week: lay gym, DSA, walks and life admin into the free time around each day's work
// (office with commute, or WFH), routines and calendar events. Rule-based and deterministic so the
// plan is instant, offline, and the same on every device. Pure: no React, no I/O.

import { DAY_META, dayTypeOn } from './gym';
import { workDay, type WorkConfig, type WorkOverride } from './work';

export type BlockKind = 'work' | 'commute' | 'gym' | 'dsa' | 'walk' | 'meal' | 'cook' | 'pack' | 'shop' | 'review' | 'winddown' | 'routine' | 'event' | 'call';
export type Block = { id: string; kind: BlockKind; title: string; start: string; end: string; fixed: boolean; note?: string };
export type DayPlan = { date: string; label: string; blocks: Block[]; free: number };

export type PlanPrefs = { wake: string; sleep: string; gymMin: number; gymWhen: 'auto' | 'morning' | 'evening' };
export const DEFAULT_PREFS: PlanPrefs = { wake: '06:30', sleep: '23:00', gymMin: 75, gymWhen: 'auto' };

/** Blocks the reminders job pings for ("Gym in 10 min"). */
export const REMIND_KINDS: BlockKind[] = ['gym', 'dsa', 'walk', 'pack', 'shop', 'cook', 'call'];

/** A routine that is the user's gym session ("Gym", "Workout", "Lift"). */
export const isGymRoutine = (name: string) => /\b(gym|workout|lift|weights?)\b/i.test(name);

const m = (hm: string) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5));
const hm = (n: number) => `${String(Math.floor(n / 60) % 24).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
const DAY = 86_400_000;
const add = (d: string, n: number) => new Date(Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) + n * DAY).toISOString().slice(0, 10);
const dow = (d: string) => new Date(`${d}T12:00:00Z`).getUTCDay();

type Busy = { s: number; e: number };
/** First gap of `len` minutes inside [from, to] that doesn't overlap anything busy. */
function slot(busy: Busy[], len: number, from: number, to: number): number | null {
  const sorted = [...busy].sort((a, b) => a.s - b.s);
  let t = from;
  for (const b of sorted) {
    if (b.e <= t) continue;
    if (b.s >= t + len) break;
    t = Math.max(t, b.e);
  }
  // Round up to the next 5 minutes so times look human.
  t = Math.ceil(t / 5) * 5;
  return t + len <= to && !sorted.some((b) => b.s < t + len && b.e > t) ? t : null;
}

export type PlanInput = {
  from: string;
  days?: number;
  work: WorkConfig;
  overrides?: Record<string, WorkOverride>;
  gymShift: number;
  prefs?: Partial<PlanPrefs>;
  /** DSA problems scheduled on a date (count). */
  dsaCount: (date: string) => number;
  routines: { name: string; time: string; duration_min: number; days: number[] }[];
  events?: { date: string; title: string; start: string; end: string }[];
  /** People due a call on a date (names). */
  calls?: (date: string) => string[];
  cookAt?: string;
};

export function planWeek(input: PlanInput): DayPlan[] {
  const p = { ...DEFAULT_PREFS, ...(input.prefs ?? {}) };
  const out: DayPlan[] = [];
  for (let i = 0; i < (input.days ?? 7); i++) {
    const date = add(input.from, i);
    const w = workDay(date, input.work, input.overrides);
    const tomorrow = workDay(add(date, 1), input.work, input.overrides);
    const gym = dayTypeOn(date, input.gymShift);
    const weekend = w.mode === 'off' || w.mode === 'leave';
    const wake = m(p.wake);
    const sleep = m(p.sleep);
    const blocks: Block[] = [];
    const busy: Busy[] = [];
    const put = (b: Omit<Block, 'id'>) => {
      blocks.push({ ...b, id: `${date}:${b.kind}:${b.start}` });
      busy.push({ s: m(b.start), e: m(b.end) });
    };
    const place = (kind: BlockKind, title: string, len: number, windows: [number, number][], note?: string) => {
      for (const [a, b] of windows) {
        const t = slot(busy, len, Math.max(a, wake), Math.min(b, sleep));
        if (t != null) return put({ kind, title, start: hm(t), end: hm(t + len), fixed: false, note }), true;
      }
      return false;
    };

    // Fixed: work (and the commute either side), routines, calendar events.
    if (w.shift && w.mode === 'office') {
      put({ kind: 'commute', title: 'Commute', start: w.leaveBy!, end: w.shift.login, fixed: true });
      put({ kind: 'work', title: `Office · ${w.shift.label}`, start: w.shift.login, end: w.shift.logout, fixed: true, note: 'Lunch at the desk — log what you eat' });
      put({ kind: 'commute', title: 'Commute home', start: w.shift.logout, end: w.homeBy!, fixed: true });
    } else if (w.shift && w.mode === 'wfh') put({ kind: 'work', title: `WFH · ${w.shift.label}`, start: w.shift.login, end: w.shift.logout, fixed: true, note: `Lunch ~13:30, log it${input.cookAt ? ` · brief the cook at ${input.cookAt}` : ''}` });
    // Your own gym / wind-down routines ARE those blocks: don't schedule a second one beside them.
    let gymRoutine: { time: string; duration_min: number } | null = null;
    let windRoutine = false;
    for (const r of input.routines.filter((r) => r.days.includes(dow(date)))) {
      if (isGymRoutine(r.name)) {
        gymRoutine = r;
        continue;
      }
      if (/wind|sleep|bed/i.test(r.name)) windRoutine = true;
      put({ kind: r.name.match(/wind|sleep|bed/i) ? 'winddown' : 'routine', title: r.name, start: r.time, end: hm(m(r.time) + r.duration_min), fixed: true });
    }
    for (const e of (input.events ?? []).filter((e) => e.date === date)) put({ kind: 'event', title: e.title, start: e.start, end: e.end, fixed: true });

    // Meals: breakfast before leaving / early, dinner ~20:30 (after the gym if it runs late).
    const bfast = w.mode === 'office' && w.leaveBy ? m(w.leaveBy) - 30 : wake + 60;
    place('meal', 'Breakfast (made yesterday)', 20, [[bfast, bfast + 60], [wake, 11 * 60]]);
    if (weekend) place('meal', 'Lunch', 30, [[13 * 60, 15 * 60]]);

    // Gym: after work on office days (home + 20 min), else the user's preference.
    if (gym !== 'rest' && gymRoutine && !busy.some((b) => b.s < m(gymRoutine!.time) + gymRoutine!.duration_min && b.e > m(gymRoutine!.time))) {
      put({ kind: 'gym', title: `${DAY_META[gym].label} day`, start: gymRoutine.time, end: hm(m(gymRoutine.time) + gymRoutine.duration_min), fixed: false, note: `${DAY_META[gym].focus} · your Gym routine` });
    } else if (gym !== 'rest') {
      const evening: [number, number] = [w.homeBy ? m(w.homeBy) + 20 : w.shift ? m(w.shift.logout) + 15 : 17 * 60, 22 * 60];
      const morning: [number, number] = [wake + 15, w.mode === 'office' && w.leaveBy ? m(w.leaveBy) - 35 : w.shift ? m(w.shift.login) - 15 : 12 * 60];
      const order = p.gymWhen === 'morning' ? [morning, evening] : p.gymWhen === 'evening' ? [evening, morning] : weekend ? [[9 * 60, 12 * 60] as [number, number], evening] : [evening, morning];
      if (!place('gym', `${DAY_META[gym].label} day`, p.gymMin, order, DAY_META[gym].focus)) place('gym', `${DAY_META[gym].label} (short)`, 45, order, 'Short on time — main lifts only');
    }
    place('meal', 'Dinner', 30, [[20 * 60 + 15, 22 * 60], [19 * 60, 22 * 60 + 30]]);

    // DSA on the laptop: ~30 min per problem, longer on weekends.
    const n = input.dsaCount(date);
    if (n > 0 || weekend) {
      const len = weekend ? 90 : Math.min(90, Math.max(45, n * 30));
      const win: [number, number][] = weekend ? [[10 * 60, 13 * 60], [16 * 60, 20 * 60]] : w.mode === 'wfh' && w.shift ? [[m(w.shift.logout) + 10, 20 * 60], [20 * 60, sleep - 30], [wake, m(w.shift.login)]] : [[20 * 60 + 45, sleep - 30], [wake, 12 * 60]];
      place('dsa', weekend ? 'DSA — long session' : `DSA · ${n} problem${n > 1 ? 's' : ''}`, len, win, 'On the laptop');
    }
    // Rest days get a walk; busy office days get a short one after dinner.
    if (gym === 'rest') place('walk', 'Walk', 30, [[17 * 60, 20 * 60], [wake, 10 * 60]], 'Recovery — 3–4 km easy');
    for (const name of input.calls?.(date) ?? []) place('call', `Call ${name}`, 20, [[19 * 60, 21 * 60 + 30], [12 * 60, 19 * 60]]);
    if (dow(date) === 0) {
      place('shop', 'Groceries — shopping list', 45, [[11 * 60, 13 * 60], [16 * 60, 19 * 60]], 'Paneer, curd, dal, veg for the week');
      place('review', 'Read the weekly debrief', 15, [[19 * 60 + 30, 21 * 60 + 30]]);
    }
    if (tomorrow.mode === 'office') place('pack', 'Pack for the office', 10, [[21 * 60 + 30, sleep - 20], [20 * 60, sleep]], 'ID, laptop, charger, bottle — gym bag if needed');
    if (!windRoutine) put({ kind: 'winddown', title: 'Wind down — screens off', start: hm(sleep - 30), end: hm(sleep), fixed: false });

    blocks.sort((a, b) => m(a.start) - m(b.start));
    const used = busy.reduce((a, b) => a + (b.e - b.s), 0);
    out.push({
      date,
      label: w.mode === 'office' ? 'Office' : w.mode === 'wfh' ? 'WFH' : w.mode === 'leave' ? 'Leave' : 'Off',
      blocks,
      free: Math.max(0, sleep - wake - used),
    });
  }
  return out;
}

/** "Mon 09:30–18:00 WFH · 18:15 Push day · 21:00 DSA" for prompts and notifications. */
export const planText = (days: DayPlan[]) =>
  days.map((d) => `${d.date} (${d.label}): ${d.blocks.filter((b) => !['meal', 'winddown', 'commute'].includes(b.kind)).map((b) => `${b.start}-${b.end} ${b.title}`).join('; ')}`).join('\n');
