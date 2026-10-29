// Morning brief and evening recap pushes. Built from the same pure core modules the web app uses
// (gym split, DSA plan, fuel targets), so the numbers in a notification match the app exactly.
import { db } from './db.ts';
import { pushAll, localStamp } from './push.ts';
import { claimToday, nowHM } from './scheduler.ts';
import { DAY_META, dayTypeOn } from '../web/src/core/gym.ts';
import { DEFAULT_START, problemsForDay } from '../web/src/core/dsa/plan.ts';
import { DEFAULT_PROFILE, targets } from '../web/src/core/fuel.ts';
import { planDay } from '../web/src/core/mealPlan.ts';
import { weekLabel, workConfig, workDay, type WorkConfig, type WorkOverride } from '../web/src/core/work.ts';

export type Settings = { diet?: 'veg' | 'egg' | 'nonveg'; gymShift?: number; dsaStart?: string; fuel?: typeof DEFAULT_PROFILE; waterGoal?: number; briefs?: { morning?: boolean; evening?: boolean; morningAt?: string; eveningAt?: string }; name?: string; work?: Partial<WorkConfig>; workOverrides?: Record<string, WorkOverride> };
export function settings(): Settings {
  const rows = db.prepare('SELECT key, value FROM settings WHERE key NOT LIKE ?').all('job:%') as { key: string; value: string }[];
  return Object.fromEntries(rows.map((r) => [r.key, JSON.parse(r.value)]));
}
const q = <T>(sql: string, ...a: (string | number)[]) => db.prepare(sql).all(...a) as T[];
const one = <T>(sql: string, ...a: (string | number)[]) => db.prepare(sql).get(...a) as T | undefined;

/** "🥗 Breakfast 08:30 poha & chai · Lunch 13:30 roti, dal, sabzi" for meals not yet logged. */
function mealIdeas(day: string, s: Settings, t: ReturnType<typeof targets>, meals: ('breakfast' | 'lunch' | 'snacks' | 'dinner')[]) {
  const per = (m: string) => one<{ k: number; p: number }>('SELECT coalesce(sum(kcal),0) k, coalesce(sum(protein),0) p FROM food_logs WHERE date = ? AND meal = ?', day, m)!;
  const logged = Object.fromEntries(['breakfast', 'lunch', 'snacks', 'dinner'].map((m) => [m, { kcal: per(m).k, protein: per(m).p }])) as Parameters<typeof planDay>[0]['logged'];
  const all = Object.values(logged);
  const usual = q<{ food_id: string }>('SELECT DISTINCT food_id FROM food_logs WHERE food_id IS NOT NULL AND date >= date(?, \'-21 days\')', day).map((r) => r.food_id);
  const plan = planDay({ nowHM: localStamp(new Date()).slice(11), logged, remaining: { kcal: t.kcal - all.reduce((a, x) => a + x.kcal, 0), protein: t.protein - all.reduce((a, x) => a + x.protein, 0) }, usualIds: usual, diet: s.diet ?? 'veg' });
  const ideas = plan.filter((p) => meals.includes(p.meal) && p.options[0]).map((p) => `${p.meal[0].toUpperCase() + p.meal.slice(1)} ${p.at} ${p.options[0].name.toLowerCase()}`);
  return ideas.length ? `🥗 ${ideas.join(' · ')}` : null;
}

export function morningBrief(day = localStamp(new Date()).slice(0, 10)) {
  const s = settings();
  const type = dayTypeOn(day, s.gymShift ?? 0);
  const laps = problemsForDay(s.dsaStart ?? DEFAULT_START, day);
  const t = targets(s.fuel ?? DEFAULT_PROFILE);
  const due = one<{ n: number }>("SELECT count(*) n FROM tasks WHERE done = 0 AND substr(due, 1, 10) <= ?", day)?.n ?? 0;
  const dow = new Date(`${day}T12:00:00`).getDay();
  const routines = q<{ name: string; time: string; days: string; emoji: string | null }>('SELECT name, time, days, emoji FROM routines WHERE active = 1 ORDER BY time').filter((r) => JSON.parse(r.days).includes(dow));
  const wc = workConfig(s.work);
  const w = workDay(day, wc, s.workOverrides);
  const work = w.mode === 'office' ? `🏢 Office (${weekLabel(day, wc)}) — leave ${w.leaveBy}, login ${w.shift!.login}, logout ${w.shift!.logout}, home ${w.homeBy}` : w.mode === 'wfh' ? `🏠 WFH — login ${w.shift!.login}, logout ${w.shift!.logout}` : w.mode === 'leave' ? '🌴 On leave today' : null;
  const lines = [
    work,
    type === 'rest' ? '🛞 Rest day — walk, stretch, recover' : `🏋️ ${DAY_META[type].label} day — ${DAY_META[type].focus}`,
    laps.length ? `💻 DSA: ${laps.map((p) => p.title).join(' · ')}` : null,
    `🍽️ Target ${t.kcal} kcal · ${t.protein} g protein`,
    mealIdeas(day, s, t, ['breakfast', 'lunch']),
    routines.length ? `⏱️ ${routines.map((r) => `${r.time} ${r.name}`).join(' · ')}` : null,
    due ? `✅ ${due} task${due > 1 ? 's' : ''} due` : null,
  ].filter(Boolean);
  return { title: `🏁 Good morning — ${new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long' })}`, body: lines.join('\n'), url: '/' };
}

export function eveningRecap(day = localStamp(new Date()).slice(0, 10)) {
  const s = settings();
  const t = targets(s.fuel ?? DEFAULT_PROFILE);
  const food = one<{ k: number; p: number }>('SELECT coalesce(sum(kcal),0) k, coalesce(sum(protein),0) p FROM food_logs WHERE date = ?', day)!;
  const sets = one<{ n: number }>('SELECT count(*) n FROM sets WHERE date = ?', day)?.n ?? 0;
  const acts = q<{ type: string; duration_min: number; distance_km: number | null }>('SELECT type, duration_min, distance_km FROM activities WHERE date = ?', day);
  const water = one<{ value: number }>("SELECT value FROM health WHERE date = ? AND kind = 'water'", day)?.value ?? 0;
  const laps = problemsForDay(s.dsaStart ?? DEFAULT_START, day);
  const solved = laps.filter((p) => one<{ status: string }>('SELECT status FROM dsa_progress WHERE problem = ?', p.id)?.status === 'solved').length;
  const type = dayTypeOn(day, s.gymShift ?? 0);
  const proteinGap = Math.round(t.protein - food.p);
  const lines = [
    `🍽️ ${Math.round(food.k)} / ${t.kcal} kcal · protein ${Math.round(food.p)}/${t.protein} g${proteinGap > 15 ? ` (${proteinGap} g short)` : ' ✓'}`,
    type !== 'rest' ? (sets ? `🏋️ ${DAY_META[type].label}: ${sets} sets logged` : `🏋️ ${DAY_META[type].label} day — no sets logged yet`) : null,
    acts.length ? `🏃 ${acts.map((a) => `${a.type}${a.distance_km ? ` ${a.distance_km.toFixed(1)} km` : ` ${Math.round(a.duration_min)} min`}`).join(' · ')}` : null,
    laps.length ? `💻 DSA ${solved}/${laps.length} laps` : null,
    `💧 ${water}/${s.waterGoal ?? 8} glasses`,
    mealIdeas(day, s, t, ['dinner']),
  ].filter(Boolean);
  return { title: '🏁 Day debrief', body: lines.join('\n'), url: '/' };
}

/** Runs every scheduler tick; sends each brief once a day at its configured time (or late, until noon / midnight). */
export async function briefsTick() {
  const b = settings().briefs ?? {};
  const t = nowHM();
  if ((b.evening ?? true) && new Date().getDay() === 0 && t >= '20:00' && t <= '23:59' && claimToday('brief-weekly')) {
    const day = localStamp(new Date()).slice(0, 10);
    const from = new Date(Date.now() - 6 * 86_400_000);
    const start = localStamp(from).slice(0, 10);
    const sessions = one<{ n: number }>('SELECT count(*) n FROM workouts WHERE finished_at IS NOT NULL AND date BETWEEN ? AND ?', start, day)?.n ?? 0;
    const solved = one<{ n: number }>("SELECT count(*) n FROM dsa_progress WHERE status IN ('solved','revisit') AND substr(solved_at,1,10) BETWEEN ? AND ?", start, day)?.n ?? 0;
    const mins = one<{ m: number }>('SELECT coalesce(sum(duration_min),0) m FROM activities WHERE date BETWEEN ? AND ?', start, day)?.m ?? 0;
    await pushAll({ tag: 'brief-weekly', title: '🏆 Race report is in', body: `${sessions} gym sessions · ${Math.round(mins)} active min · ${solved} DSA solves this week. Tap for the full classification.`, url: '/report' });
  }
  if ((b.morning ?? true) && t >= (b.morningAt ?? '08:00') && t < '12:00' && claimToday('brief-morning')) await pushAll({ tag: 'brief-morning', ...morningBrief() });
  if ((b.evening ?? true) && t >= (b.eveningAt ?? '21:30') && t <= '23:59' && claimToday('brief-evening')) await pushAll({ tag: 'brief-evening', ...eveningRecap() });
}
