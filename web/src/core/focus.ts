// DSA focus stints: a timed block on one problem, with honest "did I wander off?" tracking.
// Pure: no React, no I/O.

export type Stint = { date: string; started_at: string; planned: number; minutes: number; ended_at: string | null; distractions: number; away_sec: number };

export const LENGTHS = [25, 45, 60, 90];
/** Leaving the tab for longer than this asks "LeetCode, or wandered?" on return. */
export const AWAY_ASK_SEC = 90;

/** Live stint: started, not ended, and not long abandoned (closed laptop mid-stint). */
export function activeStint<T extends Stint>(rows: T[], now: number): T | null {
  return rows.find((r) => !r.ended_at && now - Date.parse(r.started_at) < (r.planned + 30) * 60_000) ?? null;
}

/** Seconds left (negative once over time). */
export const leftSec = (s: Pick<Stint, 'started_at' | 'planned'>, now: number) => Math.round(s.planned * 60 - (now - Date.parse(s.started_at)) / 1000);

/** Real minutes in a finished stint: wall time, capped at the plan, minus time you said you wandered. */
export function stintMinutes(s: Pick<Stint, 'started_at' | 'planned' | 'away_sec'>, endedAt: number) {
  const wall = Math.min(s.planned * 60, Math.max(0, (endedAt - Date.parse(s.started_at)) / 1000));
  return Math.max(0, Math.round(((wall - s.away_sec) / 60) * 10) / 10);
}

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** The last 7 days of focused minutes (oldest first) plus today's and the week's totals. */
export function focusWeek(rows: Stint[], today: string) {
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(`${today}T12:00:00`);
    d.setDate(d.getDate() - (6 - i));
    return iso(d);
  });
  const per = days.map((date) => ({ date, minutes: Math.round(rows.filter((r) => r.date === date && r.ended_at).reduce((a, r) => a + r.minutes, 0)) }));
  const done = rows.filter((r) => r.ended_at && days.includes(r.date));
  return {
    days: per,
    today: per[6].minutes,
    week: per.reduce((a, d) => a + d.minutes, 0),
    stints: done.length,
    /** Wanders per hour of focus, the number to push down. */
    wanderRate: done.length ? done.reduce((a, r) => a + r.distractions, 0) / Math.max(1, done.reduce((a, r) => a + r.minutes, 0) / 60) : 0,
  };
}

export const clock = (sec: number) => {
  const s = Math.abs(sec);
  return `${sec < 0 ? '+' : ''}${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
