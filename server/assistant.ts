// "Pit Wall" — the general AI assistant — and the office reminders.
//
// The assistant gets a compact, freshly-built snapshot of the owner's day (office schedule, gym,
// fuel, tasks, routines, calendar, DSA) as text in its prompt. It never touches the database:
// changes come back as a fenced ```actions block that the app turns into confirm cards.
import { db } from './db.ts';
import { localStamp, pushAll } from './push.ts';
import { settings } from './briefs.ts';
import * as google from './google.ts';
import { DAY_META, dayTypeOn } from '../web/src/core/gym.ts';
import { DEFAULT_START, problemsForDay } from '../web/src/core/dsa/plan.ts';
import { DEFAULT_PROFILE, targets } from '../web/src/core/fuel.ts';
import { nextSwitch, weekLabel, workConfig, workDay, workPings, workWeek } from '../web/src/core/work.ts';
import { ACTIONS_GUIDE } from '../web/src/core/aiActions.ts';
import { nextBirthday, nextContact, peoplePings, type Person } from '../web/src/core/people.ts';
import { REMIND_KINDS, type DayPlan } from '../web/src/core/weekPlan.ts';
import { questionsFor, type Answer, type DayFacts } from '../web/src/core/journal.ts';
import { claimToday } from './scheduler.ts';
import { cookBrief, cookConfig, cookContext, planCookDay, wheyPlan } from '../web/src/core/cook.ts';

const q = <T>(sql: string, ...a: (string | number)[]) => db.prepare(sql).all(...a) as T[];
const one = <T>(sql: string, ...a: (string | number)[]) => db.prepare(sql).get(...a) as T | undefined;
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const CHAT_SYSTEM = `You are "Pit Wall", the race engineer for one person's life: a software engineer in India who self-hosts this app. You see a live snapshot of their day below each message.
Personality: calm, direct, a little F1 radio flavour ("box this", "push now") but never cheesy; practical over motivational.
Facts to respect: they are strictly vegetarian (no meat, fish or eggs; dairy is fine) — never suggest otherwise. Currency is INR. Their gym split is Push › Pull › Legs › Rest › Upper › Lower › Rest. They practise DSA in C++, Java and Python. They work office "connect weeks" alternating with work-from-home weeks; office days include a commute each way.
Use the snapshot to answer concretely (times, numbers, what's left). If something isn't in the snapshot, say so rather than invent it.
Format: Markdown, short. Use bullet lists or a small table for plans/schedules. Under ~180 words unless asked for detail.

${ACTIONS_GUIDE}`;

/** A plain-text snapshot of today (and the week ahead) for the assistant's prompt. */
export async function lifeContext() {
  const s = settings();
  const now = new Date();
  const stamp = localStamp(now);
  const day = stamp.slice(0, 10);
  const wc = workConfig(s.work);
  const w = workDay(day, wc, s.workOverrides);
  const next = nextSwitch(day, wc);
  const week = workWeek(day, 8, wc, s.workOverrides)
    .slice(1)
    .map((d) => `${DOW[new Date(`${d.date}T12:00:00`).getDay()]} ${d.date.slice(5)}: ${d.mode}${d.shift && d.mode === 'office' ? ` ${d.shift.login}-${d.shift.logout} (leave ${d.leaveBy})` : d.shift ? ` ${d.shift.login}-${d.shift.logout}` : ''}`);
  const gym = dayTypeOn(day, s.gymShift ?? 0);
  const tg = targets(s.fuel ?? DEFAULT_PROFILE);
  const food = one<{ k: number; p: number }>('SELECT coalesce(sum(kcal),0) k, coalesce(sum(protein),0) p FROM food_logs WHERE date = ?', day)!;
  const meals = q<{ meal: string; names: string }>("SELECT meal, group_concat(name, ', ') names FROM food_logs WHERE date = ? GROUP BY meal", day);
  const water = one<{ value: number }>("SELECT value FROM health WHERE date = ? AND kind = 'water'", day)?.value ?? 0;
  const recent = q<{ kind: string; value: number; date: string }>("SELECT kind, value, date FROM health WHERE kind IN ('sleep','weight','mood') AND date >= date(?, '-7 days') ORDER BY date DESC", day);
  const tasks = q<{ title: string; due: string | null; repeat: string | null; priority: number }>("SELECT title, due, repeat, priority FROM tasks WHERE done = 0 AND coalesce(kind, 'task') = 'task' AND (due IS NULL OR substr(due,1,10) <= date(?, '+14 days')) ORDER BY due IS NULL, due LIMIT 25", day);
  const plans = q<{ title: string; due: string; place: string | null }>("SELECT title, due, place FROM tasks WHERE done = 0 AND kind = 'plan' AND substr(due,1,10) BETWEEN ? AND date(?, '+30 days') ORDER BY due", day, day);
  const bills = q<{ title: string; due: string; amount: number | null; repeat: string | null }>("SELECT title, due, amount, repeat FROM tasks WHERE done = 0 AND kind = 'bill' ORDER BY due LIMIT 15");
  const dow = now.getDay();
  const routines = q<{ name: string; time: string; days: string; duration_min: number }>('SELECT name, time, days, duration_min FROM routines WHERE active = 1 ORDER BY time');
  const laps = problemsForDay(s.dsaStart ?? DEFAULT_START, day);
  const solved = laps.filter((p) => ['solved', 'revisit'].includes(one<{ status: string }>('SELECT status FROM dsa_progress WHERE problem = ?', p.id)?.status ?? '')).length;
  const sessions = one<{ n: number }>("SELECT count(*) n FROM workouts WHERE finished_at IS NOT NULL AND date >= date(?, '-6 days')", day)?.n ?? 0;
  const spent = one<{ t: number }>("SELECT coalesce(sum(amount),0) t FROM expenses WHERE kind = 'expense' AND substr(date,1,7) = ?", day.slice(0, 7))?.t ?? 0;
  const events = await google.events(day, day).catch(() => []);
  const people = q<Person>('SELECT * FROM people');
  const owed = q<{ name: string; net: number }>('SELECT p.name, sum(s.amount) net FROM splits s JOIN people p ON p.id = s.person_id WHERE s.settled_at IS NULL GROUP BY s.person_id HAVING round(net) != 0');
  const supps = (s as { supplements?: Supplement[] }).supplements ?? [];
  const shifts = wc.shifts.map((x) => `${x.id} ${x.login}-${x.logout}`).join(', ');

  return [
    `NOW: ${now.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}, ${stamp.slice(11)} (${day})`,
    s.name ? `Name: ${s.name}` : null,
    `WORK today: ${w.mode}${w.shift ? ` · shift ${w.shift.id} login ${w.shift.login} logout ${w.shift.logout}${w.actual.in ? ` (actually logged in ${w.actual.in}${w.actual.out ? `, out ${w.actual.out}` : ''})` : ''}` : ''}${w.leaveBy ? ` · leave home ${w.leaveBy}, home by ${w.homeBy} (commute ${wc.commute} min each way)` : ''} · ${weekLabel(day, wc)}${next ? ` · ${next.connect ? 'connect (office)' : 'home'} block starts ${next.date}` : ''}`,
    `Shifts: ${shifts}. Next 7 days: ${week.join('; ')}`,
    `GYM today: ${gym === 'rest' ? 'Rest' : `${DAY_META[gym].label} (${DAY_META[gym].focus})`}; tomorrow ${DAY_META[dayTypeOn(localStamp(new Date(now.getTime() + 86_400_000)).slice(0, 10), s.gymShift ?? 0)].label}. Finished sessions last 7 days: ${sessions}`,
    `FUEL: target ${tg.kcal} kcal / ${tg.protein} g protein; eaten ${Math.round(food.k)} kcal / ${Math.round(food.p)} g. ${meals.map((m) => `${m.meal}: ${m.names}`).join(' | ') || 'Nothing logged yet.'} Water ${water}/${s.waterGoal ?? 8} glasses. Whey goal ${wheyPlan((s as { whey?: Parameters<typeof wheyPlan>[0] }).whey).scoops} scoops/day from ${wheyPlan((s as { whey?: Parameters<typeof wheyPlan>[0] }).whey).from}. Lunch is not fixed — whatever they log.`,
    recent.length ? `HEALTH last 7 days: ${recent.map((r) => `${r.date.slice(5)} ${r.kind} ${r.value}`).join(', ')}` : null,
    `DSA today: ${laps.length ? `${solved}/${laps.length} solved — ${laps.map((p) => p.title).join(', ')}` : 'no problems scheduled'}`,
    `ROUTINES: ${routines.map((r) => `${r.time} ${r.name} (${(JSON.parse(r.days) as number[]).includes(dow) ? 'today' : (JSON.parse(r.days) as number[]).map((d) => DOW[d]).join('/')})`).join('; ') || 'none'}`,
    `CALENDAR today: ${events.map((e) => (e.allDay ? `all day ${e.title}` : `${localStamp(new Date(e.start)).slice(11)} ${e.title}`)).join('; ') || 'nothing (or not connected)'}`,
    `TASKS open: ${tasks.map((t) => `${t.title}${t.due ? ` [${t.due.replace('T', ' ')}${t.repeat ? `, ${t.repeat}` : ''}]` : ''}${t.priority ? ` !${t.priority}` : ''}`).join('; ') || 'none'}`,
    `PLANS (outings, next 30 days): ${plans.map((p) => `${DOW[new Date(`${p.due.slice(0, 10)}T12:00:00`).getDay()]} ${p.due.replace('T', ' ')} ${p.title}${p.place ? ` @ ${p.place}` : ''}`).join('; ') || 'none'}`,
    `BILLS due: ${bills.map((b) => `${b.title}${b.amount ? ` ₹${b.amount}` : ''} on ${b.due.slice(0, 10)}${b.repeat ? ` (${b.repeat})` : ''}`).join('; ') || 'none'}`,
    `MONEY: ₹${Math.round(spent)} spent this month${owed.length ? ` · shared bills: ${owed.map((o) => `${o.name} ${o.net > 0 ? 'owes me' : 'I owe'} ₹${Math.abs(Math.round(o.net))}`).join(', ')}` : ''}`,
    people.length ? `PEOPLE: ${people.map((p) => `${p.name}${nextContact(p, day) ? ` (next call ${nextContact(p, day)})` : ''}${p.birthday ? ` (birthday ${nextBirthday(p, day)!.date})` : ''}`).join('; ')}` : null,
    (s as { weekPlan?: { days?: Record<string, DayPlan> } }).weekPlan?.days?.[day] ? `LOCKED PLAN today: ${(s as { weekPlan: { days: Record<string, DayPlan> } }).weekPlan.days[day].blocks.map((b) => `${b.start} ${b.title}`).join('; ')}` : null,
    supps.length ? `SUPPLEMENTS: ${supps.map((x) => `${x.name} at ${x.at}${one('SELECT 1 FROM checks WHERE kind = ? AND ref = ? AND date = ?', 'supp', x.id, day) ? ' (taken)' : ''}`).join('; ')}` : null,
  ]
    .filter(Boolean)
    .join('\n');
}

export const CAPTURE_SYSTEM = `You turn one quick note into reminders for a personal planner app. Reply with ONLY the fenced actions block described below — no other text. If the note has nothing to schedule, make it a single undated task with a clean title.

${ACTIONS_GUIDE}`;

export type ChatTurn = { role: 'user' | 'assistant'; text: string };

/** Journal entries (newest first) for "talk to your journal", capped so the prompt stays small. */
export function journalContext(days = 180, budget = 30_000) {
  // A day with answers but no written story still counts: use the Q&A.
  const rows = q<{ date: string; body: string | null; answers: string | null; mood: number | null }>("SELECT date, body, answers, mood FROM journal WHERE (trim(coalesce(body,'')) != '' OR answers IS NOT NULL) AND date >= date('now', ?) ORDER BY date DESC", `-${days} days`).map((r) => ({
    ...r,
    body: r.body?.trim() || (JSON.parse(r.answers ?? '[]') as Answer[]).filter((x) => x.a?.trim()).map((x) => `${x.q} — ${x.a.trim()}`).join('\n'),
  })).filter((r) => r.body);
  const moods = q<{ date: string; value: number }>("SELECT date, value FROM health WHERE kind = 'mood' AND date >= date('now', ?) ORDER BY date DESC", `-${days} days`);
  const moodOf = new Map(moods.map((m) => [m.date, m.value]));
  let used = 0;
  const out: string[] = [];
  for (const r of rows) {
    const line = `## ${r.date}${moodOf.has(r.date) || r.mood ? ` (mood ${moodOf.get(r.date) ?? r.mood}/5)` : ''}\n${r.body.trim().slice(0, 1500)}`;
    if (used + line.length > budget) break;
    out.push(line);
    used += line.length;
  }
  return out.length ? out.join('\n\n') : '(no journal entries yet)';
}

export const JOURNAL_GUIDE = `The JOURNAL section holds the user's own private diary entries. When asked about them, answer from the entries: cite dates ("on 12 Oct you wrote…"), notice patterns (sleep, work, gym, people, mood), be warm and honest, never preachy. If the entries don't cover the question, say so.`;

export async function chatPrompt(history: ChatTurn[], message: string, scope: 'day' | 'journal' = 'day') {
  return [
    '# Snapshot',
    await lifeContext(),
    scope === 'journal' ? `# Journal (newest first)\n${journalContext()}` : '',
    history.length ? '# Conversation so far' : '',
    ...history.slice(-10).map((h) => `${h.role === 'user' ? 'Me' : 'Pit Wall'}: ${h.text.slice(0, 2000)}`),
    '# My message',
    message.slice(0, 4000),
  ]
    .filter(Boolean)
    .join('\n\n');
}

/** Office-day pushes (pack, leave, logout, connect-week heads-up), once each per day. */
export async function workRemindersTick() {
  const s = settings();
  const wc = workConfig(s.work);
  const stamp = localStamp(new Date());
  const [day, hm] = stamp.split('T');
  const gym = dayTypeOn(day, s.gymShift ?? 0);
  for (const p of workPings(day, wc, s.workOverrides, gym === 'rest' ? null : DAY_META[gym].label)) {
    const [h, m] = p.at.split(':').map(Number);
    const late = Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3)) - (h * 60 + m);
    if (late < 0 || late > 15) continue;
    const claimed = db.prepare('INSERT OR IGNORE INTO push_sent (task_id, due, sent_at) VALUES (?, ?, ?)').run(`work:${p.id}`, `${day}T${p.at}`, new Date().toISOString());
    if (claimed.changes) await pushAll({ tag: `work-${p.id}`, title: p.title, body: p.body, url: '/' });
  }
}

/** Push the cook brief (tonight's dinner + tomorrow's make-ahead breakfast) 15 min before the cook comes. */
export async function cookTick() {
  const s = settings() as ReturnType<typeof settings> & { cook?: Parameters<typeof cookConfig>[0]; cookPicks?: Record<string, { breakfast?: string; dinner?: string }> };
  const cfg = cookConfig(s.cook);
  if (!cfg.remind) return;
  const now = new Date();
  const [day, hm] = localStamp(now).split('T');
  const [h, m] = cfg.at.split(':').map(Number);
  const late = Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3)) - (h * 60 + m - 15);
  if (late < 0 || late > 30) return;
  const tomorrow = localStamp(new Date(now.getTime() + 86_400_000)).slice(0, 10);
  const profile = s.fuel ?? DEFAULT_PROFILE;
  const target = targets(profile);
  const logs = q<{ date: string; meal: string; kcal: number; protein: number; food_id: string | null; qty: number; micros: string | null }>("SELECT date, meal, kcal, protein, food_id, qty, micros FROM food_logs WHERE date >= date(?, '-15 days')", day);
  const ctx = cookContext(logs, day, target, profile.sex);
  const plan = (d: string) => planCookDay(d, { target, cfg, diet: s.diet ?? 'veg', picks: s.cookPicks?.[d], whey: wheyPlan((s as { whey?: Parameters<typeof wheyPlan>[0] }).whey), ...ctx });
  const claimed = db.prepare('INSERT OR IGNORE INTO push_sent (task_id, due, sent_at) VALUES (?, ?, ?)').run('cook', day, now.toISOString());
  if (!claimed.changes) return;
  const tonight = plan(day);
  const tm = plan(tomorrow);
  await pushAll({ tag: 'cook', title: `🍳 Cook at ${cfg.at} — dinner ${tonight?.dinner.name ?? ''}`, body: `Breakfast for tomorrow: ${tm?.breakfast.name ?? '—'}. Tap to send the brief.`, url: '/fuel', brief: cookBrief(tonight, tm) });
}

/** Shop days (big weekly shop / mid-week top-up): one push at 10:00 with what's on that trip. */
export async function shopTick() {
  const s = settings() as ReturnType<typeof settings> & { shops?: { major: number; minor: number } };
  const shops = s.shops ?? { major: 0, minor: 3 };
  const now = new Date();
  const [day, hm] = localStamp(now).split('T');
  if (hm < '10:00' || hm > '10:30') return;
  const trip = now.getDay() === shops.major ? 'major' : now.getDay() === shops.minor ? 'minor' : null;
  if (!trip) return;
  const items = q<{ name: string }>("SELECT name FROM shopping WHERE done = 0 AND coalesce(trip, 'major') = ?", trip);
  if (!items.length) return;
  if (!db.prepare('INSERT OR IGNORE INTO push_sent (task_id, due, sent_at) VALUES (?, ?, ?)').run(`shop:${trip}`, day, now.toISOString()).changes) return;
  await pushAll({ tag: 'shop', title: `🛒 ${trip === 'major' ? 'Big shop' : 'Top-up'} today — ${items.length} item${items.length > 1 ? 's' : ''}`, body: items.slice(0, 6).map((i) => i.name).join(', ') + (items.length > 6 ? '…' : ''), url: '/fuel' });
}

export type Supplement = { id: string; name: string; at: string; dose?: string };

/** Keep-in-touch, birthday and supplement pushes, each once per day within 30 min of its time. */
export async function lifePingsTick() {
  const now = new Date();
  const [day, hm] = localStamp(now).split('T');
  const mins = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  const due = (at: string) => mins(hm) - mins(at) >= 0 && mins(hm) - mins(at) <= 30;
  const claim = (key: string) => db.prepare('INSERT OR IGNORE INTO push_sent (task_id, due, sent_at) VALUES (?, ?, ?)').run(key, day, now.toISOString()).changes > 0;

  const people = q<Person>('SELECT * FROM people');
  for (const p of peoplePings(people, day)) {
    if (!due(p.at) || !claim(p.id)) continue;
    const person = people.find((x) => x.id === p.person);
    await pushAll({ tag: p.id, title: p.title, body: p.body, url: '/people', personId: p.call ? p.person : undefined, tel: person?.phone ?? undefined, actions: p.call ? [...(person?.phone ? [{ action: 'call', title: '📞 Call' }] : []), { action: 'talked', title: '✓ Talked' }] : [] });
  }

  const supps = ((settings() as { supplements?: Supplement[] }).supplements ?? []);
  for (const s of supps) {
    if (!s.at || !due(s.at)) continue;
    if (one('SELECT 1 FROM checks WHERE kind = ? AND ref = ? AND date = ?', 'supp', s.id, day) || !claim(`supp:${s.id}`)) continue;
    await pushAll({ tag: `supp-${s.id}`, title: `💊 ${s.name}${s.dose ? ` · ${s.dose}` : ''}`, body: 'Take it now', url: '/', suppId: s.id, actions: [{ action: 'taken', title: '✓ Taken' }] });
  }
}

/** Locked week plan: push 10 minutes before gym, DSA, walks, calls and errands. */
export async function planTick() {
  const s = settings() as ReturnType<typeof settings> & { weekPlan?: { days?: Record<string, DayPlan>; remind?: boolean } };
  if (s.weekPlan?.remind === false) return;
  const now = new Date();
  const [day, hm] = localStamp(now).split('T');
  const plan = s.weekPlan?.days?.[day];
  if (!plan) return;
  const mins = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  for (const b of plan.blocks) {
    if (!REMIND_KINDS.includes(b.kind)) continue;
    const lead = mins(b.start) - mins(hm);
    if (lead > 10 || lead < 0) continue;
    if (!db.prepare('INSERT OR IGNORE INTO push_sent (task_id, due, sent_at) VALUES (?, ?, ?)').run(`plan:${b.kind}:${b.start}`, day, now.toISOString()).changes) continue;
    const icon = { gym: '🏋️', dsa: '💻', walk: '🚶', pack: '🎒', shop: '🛒', cook: '🍳', call: '📞' }[b.kind as string] ?? '⏱️';
    await pushAll({ tag: `plan-${b.kind}`, title: `${icon} ${b.title} ${lead ? `in ${lead} min` : 'now'}`, body: `${b.start}–${b.end}${b.note ? ` · ${b.note}` : ''}`, url: '/plan' });
  }
}

/** Facts about a day that shape the journal questions ("You trained Push today — how did it feel?"). */
export function dayFacts(day: string): DayFacts {
  const s = settings();
  const w = workDay(day, workConfig(s.work), s.workOverrides);
  const wo = one<{ day_type: string }>('SELECT day_type FROM workouts WHERE date = ? AND finished_at IS NOT NULL ORDER BY created_at DESC', day);
  const planned = dayTypeOn(day, s.gymShift ?? 0);
  const act = one<{ type: string; duration_min: number; distance_km: number | null }>('SELECT type, duration_min, distance_km FROM activities WHERE date = ? ORDER BY duration_min DESC', day);
  const food = one<{ name: string }>("SELECT name FROM food_logs WHERE date = ? AND meal IN ('dinner','lunch') ORDER BY kcal DESC", day);
  const dsa = one<{ n: number }>("SELECT count(*) n FROM dsa_progress WHERE status IN ('solved','revisit') AND substr(solved_at,1,10) = ?", day)?.n ?? 0;
  const called = one<{ name: string }>('SELECT name FROM people WHERE last_contact = ?', day)?.name ?? null;
  const meta = (t: string) => DAY_META[t as keyof typeof DAY_META]?.label ?? t;
  return {
    gym: wo ? meta(wo.day_type) : null,
    gymPlanned: meta(planned),
    work: w.mode,
    sport: act ? `${act.type}${act.distance_km ? ` ${act.distance_km.toFixed(1)} km` : ` ${Math.round(act.duration_min)} min`}` : null,
    food: food?.name.toLowerCase() ?? null,
    dsaSolved: dsa,
    called,
    weekday: new Date(`${day}T12:00:00`).getDay(),
  };
}

export function dayFactsText(day: string) {
  const f = dayFacts(day);
  return [
    f.work === 'office' ? 'office day (commute)' : f.work === 'wfh' ? 'worked from home' : f.work === 'leave' ? 'on leave' : 'day off',
    f.gym ? `${f.gym} gym session` : f.gymPlanned !== 'Rest' ? `planned ${f.gymPlanned} day, no session logged` : 'rest day',
    f.sport,
    f.dsaSolved ? `${f.dsaSolved} DSA problem(s) solved` : null,
    f.called ? `talked to ${f.called}` : null,
  ]
    .filter(Boolean)
    .join('; ');
}

/** Evening nudge (default 21:45) with tonight's questions, unless the journal is already done. */
export async function journalTick() {
  const b = (settings().briefs ?? {}) as { journal?: boolean; journalAt?: string };
  if (b.journal === false) return;
  const [day, hm] = localStamp(new Date()).split('T');
  const at = b.journalAt ?? '21:45';
  if (hm < at || hm > '23:30') return;
  const row = one<{ answers: string | null; body: string | null }>('SELECT answers, body FROM journal WHERE date = ?', day);
  if (row?.body?.trim() || (row?.answers && JSON.parse(row.answers).some((x: Answer) => x.a?.trim()))) return;
  if (!claimToday('journal-nudge')) return;
  const first = questionsFor(day, dayFacts(day))[0];
  await pushAll({ tag: 'journal', title: '📓 5 quick questions about today', body: first, url: '/life?journal=1' });
}
