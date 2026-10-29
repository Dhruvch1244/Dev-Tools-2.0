// Repeating tasks and early reminders. A repeating task is one row whose due date rolls forward
// when it's ticked off — no pile of future copies. Pure: no React, no I/O.

export type Repeat = 'daily' | 'weekdays' | 'weekly' | 'monthly' | 'yearly';
export const REPEATS: { id: Repeat; label: string }[] = [
  { id: 'daily', label: 'Daily' },
  { id: 'weekdays', label: 'Weekdays' },
  { id: 'weekly', label: 'Weekly' },
  { id: 'monthly', label: 'Monthly' },
  { id: 'yearly', label: 'Yearly' },
];
export const isRepeat = (v: unknown): v is Repeat => REPEATS.some((r) => r.id === v);

/** Lead times offered for "remind me before". */
export const LEADS = [
  { min: 0, label: 'At time' },
  { min: 15, label: '15 min before' },
  { min: 60, label: '1 h before' },
  { min: 1440, label: '1 day before' },
];

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * The next due after `due` (date or date+time). Monthly keeps the day of month, clamped to the
 * month's length (31st → 30th/28th); later months return to the original day via `anchorDay`.
 * Rolls past `today` so an overdue repeating task lands on its next future slot.
 */
export function nextDue(due: string, repeat: Repeat, today: string, anchorDay = Number(due.slice(8, 10))): string {
  const time = due.length > 10 ? due.slice(10) : '';
  let [y, m, d] = [Number(due.slice(0, 4)), Number(due.slice(5, 7)), Number(due.slice(8, 10))];
  const fmt = () => `${y}-${pad(m)}-${pad(d)}`;
  const step = () => {
    if (repeat === 'monthly' || repeat === 'yearly') {
      if (repeat === 'monthly') (m += 1), m > 12 && ((m = 1), (y += 1));
      else y += 1;
      d = Math.min(anchorDay, new Date(Date.UTC(y, m, 0)).getUTCDate());
      return;
    }
    const t = new Date(Date.UTC(y, m - 1, d));
    do t.setUTCDate(t.getUTCDate() + (repeat === 'weekly' ? 7 : 1));
    while (repeat === 'weekdays' && (t.getUTCDay() === 0 || t.getUTCDay() === 6));
    [y, m, d] = [t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate()];
  };
  step();
  for (let i = 0; i < 4000 && fmt() < today; i++) step();
  return fmt() + time;
}

/** When the push for a task should fire: due − lead minutes (timed tasks only). */
export function remindAt(due: string, leadMin: number | null | undefined) {
  if (!due.includes('T')) return null;
  const t = new Date(due).getTime() - (leadMin ?? 0) * 60_000;
  return Number.isNaN(t) ? null : t;
}
