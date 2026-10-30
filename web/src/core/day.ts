// The day's bookends: a morning top 3 and an evening shutdown ritual. Pure: no React, no I/O.

export type Top = { t: string; done: boolean };

/** A day's top 3 from its stored JSON; tolerant of junk and old plain-text values. */
export function parseTop(s: string | null | undefined): Top[] {
  if (!s?.trim()) return [];
  try {
    const v = JSON.parse(s);
    if (Array.isArray(v)) return v.filter((x) => x && typeof x.t === 'string' && x.t.trim()).slice(0, 3).map((x) => ({ t: String(x.t).slice(0, 140), done: !!x.done }));
  } catch {
    // A plain sentence from before this was a list.
  }
  return [{ t: s.trim().slice(0, 140), done: false }];
}
export const topJson = (items: Top[]) => JSON.stringify(items.filter((x) => x.t.trim()).slice(0, 3));

/** Move a task to tomorrow, keeping its time of day ("2026-10-30T18:00" → "2026-10-31T18:00"). */
export const toTomorrow = (due: string | null, tomorrow: string) => (due && due.length > 10 ? `${tomorrow}${due.slice(10)}` : tomorrow);

export const SHUTDOWN_STEPS = [
  { id: 'debrief', title: 'Chequered flag', hint: 'How today went' },
  { id: 'loops', title: 'Close the loops', hint: 'Nothing left hanging' },
  { id: 'story', title: 'Daily 3', hint: 'Three questions about you' },
  { id: 'win', title: 'One good thing', hint: 'And how’s the tank?' },
  { id: 'tomorrow', title: 'Tomorrow', hint: 'Set the grid' },
] as const;

export const ENERGY = ['🪫', '😮‍💨', '😐', '🙂', '⚡'];

/** Consecutive dates ending today (or yesterday, if today's isn't in yet) — shutdowns, Daily 3 days. */
export function runEnding(dates: string[], today: string) {
  const set = new Set(dates);
  const d = new Date(`${today}T12:00:00`);
  if (!set.has(today)) d.setDate(d.getDate() - 1);
  let n = 0;
  for (;;) {
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (!set.has(k)) return n;
    n++;
    d.setDate(d.getDate() - 1);
  }
}
