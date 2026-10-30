// Gym AI routes: plan today's session, form guides (cached per exercise), identify a machine from
// a photo, parse "what I did" into sets, and the weekly debrief. All go through the local Claude
// CLI (coach.ts ask); the browser never talks to a model directly.
import { Hono } from 'hono';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DATA_DIR, db } from './db.ts';
import { demoId } from '../web/src/core/exerciseDemos.ts';
import { settings } from './briefs.ts';
import { ask, type Prompt } from './coach.ts';
import { localStamp } from './push.ts';
import { extractJson } from '../web/src/core/aiFood.ts';
import { DAY_META, DEFAULT_TEMPLATES, dayTypeOn, e1rm, type DayType, type Exercise } from '../web/src/core/gym.ts';
import { DAY_MUSCLES } from '../web/src/core/exercises.ts';
import { libraryFor, weekReport, type WeekReport } from '../web/src/core/gymStats.ts';
import { DEBRIEF_SYSTEM, GUIDE_SYSTEM, MACHINE_SYSTEM, PARSE_SYSTEM, PLAN_SYSTEM, normaliseDebrief, normaliseGuide, normaliseMachine, normaliseParsed, normalisePlan } from '../web/src/core/gymAi.ts';

db.exec(`
  CREATE TABLE IF NOT EXISTS gym_guides (name TEXT PRIMARY KEY, body TEXT NOT NULL, created_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS gym_debriefs (week TEXT PRIMARY KEY, body TEXT NOT NULL, created_at TEXT NOT NULL);
`);

type SetRow = { workout_id: string; date: string; exercise: string; weight: number; reps: number; set_no: number };
type WorkoutRow = { id: string; date: string; day_type: string; finished_at: string | null };
const allSets = () => db.prepare('SELECT workout_id, date, exercise, weight, reps, set_no FROM sets ORDER BY date, set_no').all() as SetRow[];
const allWorkouts = () => db.prepare('SELECT id, date, day_type, finished_at FROM workouts ORDER BY date DESC').all() as WorkoutRow[];
const today = () => localStamp(new Date()).slice(0, 10);

export function gymReport(to = today()): WeekReport {
  const shift = (settings().gymShift as number | undefined) ?? 0;
  return weekReport(to, allSets(), allWorkouts(), (d) => dayTypeOn(d, shift));
}

/** "Barbell Bench Press: last 60×8, 60×8, 60×7 (26 Oct) · best e1RM 76" for the planner. */
function history(names: string[]) {
  const sets = allSets();
  return names
    .map((n) => {
      const mine = sets.filter((s) => s.exercise === n);
      if (!mine.length) return `${n}: no history`;
      const lastDay = mine.at(-1)!.date;
      const last = mine.filter((s) => s.date === lastDay);
      const best = Math.max(...mine.map((s) => e1rm(s.weight, s.reps)));
      return `${n}: last ${last.map((s) => `${s.weight}×${s.reps}`).join(', ')} (${lastDay}) · best e1RM ${Math.round(best)}`;
    })
    .join('\n');
}

const fail = (e: unknown) => ({ error: (e as Error).message });

export const gym = new Hono();

gym.post('/plan', async (c) => {
  const { minutes, note, day_type } = await c.req.json<{ minutes?: number; note?: string; day_type?: DayType }>().catch(() => ({}) as never);
  const s = settings();
  const day = today();
  const type = (day_type ?? dayTypeOn(day, (s.gymShift as number | undefined) ?? 0)) as DayType;
  if (type === 'rest') return c.json({ error: 'It’s a rest day — pick a day type to train anyway' }, 400);
  const template: Exercise[] = (s as { gymTemplates?: Record<string, Exercise[]> }).gymTemplates?.[type] ?? DEFAULT_TEMPLATES[type];
  const recent = [...new Set(allSets().filter((x) => x.date >= localStamp(new Date(Date.now() - 35 * 86_400_000)).slice(0, 10)).map((x) => x.exercise))];
  const r = gymReport(day);
  const sleep = db.prepare("SELECT value FROM health WHERE kind = 'sleep' ORDER BY date DESC LIMIT 1").get() as { value: number } | undefined;
  const prompt = [
    `Today ${day}: ${DAY_META[type].label} day (${DAY_META[type].focus}). Time available: ${minutes ? `${minutes} min` : 'about 60–75 min'}.${sleep ? ` Slept ${sleep.value} h.` : ''}`,
    note?.trim() ? `Lifter says: "${note.trim().slice(0, 300)}"` : '',
    `Their usual ${DAY_META[type].label} template: ${template.map((e) => `${e.name} ${e.sets}×${e.reps}`).join('; ')}`,
    `Last 7 days, sets per muscle (target range): ${r.muscles.map((m) => `${m.muscle} ${m.sets} (${m.min}-${m.max}, ${m.status})`).join('; ')}`,
    `History:\n${history([...new Set([...template.map((e) => e.name), ...recent])])}`,
    `Library for today's muscles:\n${libraryFor(DAY_MUSCLES[type])}`,
  ]
    .filter(Boolean)
    .join('\n\n');
  try {
    const reply = await ask(PLAN_SYSTEM, prompt, { onDelta: () => {}, signal: c.req.raw.signal });
    return c.json({ day_type: type, plan: normalisePlan(extractJson(reply)) });
  } catch (e) {
    return c.json(fail(e), 502);
  }
});

gym.get('/guide/:name', async (c) => {
  const name = decodeURIComponent(c.req.param('name')).slice(0, 80);
  const hit = db.prepare('SELECT body FROM gym_guides WHERE name = ?').get(name) as { body: string } | undefined;
  if (hit) return c.json(JSON.parse(hit.body));
  try {
    const reply = await ask(GUIDE_SYSTEM, `Exercise: ${name}`, { onDelta: () => {}, signal: c.req.raw.signal });
    const g = normaliseGuide(name, extractJson(reply));
    if (g.steps.length) db.prepare('INSERT OR REPLACE INTO gym_guides (name, body, created_at) VALUES (?, ?, ?)').run(name, JSON.stringify(g), new Date().toISOString());
    return c.json(g);
  } catch (e) {
    return c.json(fail(e), 502);
  }
});

gym.post('/machine', async (c) => {
  const { image, text } = await c.req.json<{ image?: string; text?: string }>();
  const m = image?.match(/^data:(image\/(?:jpeg|png|webp|gif));base64,(.+)$/);
  if (!m && !text?.trim()) return c.json({ error: 'Add a photo of the machine' }, 400);
  if (m && m[2].length > 8_000_000) return c.json({ error: 'Photo too large' }, 413);
  const t = `How do I use this?${text?.trim() ? ` ${text.trim().slice(0, 300)}` : ''}`;
  const prompt: Prompt = m ? [{ type: 'image', source: { type: 'base64', media_type: m[1], data: m[2] } }, { type: 'text', text: t }] : t;
  try {
    const reply = await ask(MACHINE_SYSTEM, prompt, { onDelta: () => {}, signal: c.req.raw.signal });
    return c.json(normaliseMachine(extractJson(reply)));
  } catch (e) {
    return c.json(fail(e), 502);
  }
});

gym.post('/parse', async (c) => {
  const { text } = await c.req.json<{ text: string }>();
  if (!text?.trim()) return c.json({ error: 'Describe what you did' }, 400);
  try {
    const reply = await ask(PARSE_SYSTEM, text.slice(0, 1500), { onDelta: () => {}, signal: c.req.raw.signal });
    return c.json(normaliseParsed(extractJson(reply)));
  } catch (e) {
    return c.json(fail(e), 502);
  }
});

gym.get('/report', (c) => c.json(gymReport(c.req.query('to') ?? today())));

gym.post('/debrief', async (c) => {
  const { fresh } = await c.req.json<{ fresh?: boolean }>().catch(() => ({ fresh: false }));
  const r = gymReport();
  const hit = !fresh && (db.prepare('SELECT body FROM gym_debriefs WHERE week = ?').get(r.to) as { body: string } | undefined);
  if (hit) return c.json({ report: r, debrief: JSON.parse(hit.body) });
  const best = allSets()
    .filter((s) => s.date >= r.from)
    .reduce((m, s) => m.set(s.exercise, Math.max(m.get(s.exercise) ?? 0, e1rm(s.weight, s.reps))), new Map<string, number>());
  const prompt = [
    `Week ${r.from} → ${r.to}: ${r.sessions}/${r.planned} planned sessions, ${r.sets} sets, ${r.volume} kg volume${r.volumeChange != null ? ` (${r.volumeChange > 0 ? '+' : ''}${r.volumeChange}% vs previous week)` : ''}.`,
    `Sets per muscle (target): ${r.muscles.map((m) => `${m.muscle} ${m.sets} (${m.min}-${m.max}) ${m.status}`).join('; ')}`,
    r.pushPull != null ? `Push:pull ratio ${r.pushPull}` : '',
    r.prs.length ? `PRs: ${r.prs.map((p) => `${p.exercise} ${p.weight}×${p.reps}`).join(', ')}` : 'No PRs',
    `Best e1RM per lift this week: ${[...best].map(([n, v]) => `${n} ${Math.round(v)}`).join(', ') || 'none'}`,
    `App flags: ${r.flags.join(' | ') || 'none'}`,
  ]
    .filter(Boolean)
    .join('\n');
  try {
    const reply = await ask(DEBRIEF_SYSTEM, prompt, { onDelta: () => {}, signal: c.req.raw.signal });
    const d = normaliseDebrief(extractJson(reply));
    db.prepare('INSERT OR REPLACE INTO gym_debriefs (week, body, created_at) VALUES (?, ?, ?)').run(r.to, JSON.stringify(d), new Date().toISOString());
    return c.json({ report: r, debrief: d });
  } catch (e) {
    return c.json(fail(e), 502);
  }
});

// ---- Exercise demos: start/end photos + steps from free-exercise-db (public domain) ----
// The ~1 MB catalogue is fetched once into data/, photos are fetched on first view and kept in
// data/exercise-img/ so the phone gets them from the laptop over the tailnet, fast and offline.
const EXDB = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main';
type DbExercise = { id: string; name: string; instructions: string[]; level: string; equipment: string | null; primaryMuscles: string[]; images: string[] };
let catalogue: Promise<DbExercise[]> | null = null;
function exerciseDb() {
  catalogue ??= (async () => {
    const file = join(DATA_DIR, 'exercise-db.json');
    if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf8')) as DbExercise[];
    const rows = (await (await fetch(`${EXDB}/dist/exercises.json`, { signal: AbortSignal.timeout(30_000) })).json()) as DbExercise[];
    writeFileSync(file, JSON.stringify(rows));
    return rows;
  })().catch((e) => ((catalogue = null), Promise.reject(e)));
  return catalogue;
}
const words = (s: string) => new Set(s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length > 1 && !['the', 'with', 'and', 'on', 'to'].includes(w)));

gym.get('/demo', async (c) => {
  const name = c.req.query('name') ?? '';
  try {
    const rows = await exerciseDb();
    let hit = rows.find((r) => r.id === (demoId(name) ?? c.req.query('id')));
    // An exercise the coach invented: best word overlap, only if it's clearly the same move.
    if (!hit) {
      const w = words(name);
      const scored = rows.map((r) => {
        const x = words(r.name);
        const inter = [...w].filter((t) => x.has(t)).length;
        return { r, s: inter / (w.size + x.size - inter || 1) };
      });
      const best = scored.sort((a, b) => b.s - a.s)[0];
      if (best && best.s >= 0.6) hit = best.r;
    }
    if (!hit) return c.json(null);
    return c.json({ id: hit.id, name: hit.name, level: hit.level, equipment: hit.equipment, muscles: hit.primaryMuscles, steps: hit.instructions, frames: hit.images.length });
  } catch (e) {
    return c.json({ error: (e as Error).message }, 502);
  }
});

gym.get('/demo-img/:id/:n', async (c) => {
  const { id, n } = c.req.param();
  if (!/^[\w()'.,-]+$/.test(id) || !/^[01]$/.test(n)) return c.json({ error: 'bad id' }, 400);
  const dir = join(DATA_DIR, 'exercise-img');
  const file = join(dir, `${id}_${n}.jpg`);
  if (!existsSync(file)) {
    const r = await fetch(`${EXDB}/exercises/${encodeURIComponent(id)}/${n}.jpg`, { signal: AbortSignal.timeout(15_000) }).catch(() => null);
    if (!r?.ok) return c.json({ error: 'not found' }, 404);
    mkdirSync(dir, { recursive: true });
    writeFileSync(file, Buffer.from(await r.arrayBuffer()));
  }
  return c.body(readFileSync(file), 200, { 'content-type': 'image/jpeg', 'cache-control': 'public, max-age=31536000, immutable' });
});
