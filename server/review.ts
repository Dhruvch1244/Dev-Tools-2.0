// Weekly AI debrief: every Sunday evening the week's numbers (food, gym, sport, DSA, health, money,
// tasks, journal) go to Claude, which writes a short race-engineer review with what to fix next week.
// Stored per week (Monday date) so the Report page can show it and earlier ones.
import { db } from './db.ts';
import { localStamp, pushAll } from './push.ts';
import { settings } from './briefs.ts';
import { ask } from './coach.ts';
import { claimToday, nowHM } from './scheduler.ts';
import { DEFAULT_PROFILE, targets } from '../web/src/core/fuel.ts';
import { DAY_META, dayTypeOn } from '../web/src/core/gym.ts';
import { workConfig, workWeek } from '../web/src/core/work.ts';

db.exec('CREATE TABLE IF NOT EXISTS reviews (week TEXT PRIMARY KEY, body TEXT NOT NULL, created_at TEXT NOT NULL)');

const q = <T>(sql: string, ...a: (string | number)[]) => db.prepare(sql).all(...a) as T[];
const one = <T>(sql: string, ...a: (string | number)[]) => db.prepare(sql).get(...a) as T | undefined;
const addDays = (d: string, n: number) => new Date(Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10) + n)).toISOString().slice(0, 10);
export const mondayOf = (d: string) => addDays(d, -((new Date(`${d}T12:00:00Z`).getUTCDay() + 6) % 7));

export const REVIEW_SYSTEM = `You are the race engineer giving a driver their weekly debrief — the driver is a software engineer in India improving fitness (gym split Push/Pull/Legs/Rest/Upper/Lower/Rest), eating strictly vegetarian (no egg, meat or fish), grinding DSA, and alternating office and work-from-home weeks.
Write Markdown, max ~280 words, exactly these sections:
## 🏆 Podium
Three concrete wins from the data (numbers!).
## 📻 Box box
Two or three things that slipped, each with ONE specific fix for next week that fits their schedule (office vs home week, cook makes dinner + next-day breakfast, rice-bowl lunch).
## 📊 Telemetry
A small table: metric | this week | target/last week.
## 🏁 Next race
3–4 bullets: the plan for next week, using next week's office/home days and gym days.
Be direct and warm, no fluff. Use only the data given; if something wasn't tracked, say "not logged" rather than guessing.`;

/** The week's data as compact text for the prompt. */
export function weekData(start: string) {
  const s = settings();
  const end = addDays(start, 6);
  const t = targets(s.fuel ?? DEFAULT_PROFILE);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const food = q<{ date: string; k: number; p: number }>('SELECT date, sum(kcal) k, sum(protein) p FROM food_logs WHERE date BETWEEN ? AND ? GROUP BY date', start, end);
  const workouts = q<{ date: string; day_type: string; n: number }>('SELECT w.date, w.day_type, (SELECT count(*) FROM sets s WHERE s.workout_id = w.id) n FROM workouts w WHERE w.date BETWEEN ? AND ? AND w.finished_at IS NOT NULL', start, end);
  const acts = q<{ date: string; type: string; duration_min: number; distance_km: number | null }>('SELECT date, type, duration_min, distance_km FROM activities WHERE date BETWEEN ? AND ?', start, end);
  const solved = q<{ problem: string }>("SELECT problem FROM dsa_progress WHERE status IN ('solved','revisit') AND substr(solved_at,1,10) BETWEEN ? AND ?", start, end);
  const health = q<{ date: string; kind: string; value: number }>("SELECT date, kind, value FROM health WHERE date BETWEEN ? AND ? AND kind IN ('sleep','water','weight','mood')", start, end);
  const spend = q<{ category: string; t: number }>("SELECT category, sum(amount) t FROM expenses WHERE kind = 'expense' AND date BETWEEN ? AND ? GROUP BY category ORDER BY t DESC", start, end);
  const tasksDone = one<{ n: number }>('SELECT count(*) n FROM tasks WHERE done = 1 AND substr(done_at,1,10) BETWEEN ? AND ?', start, end)?.n ?? 0;
  const overdue = one<{ n: number }>('SELECT count(*) n FROM tasks WHERE done = 0 AND due IS NOT NULL AND substr(due,1,10) <= ?', end)?.n ?? 0;
  const habits = q<{ name: string; n: number }>('SELECT h.name, (SELECT count(*) FROM habit_logs l WHERE l.habit_id = h.id AND l.date BETWEEN ? AND ?) n FROM habits h WHERE h.archived = 0', start, end);
  const supps = one<{ n: number }>("SELECT count(*) n FROM checks WHERE kind = 'supp' AND date BETWEEN ? AND ?", start, end)?.n ?? 0;
  const journal = q<{ date: string; body: string }>("SELECT date, body FROM journal WHERE date BETWEEN ? AND ? AND trim(coalesce(body,'')) != ''", start, end);
  const wc = workConfig(s.work);
  const work = workWeek(start, 7, wc, s.workOverrides);
  const next = workWeek(addDays(start, 7), 7, wc, s.workOverrides);
  const h = (k: string) => health.filter((x) => x.kind === k);
  const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);
  const dn = (d: string) => new Date(`${d}T12:00:00Z`).toUTCString().slice(0, 3);

  return [
    `WEEK ${start} to ${end}. Targets: ${t.kcal} kcal, ${t.protein} g protein per day.`,
    `FOOD by day: ${days.map((d) => {
      const f = food.find((x) => x.date === d);
      return `${dn(d)} ${f ? `${Math.round(f.k)} kcal/${Math.round(f.p)} g P` : 'not logged'}`;
    }).join('; ')}`,
    `GYM plan vs done: ${days.map((d) => {
      const plan = dayTypeOn(d, s.gymShift ?? 0);
      const w = workouts.find((x) => x.date === d);
      return `${dn(d)} ${DAY_META[plan].label}${plan === 'rest' ? '' : w ? ` ✓ (${w.n} sets)` : ' ✗'}`;
    }).join('; ')}`,
    `SPORT: ${acts.map((a) => `${dn(a.date)} ${a.type} ${Math.round(a.duration_min)} min${a.distance_km ? ` ${a.distance_km.toFixed(1)} km` : ''}`).join('; ') || 'none'}`,
    `DSA solved: ${solved.length} (${solved.map((x) => x.problem).join(', ') || '—'})`,
    `HEALTH: avg sleep ${avg(h('sleep').map((x) => x.value)) ?? 'not logged'} h, avg water ${avg(h('water').map((x) => x.value)) ?? '—'} glasses, mood ${h('mood').map((x) => x.value).join(',') || 'not logged'}, weight ${h('weight').map((x) => `${dn(x.date)} ${x.value}`).join(', ') || 'not logged'}`,
    `HABITS: ${habits.map((x) => `${x.name} ${x.n}/7`).join(', ') || 'none'}; supplements taken ${supps} times`,
    `TASKS: ${tasksDone} done, ${overdue} overdue at week end`,
    `MONEY: ₹${Math.round(spend.reduce((a, x) => a + x.t, 0))} (${spend.map((x) => `${x.category} ₹${Math.round(x.t)}`).join(', ') || 'nothing logged'})`,
    `WORK this week: ${work.map((d) => `${dn(d.date)} ${d.mode}`).join(', ')}`,
    `NEXT WEEK: work ${next.map((d) => `${dn(d.date)} ${d.mode}`).join(', ')}; gym ${next.map((d) => `${dn(d.date)} ${DAY_META[dayTypeOn(d.date, s.gymShift ?? 0)].label}`).join(', ')}`,
    journal.length ? `JOURNAL snippets:\n${journal.map((j) => `${dn(j.date)}: ${j.body.trim().slice(0, 300)}`).join('\n')}` : 'JOURNAL: nothing written',
  ].join('\n');
}

export async function generateReview(week: string, signal = new AbortController().signal) {
  const body = await ask(REVIEW_SYSTEM, weekData(week), { onDelta: () => {}, signal });
  db.prepare('INSERT INTO reviews (week, body, created_at) VALUES (?, ?, ?) ON CONFLICT (week) DO UPDATE SET body = excluded.body, created_at = excluded.created_at').run(week, body.trim(), new Date().toISOString());
  return { week, body: body.trim() };
}

export const listReviews = () => q<{ week: string; body: string; created_at: string }>('SELECT * FROM reviews ORDER BY week DESC LIMIT 12');

/** Sunday 19:30 (or later that evening if the laptop was asleep): write this week's debrief and push it. */
export async function reviewTick() {
  if (new Date().getDay() !== 0 || nowHM() < '19:30' || !claimToday('ai-review')) return;
  const week = mondayOf(localStamp(new Date()).slice(0, 10));
  const r = await generateReview(week);
  const podium = r.body.split('\n').find((l) => /^[-*\d]/.test(l.trim()))?.replace(/^[-*\d.\s]+/, '') ?? 'Your week, reviewed.';
  await pushAll({ tag: 'ai-review', title: '🏁 Weekly debrief is in', body: podium.slice(0, 140), url: '/report' });
}
