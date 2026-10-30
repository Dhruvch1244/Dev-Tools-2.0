// Daily 3: three questions a day about your life story. The day's questions are picked once and
// stored, so the phone and laptop ask the same three; answering one queues an AI follow-up for a
// later day, and the portrait reads everything you've written back to you.
import { Hono } from 'hono';
import { db } from './db.ts';
import { ask } from './coach.ts';
import { localStamp } from './push.ts';
import { FOLLOW_SYSTEM, PORTRAIT_SYSTEM, followPrompt, normaliseFollow, pickThree, portraitPrompt, type StoryQ } from '../web/src/core/story.ts';

db.exec(`
  CREATE TABLE IF NOT EXISTS story (
    id TEXT PRIMARY KEY, date TEXT NOT NULL, kind TEXT NOT NULL, chapter TEXT, q TEXT NOT NULL, a TEXT,
    skipped INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS story_date ON story (date);
`);

const getSetting = <T>(key: string, def: T): T => {
  const r = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
  return r ? (JSON.parse(r.value) as T) : def;
};
const setSetting = (key: string, v: unknown) => db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value').run(key, JSON.stringify(v));
const day = () => localStamp(new Date()).slice(0, 10);

/** Today's three, creating them on first ask. */
export function storyToday(date = day()): StoryQ[] {
  const have = db.prepare('SELECT * FROM story WHERE date = ? ORDER BY created_at').all(date) as StoryQ[];
  if (have.length) return have;
  const all = db.prepare('SELECT q, a, skipped FROM story').all() as { q: string; a: string | null; skipped: number }[];
  const asked = new Set(all.map((r) => r.q));
  // Skipped questions come back once the bank is done (only those never answered since).
  const answered = new Set(all.filter((r) => r.a?.trim()).map((r) => r.q));
  const skipped = [...new Set(all.filter((r) => r.skipped && !answered.has(r.q)).map((r) => r.q))];
  const queue = getSetting<string[]>('storyFollow', []);
  const picks = pickThree(date, asked, queue[0] ?? null, skipped);
  if (queue.length) setSetting('storyFollow', queue.slice(1));
  const stamp = new Date().toISOString();
  const ins = db.prepare('INSERT INTO story (id, date, kind, chapter, q, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
  // created_at is nudged per row so ORDER BY keeps the pick order.
  picks.forEach((p, i) => ins.run(crypto.randomUUID(), date, p.kind, p.chapter, p.q, new Date(Date.parse(stamp) + i).toISOString(), stamp));
  return db.prepare('SELECT * FROM story WHERE date = ? ORDER BY created_at').all(date) as StoryQ[];
}

export const storyAnsweredToday = (date = day()) => (db.prepare("SELECT count(*) n FROM story WHERE date = ? AND trim(coalesce(a,'')) != ''").get(date) as { n: number }).n;

/** After a real answer, ask the AI for one follow-up and queue it for a later day (max 6 waiting). */
async function queueFollow(row: StoryQ) {
  if (!row.a || row.a.trim().length < 60 || row.kind === 'everyday') return;
  const earlier = db.prepare("SELECT q, a FROM story WHERE id != ? AND trim(coalesce(a,'')) != '' ORDER BY updated_at DESC LIMIT 6").all(row.id) as { q: string; a: string }[];
  const text = await ask(FOLLOW_SYSTEM, followPrompt(row.q, row.a, earlier), { onDelta: () => {}, signal: AbortSignal.timeout(90_000) });
  const q = normaliseFollow(text);
  if (!q) return;
  const queue = getSetting<string[]>('storyFollow', []);
  if (!queue.includes(q)) setSetting('storyFollow', [...queue, q].slice(-6));
}

export function storyRoutes(emit: (r: string) => void) {
  const app = new Hono();
  app.get('/today', (c) => c.json(storyToday(c.req.query('date') || day())));
  // Everything answered, newest first — the memoir view.
  app.get('/', (c) => c.json(db.prepare("SELECT * FROM story WHERE trim(coalesce(a,'')) != '' ORDER BY date DESC, created_at").all()));
  app.get('/days', (c) => c.json((db.prepare("SELECT DISTINCT date FROM story WHERE trim(coalesce(a,'')) != '' ORDER BY date").all() as { date: string }[]).map((r) => r.date)));
  app.put('/:id', async (c) => {
    const b = await c.req.json<{ a?: string | null; skipped?: boolean }>();
    const prev = db.prepare('SELECT * FROM story WHERE id = ?').get(c.req.param('id')) as StoryQ | undefined;
    if (!prev) return c.json({ error: 'not found' }, 404);
    const a = b.a === undefined ? prev.a : b.a?.slice(0, 8000) ?? null;
    db.prepare('UPDATE story SET a = ?, skipped = ?, updated_at = ? WHERE id = ?').run(a, b.skipped ? 1 : 0, new Date().toISOString(), prev.id);
    emit('story');
    // Only the first real answer spawns a follow-up (not every autosave while typing).
    if (a?.trim() && !prev.a?.trim()) void queueFollow({ ...prev, a }).catch((e) => console.error('story follow-up', (e as Error).message));
    return c.json({ ok: true });
  });
  // Swap one of today's questions for the next one in line.
  app.post('/:id/swap', (c) => {
    const prev = db.prepare('SELECT * FROM story WHERE id = ?').get(c.req.param('id')) as StoryQ | undefined;
    if (!prev) return c.json({ error: 'not found' }, 404);
    const asked = new Set((db.prepare('SELECT q FROM story').all() as { q: string }[]).map((r) => r.q));
    const next = pickThree(`${prev.date}#${asked.size}`, asked, null).find((p) => p.kind === (prev.kind === 'follow' ? 'chapter' : prev.kind)) ?? pickThree(`${prev.date}#${asked.size}`, asked, null)[0];
    if (!next) return c.json({ error: 'Nothing left to swap in' }, 400);
    // The old one counts as skipped, so it can come round again later.
    const stamp = new Date().toISOString();
    db.prepare("UPDATE story SET date = ?, skipped = 1, updated_at = ? WHERE id = ?").run(`skip:${prev.date}`, stamp, prev.id);
    db.prepare('INSERT INTO story (id, date, kind, chapter, q, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(crypto.randomUUID(), prev.date, next.kind, next.chapter, next.q, prev.created_at, stamp);
    emit('story');
    return c.json({ ok: true });
  });
  app.post('/portrait', async (c) => {
    const rows = db.prepare("SELECT q, a, chapter, date FROM story WHERE trim(coalesce(a,'')) != '' ORDER BY date").all() as { q: string; a: string; chapter: string | null; date: string }[];
    if (rows.length < 5) return c.json({ error: 'Answer at least 5 questions first' }, 400);
    try {
      const text = (await ask(PORTRAIT_SYSTEM, portraitPrompt(rows), { onDelta: () => {}, signal: c.req.raw.signal })).trim();
      const portrait = { at: new Date().toISOString(), text, n: rows.length };
      setSetting('storyPortrait', portrait);
      emit('settings');
      return c.json(portrait);
    } catch (e) {
      return c.json({ error: (e as Error).message }, 502);
    }
  });
  return app;
}
