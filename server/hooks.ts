// The iPhone side: location triggers and home-screen widgets.
//
// Places: an iOS Shortcuts automation ("When I arrive at / leave Gym") opens a URL here, and the
// app reacts — today's workout when you walk into the gym, a "log your session?" if you leave
// without one, home-by time when you leave the office. iOS does the geofencing; the app never
// sees your location, only "arrived at gym".
//
// Widget: one small JSON snapshot (gym day, food left, water, habits, Daily 3, next thing) that the
// Scriptable widget script draws on the home or lock screen.
import { Hono } from 'hono';
import { db } from './db.ts';
import { localStamp, pushAll } from './push.ts';
import { settings } from './briefs.ts';
import { storyAnsweredToday } from './story.ts';
import { DAY_META, dayTypeOn } from '../web/src/core/gym.ts';
import { DEFAULT_PROFILE, targets } from '../web/src/core/fuel.ts';
import { addMin, workConfig, workDay } from '../web/src/core/work.ts';
import { dueOn, parseDays } from '../web/src/core/habits.ts';
import { parseTop } from '../web/src/core/day.ts';
import { PLACE_KINDS, placeAction, type Place, type PlaceEvent } from '../web/src/core/places.ts';

db.exec(`CREATE TABLE IF NOT EXISTS place_log (id TEXT PRIMARY KEY, place TEXT NOT NULL, event TEXT NOT NULL, at TEXT NOT NULL)`);

const one = <T>(sql: string, ...a: (string | number)[]) => db.prepare(sql).get(...a) as T | undefined;

/** Everything a widget or a place ping needs about today, from the same core modules as the app. */
export function snapshot(day = localStamp(new Date()).slice(0, 10)) {
  const s = settings();
  const type = dayTypeOn(day, s.gymShift ?? 0);
  const t = targets(s.fuel ?? DEFAULT_PROFILE);
  const food = one<{ k: number; p: number }>('SELECT coalesce(sum(kcal),0) k, coalesce(sum(protein),0) p FROM food_logs WHERE date = ?', day)!;
  const water = one<{ value: number }>("SELECT value FROM health WHERE date = ? AND kind = 'water'", day)?.value ?? 0;
  const sets = one<{ n: number }>('SELECT count(*) n FROM sets WHERE date = ?', day)?.n ?? 0;
  const habits = (db.prepare('SELECT id, days FROM habits WHERE archived = 0').all() as { id: string; days: string | null }[]).filter((h) => dueOn(parseDays(h.days), day));
  const habitsDone = habits.filter((h) => one('SELECT 1 FROM habit_logs WHERE habit_id = ? AND date = ?', h.id, day)).length;
  const w = workDay(day, workConfig(s.work), s.workOverrides);
  const hm = localStamp(new Date()).slice(11);
  // Next thing with a time today or later: an appointment, bill or timed task.
  const next = one<{ title: string; due: string; kind: string | null }>("SELECT title, due, kind FROM tasks WHERE done = 0 AND due LIKE '%T%' AND due >= ? ORDER BY due LIMIT 1", `${day}T${hm}`);
  const dayRow = one<{ shutdown_at: string | null; intention: string | null }>('SELECT shutdown_at, intention FROM days WHERE date = ?', day);
  return {
    date: day,
    gym: { type, label: type === 'rest' ? 'Rest' : DAY_META[type].label, focus: DAY_META[type].focus, color: DAY_META[type].color, sets },
    kcal: { eaten: Math.round(food.k), target: t.kcal },
    protein: { eaten: Math.round(food.p), target: t.protein },
    water: { glasses: water, goal: s.waterGoal ?? 8 },
    habits: { done: habitsDone, total: habits.length },
    story: { answered: storyAnsweredToday(day), total: 3 },
    work: w.mode === 'office' || w.mode === 'wfh' ? { mode: w.mode, login: w.shift?.login ?? null, logout: w.shift?.logout ?? null, leaveBy: w.leaveBy ?? null } : { mode: w.mode },
    next: next ? { title: next.title, at: next.due.slice(11, 16), day: next.due.slice(0, 10), kind: next.kind } : null,
    shutdown: dayRow?.shutdown_at ?? null,
    top: parseTop(dayRow?.intention),
  };
}
export type Snapshot = ReturnType<typeof snapshot>;

export function hookRoutes(emit: (r: string) => void) {
  const app = new Hono();

  // GET too, so a Shortcuts "Get contents of URL" works without changing the method.
  const hit = async (placeId: string, event: string, test = false) => {
    const places = ((settings() as { places?: Place[] }).places ?? []) as Place[];
    const place = places.find((p) => p.id === placeId || p.name.toLowerCase() === placeId.toLowerCase());
    if (!place) return { status: 404, body: { ok: false, message: `No place called “${placeId}” — add it in Settings › Places.` } };
    if (event !== 'arrive' && event !== 'leave') return { status: 400, body: { ok: false, message: 'event must be arrive or leave' } };
    const now = new Date();
    const stamp = localStamp(now);
    // ?test=1 (Settings' Test button): say what would happen, without logging, clocking or pinging.
    if (test) {
      const act = placeAction(place, event as PlaceEvent, snapshot(stamp.slice(0, 10)), stamp.slice(11), addMin(stamp.slice(11), workConfig(settings().work).commute));
      return { status: 200, body: { ok: true, message: act.message, push: act.push ?? null, clock: act.clock ?? null } };
    }
    db.prepare('INSERT INTO place_log (id, place, event, at) VALUES (?, ?, ?, ?)').run(crypto.randomUUID(), place.id, event, now.toISOString());
    emit('places');
    const snap = snapshot(stamp.slice(0, 10));
    const act = placeAction(place, event as PlaceEvent, snap, stamp.slice(11), addMin(stamp.slice(11), workConfig(settings().work).commute));
    // Office arrive/leave stamps the day's real login/logout (only the first arrival and last departure count).
    if (act.clock) {
      const day = stamp.slice(0, 10);
      const all = settings().workOverrides ?? {};
      const o = { ...all[day] };
      if (act.clock.mode && o.mode !== 'leave') o.mode = act.clock.mode;
      if (act.clock.in && !o.in) o.in = act.clock.in;
      if (act.clock.out) o.out = act.clock.out;
      db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value').run('workOverrides', JSON.stringify({ ...all, [day]: o }));
      emit('settings');
    }
    // Pings are once per place, event and day — walking in and out of the gym twice doesn't spam.
    if (act.push) {
      const claimed = db.prepare('INSERT OR IGNORE INTO push_sent (task_id, due, sent_at) VALUES (?, ?, ?)').run(`place:${place.id}:${event}`, stamp.slice(0, 10), now.toISOString());
      if (claimed.changes) await pushAll({ tag: `place-${place.id}`, ...act.push });
    }
    return { status: 200, body: { ok: true, message: act.message } };
  };
  app.get('/place/:place/:event', async (c) => {
    const r = await hit(c.req.param('place'), c.req.param('event'), c.req.query('test') === '1');
    return c.json(r.body, r.status as 200);
  });
  app.post('/place/:place/:event', async (c) => {
    const r = await hit(c.req.param('place'), c.req.param('event'));
    return c.json(r.body, r.status as 200);
  });
  // The last few arrivals/departures per place, so Settings can show "working — arrived 18:42".
  app.get('/places/log', (c) => c.json(db.prepare('SELECT place, event, at FROM place_log ORDER BY at DESC LIMIT 60').all()));
  app.get('/places/kinds', (c) => c.json(PLACE_KINDS));

  app.get('/widget', (c) => c.json(snapshot()));
  return app;
}
