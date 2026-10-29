// Habit science for the Routines page: streaks that respect scheduled days (a Mon–Fri habit isn't
// broken by a Saturday), "never miss twice", championship points and driver levels, and the
// 12-week grid. Pure: no React, no I/O. Dates are "YYYY-MM-DD".

const DAY = 86_400_000;
const utc = (d: string) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
export const shift = (d: string, n: number) => iso(utc(d) + n * DAY);
const weekday = (d: string) => new Date(utc(d)).getUTCDay();

/** Days of the week a habit is due (0 = Sunday). Null/empty = every day. */
export const parseDays = (s: string | null | undefined): number[] => {
  try {
    const v = s ? JSON.parse(s) : null;
    return Array.isArray(v) && v.length ? v.filter((x) => Number.isInteger(x) && x >= 0 && x <= 6) : [0, 1, 2, 3, 4, 5, 6];
  } catch {
    return [0, 1, 2, 3, 4, 5, 6];
  }
};
export const dueOn = (days: number[], date: string) => days.includes(weekday(date));

/**
 * Current streak in scheduled days: counts back from today (or yesterday, if today isn't ticked
 * yet — the day isn't over) over the days the habit is due, skipping the off days.
 */
export function streak(done: Set<string>, days: number[], today: string) {
  let d = done.has(today) ? today : shift(today, -1);
  let n = 0;
  for (let i = 0; i < 800; i++, d = shift(d, -1)) {
    if (!dueOn(days, d)) continue;
    if (!done.has(d)) break;
    n++;
  }
  // Ticked on an off day today still counts as a bonus day on top.
  if (done.has(today) && !dueOn(days, today)) n++;
  return n;
}

/** Longest run of scheduled days in a row, over the given history. */
export function bestStreak(done: Set<string>, days: number[], from: string, today: string) {
  let best = 0;
  let run = 0;
  for (let d = from; d <= today; d = shift(d, 1)) {
    if (!dueOn(days, d)) continue;
    if (done.has(d)) best = Math.max(best, ++run);
    else if (d !== today) run = 0;
  }
  return best;
}

/** Share of scheduled days done in the last `n` days (today counts only if it's ticked). */
export function rate(done: Set<string>, days: number[], today: string, n = 30) {
  let due = 0;
  let hit = 0;
  for (let i = 0; i < n; i++) {
    const d = shift(today, -i);
    if (!dueOn(days, d) || (d === today && !done.has(d))) continue;
    due++;
    if (done.has(d)) hit++;
  }
  return due ? hit / due : 0;
}

/**
 * "Never miss twice": missed the last scheduled day and today is due and not done yet. Missing once
 * is an accident; twice is the start of a new habit — so the page shouts about it.
 */
export function atRisk(done: Set<string>, days: number[], today: string) {
  if (!dueOn(days, today) || done.has(today)) return false;
  for (let i = 1; i <= 7; i++) {
    const d = shift(today, -i);
    if (dueOn(days, d)) return !done.has(d);
  }
  return false;
}

/** Championship points: 10 per tick, +5 on a 7+ streak day, +25 for a perfect day (everything due done). */
export const POINTS = { tick: 10, hot: 5, perfect: 25 };

export type HabitHistory = { id: string; days: number[]; done: Set<string> };

export function pointsOn(habits: HabitHistory[], date: string) {
  let p = 0;
  let due = 0;
  let hit = 0;
  for (const h of habits) {
    const on = h.done.has(date);
    if (on) p += POINTS.tick + (streak(h.done, h.days, date) >= 7 ? POINTS.hot : 0);
    if (dueOn(h.days, date)) (due++, on && hit++);
  }
  if (due > 0 && hit === due) p += POINTS.perfect;
  return p;
}

/** A day where every habit due was done. */
export const perfectDay = (habits: HabitHistory[], date: string) => {
  const due = habits.filter((h) => dueOn(h.days, date));
  return due.length > 0 && due.every((h) => h.done.has(date));
};

/** Perfect days in a row, ending today (or yesterday while today is still open). */
export function perfectStreak(habits: HabitHistory[], today: string) {
  let d = perfectDay(habits, today) ? today : shift(today, -1);
  let n = 0;
  for (let i = 0; i < 400 && perfectDay(habits, d); i++, d = shift(d, -1)) n++;
  return n;
}

/** Driver levels by career points. */
export const LEVELS = [
  { at: 0, name: 'Karting', emoji: '🛞' },
  { at: 300, name: 'F4', emoji: '🏁' },
  { at: 1000, name: 'F3', emoji: '🥉' },
  { at: 2500, name: 'F2', emoji: '🥈' },
  { at: 5000, name: 'F1 Rookie', emoji: '🏎️' },
  { at: 9000, name: 'Race winner', emoji: '🏆' },
  { at: 15000, name: 'World Champion', emoji: '👑' },
];
export function level(points: number) {
  let i = 0;
  while (i + 1 < LEVELS.length && points >= LEVELS[i + 1].at) i++;
  const next = LEVELS[i + 1];
  return { ...LEVELS[i], index: i, next: next ?? null, progress: next ? (points - LEVELS[i].at) / (next.at - LEVELS[i].at) : 1 };
}

/** 12 weeks × 7 days grid ending this week (columns = weeks, Monday first), for the heatmap. */
export function weeksGrid(today: string, weeks = 12) {
  const mondayOffset = (weekday(today) + 6) % 7;
  const start = shift(today, -mondayOffset - (weeks - 1) * 7);
  return Array.from({ length: weeks }, (_, w) => Array.from({ length: 7 }, (_, d) => shift(start, w * 7 + d)));
}

/** Habit stacking line: "After I <cue>, I will <name> (tiny: <tiny>)". */
export const stackLine = (h: { name: string; cue?: string | null; tiny?: string | null }) =>
  h.cue ? `After ${h.cue.replace(/^after\s+/i, '')}, I will ${h.tiny || h.name.toLowerCase()}` : null;

/** Starter habits that suit this user: build-up ideas, each with a cue and a 2-minute version. */
export const HABIT_IDEAS = [
  { name: 'Read 10 pages', emoji: '📖', cue: 'I get into bed', tiny: 'read one page', days: null },
  { name: 'Drink water first thing', emoji: '💧', cue: 'I wake up', tiny: 'drink one glass', days: null },
  { name: '10k steps', emoji: '🚶', cue: 'I log out of work', tiny: 'walk 10 minutes', days: null },
  { name: 'One DSA problem', emoji: '💻', cue: 'I finish dinner', tiny: 'open today’s problem', days: [1, 2, 3, 4, 5, 6] },
  { name: 'Stretch', emoji: '🧘', cue: 'I finish the gym', tiny: 'one 2-minute stretch', days: null },
  { name: 'No phone in bed', emoji: '📵', cue: 'I plug in my phone at night', tiny: 'charge it across the room', days: null },
  { name: 'Journal', emoji: '📓', cue: 'the evening push arrives', tiny: 'answer one question', days: null },
  { name: 'Hit protein', emoji: '🥛', cue: 'I log dinner', tiny: 'have a scoop of whey', days: null },
  { name: 'Learn something', emoji: '🧠', cue: 'I sit down with chai', tiny: 'watch one short video', days: [0, 6] },
];
