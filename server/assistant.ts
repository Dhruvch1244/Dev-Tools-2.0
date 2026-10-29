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
import { cookBrief, cookConfig, planCookDay } from '../web/src/core/cook.ts';

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
  const tasks = q<{ title: string; due: string | null; repeat: string | null; priority: number }>("SELECT title, due, repeat, priority FROM tasks WHERE done = 0 AND (due IS NULL OR substr(due,1,10) <= date(?, '+14 days')) ORDER BY due IS NULL, due LIMIT 25", day);
  const dow = now.getDay();
  const routines = q<{ name: string; time: string; days: string; duration_min: number }>('SELECT name, time, days, duration_min FROM routines WHERE active = 1 ORDER BY time');
  const laps = problemsForDay(s.dsaStart ?? DEFAULT_START, day);
  const solved = laps.filter((p) => ['solved', 'revisit'].includes(one<{ status: string }>('SELECT status FROM dsa_progress WHERE problem = ?', p.id)?.status ?? '')).length;
  const sessions = one<{ n: number }>("SELECT count(*) n FROM workouts WHERE finished_at IS NOT NULL AND date >= date(?, '-6 days')", day)?.n ?? 0;
  const spent = one<{ t: number }>("SELECT coalesce(sum(amount),0) t FROM expenses WHERE kind = 'expense' AND substr(date,1,7) = ?", day.slice(0, 7))?.t ?? 0;
  const events = await google.events(day, day).catch(() => []);
  const people = q<Person>('SELECT * FROM people');
  const supps = (s as { supplements?: Supplement[] }).supplements ?? [];
  const shifts = wc.shifts.map((x) => `${x.id} ${x.login}-${x.logout}`).join(', ');

  return [
    `NOW: ${now.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}, ${stamp.slice(11)} (${day})`,
    s.name ? `Name: ${s.name}` : null,
    `WORK today: ${w.mode}${w.shift ? ` · shift ${w.shift.id} login ${w.shift.login} logout ${w.shift.logout}${w.actual.in ? ` (actually logged in ${w.actual.in}${w.actual.out ? `, out ${w.actual.out}` : ''})` : ''}` : ''}${w.leaveBy ? ` · leave home ${w.leaveBy}, home by ${w.homeBy} (commute ${wc.commute} min each way)` : ''} · ${weekLabel(day, wc)}${next ? ` · ${next.connect ? 'connect (office)' : 'home'} block starts ${next.date}` : ''}`,
    `Shifts: ${shifts}. Next 7 days: ${week.join('; ')}`,
    `GYM today: ${gym === 'rest' ? 'Rest' : `${DAY_META[gym].label} (${DAY_META[gym].focus})`}; tomorrow ${DAY_META[dayTypeOn(localStamp(new Date(now.getTime() + 86_400_000)).slice(0, 10), s.gymShift ?? 0)].label}. Finished sessions last 7 days: ${sessions}`,
    `FUEL: target ${tg.kcal} kcal / ${tg.protein} g protein; eaten ${Math.round(food.k)} kcal / ${Math.round(food.p)} g. ${meals.map((m) => `${m.meal}: ${m.names}`).join(' | ') || 'Nothing logged yet.'} Water ${water}/${s.waterGoal ?? 8} glasses.`,
    recent.length ? `HEALTH last 7 days: ${recent.map((r) => `${r.date.slice(5)} ${r.kind} ${r.value}`).join(', ')}` : null,
    `DSA today: ${laps.length ? `${solved}/${laps.length} solved — ${laps.map((p) => p.title).join(', ')}` : 'no problems scheduled'}`,
    `ROUTINES: ${routines.map((r) => `${r.time} ${r.name} (${(JSON.parse(r.days) as number[]).includes(dow) ? 'today' : (JSON.parse(r.days) as number[]).map((d) => DOW[d]).join('/')})`).join('; ') || 'none'}`,
    `CALENDAR today: ${events.map((e) => (e.allDay ? `all day ${e.title}` : `${localStamp(new Date(e.start)).slice(11)} ${e.title}`)).join('; ') || 'nothing (or not connected)'}`,
    `TASKS open: ${tasks.map((t) => `${t.title}${t.due ? ` [${t.due.replace('T', ' ')}${t.repeat ? `, ${t.repeat}` : ''}]` : ''}${t.priority ? ` !${t.priority}` : ''}`).join('; ') || 'none'}`,
    `MONEY: ₹${Math.round(spent)} spent this month`,
    people.length ? `PEOPLE: ${people.map((p) => `${p.name}${nextContact(p, day) ? ` (next call ${nextContact(p, day)})` : ''}${p.birthday ? ` (birthday ${nextBirthday(p, day)!.date})` : ''}`).join('; ')}` : null,
    supps.length ? `SUPPLEMENTS: ${supps.map((x) => `${x.name} at ${x.at}${one('SELECT 1 FROM checks WHERE kind = ? AND ref = ? AND date = ?', 'supp', x.id, day) ? ' (taken)' : ''}`).join('; ')}` : null,
  ]
    .filter(Boolean)
    .join('\n');
}

export const CAPTURE_SYSTEM = `You turn one quick note into reminders for a personal planner app. Reply with ONLY the fenced actions block described below — no other text. If the note has nothing to schedule, make it a single undated task with a clean title.

${ACTIONS_GUIDE}`;

export type ChatTurn = { role: 'user' | 'assistant'; text: string };

export async function chatPrompt(history: ChatTurn[], message: string) {
  return [
    '# Snapshot',
    await lifeContext(),
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
  const wc = workConfig(s.work);
  const target = targets(s.fuel ?? DEFAULT_PROFILE);
  const plan = (d: string) => planCookDay(d, { target, office: workDay(d, wc, s.workOverrides).mode === 'office', cfg, diet: s.diet ?? 'veg', picks: s.cookPicks?.[d] });
  const claimed = db.prepare('INSERT OR IGNORE INTO push_sent (task_id, due, sent_at) VALUES (?, ?, ?)').run('cook', day, now.toISOString());
  if (!claimed.changes) return;
  const tonight = plan(day);
  const tm = plan(tomorrow);
  await pushAll({ tag: 'cook', title: `🍳 Cook at ${cfg.at} — dinner ${tonight?.dinner.name ?? ''}`, body: `Breakfast for tomorrow: ${tm?.breakfast.name ?? '—'}. Tap to send the brief.`, url: '/fuel', brief: cookBrief(tonight, tm) });
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
