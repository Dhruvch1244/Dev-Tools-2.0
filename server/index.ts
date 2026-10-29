import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { streamSSE } from 'hono/streaming';
import { randomUUID } from 'node:crypto';
import { createReadStream, existsSync } from 'node:fs';
import { readFile, stat, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { db, FILES_DIR, RESOURCES, pickColumns } from './db.ts';
import { profiles, upcomingContests } from './contests.ts';
import { run, type Lang } from './runner.ts';
import { publicKey, pushAll, startReminderLoop, subscribe, subscriptions, taskAction, unsubscribe } from './push.ts';

const PORT = Number(process.env.PORT ?? 4300);
// Loopback by default: `tailscale serve` proxies to it, so only devices on your tailnet can reach it.
const HOST = process.env.HOST ?? '127.0.0.1';

const app = new Hono();
const now = () => new Date().toISOString();

// ---- Live sync: every write broadcasts the resource name; clients refetch it. ----
const listeners = new Set<(resource: string) => void>();
const emit = (resource: string) => listeners.forEach((fn) => fn(resource));

app.get('/api/events', (c) =>
  streamSSE(c, async (stream) => {
    const send = (resource: string) => void stream.writeSSE({ event: 'change', data: resource }).catch(() => {});
    listeners.add(send);
    stream.onAbort(() => {
      listeners.delete(send);
    });
    await stream.writeSSE({ event: 'hello', data: 'ok' });
    while (!stream.aborted) {
      await stream.sleep(25_000);
      await stream.writeSSE({ event: 'ping', data: '' });
    }
    listeners.delete(send);
  }),
);

app.onError((err, c) => {
  console.error(err);
  const status = /constraint|NOT NULL/i.test(err.message) ? 400 : 500;
  return c.json({ error: err.message }, status);
});

// ---- Generic CRUD for simple tables ----
app.get('/api/r/:res', (c) => {
  const name = c.req.param('res');
  const res = RESOURCES[name];
  if (!res) return c.json({ error: 'unknown resource' }, 404);
  const { from, to } = c.req.query();
  const where: string[] = [];
  const args: string[] = [];
  if (res.dateCol && from) (where.push(`${res.dateCol} >= ?`), args.push(from));
  if (res.dateCol && to) (where.push(`${res.dateCol} <= ?`), args.push(to));
  const sql = `SELECT * FROM ${name} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY ${res.order}`;
  return c.json(db.prepare(sql).all(...args));
});

app.post('/api/r/:res', async (c) => {
  const name = c.req.param('res');
  const res = RESOURCES[name];
  if (!res) return c.json({ error: 'unknown resource' }, 404);
  const row = { id: randomUUID(), ...pickColumns(res, await c.req.json()), created_at: now(), updated_at: now() };
  const keys = Object.keys(row);
  db.prepare(`INSERT INTO ${name} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`).run(...Object.values(row));
  emit(name);
  return c.json(db.prepare(`SELECT * FROM ${name} WHERE id = ?`).get(row.id), 201);
});

app.patch('/api/r/:res/:id', async (c) => {
  const name = c.req.param('res');
  const res = RESOURCES[name];
  if (!res) return c.json({ error: 'unknown resource' }, 404);
  const patch = { ...pickColumns(res, await c.req.json()), updated_at: now() };
  const keys = Object.keys(patch);
  db.prepare(`UPDATE ${name} SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`).run(...Object.values(patch), c.req.param('id'));
  emit(name);
  return c.json(db.prepare(`SELECT * FROM ${name} WHERE id = ?`).get(c.req.param('id')) ?? null);
});

app.delete('/api/r/:res/:id', (c) => {
  const name = c.req.param('res');
  if (!RESOURCES[name]) return c.json({ error: 'unknown resource' }, 404);
  db.prepare(`DELETE FROM ${name} WHERE id = ?`).run(c.req.param('id'));
  emit(name);
  if (name === 'habits') emit('habit_logs');
  if (name === 'workouts') emit('sets');
  return c.body(null, 204);
});

// ---- Daily single-value records (one water/sleep/weight/mood value per day, one journal per day) ----
app.put('/api/health/:date/:kind', async (c) => {
  const { date, kind } = c.req.param();
  const { value } = await c.req.json<{ value: number }>();
  db.prepare(
    `INSERT INTO health (id, date, kind, value, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (date, kind) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
  ).run(randomUUID(), date, kind, value, now(), now());
  emit('health');
  return c.json({ ok: true });
});

app.put('/api/journal/:date', async (c) => {
  const { body = null, mood = null } = await c.req.json<{ body?: string; mood?: number }>();
  db.prepare(
    `INSERT INTO journal (id, date, body, mood, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (date) DO UPDATE SET body = excluded.body, mood = excluded.mood, updated_at = excluded.updated_at`,
  ).run(randomUUID(), c.req.param('date'), body, mood, now(), now());
  emit('journal');
  return c.json({ ok: true });
});

// ---- Habit check-ins ----
app.get('/api/habit_logs', (c) => {
  const from = c.req.query('from') ?? '0000';
  return c.json(db.prepare('SELECT * FROM habit_logs WHERE date >= ?').all(from));
});

app.post('/api/habit_logs/toggle', async (c) => {
  const { habit_id, date } = await c.req.json<{ habit_id: string; date: string }>();
  const removed = db.prepare('DELETE FROM habit_logs WHERE habit_id = ? AND date = ?').run(habit_id, date);
  if (removed.changes === 0) db.prepare('INSERT INTO habit_logs (habit_id, date) VALUES (?, ?)').run(habit_id, date);
  emit('habit_logs');
  return c.json({ done: removed.changes === 0 });
});

// ---- Drop: text & files between devices ----
function deviceFrom(ua = '') {
  if (/iPhone|Android.+Mobile|Mobile/i.test(ua)) return 'phone';
  if (/iPad|Tablet|Android/i.test(ua)) return 'tablet';
  return 'laptop';
}

app.get('/api/drops', (c) => c.json(db.prepare('SELECT * FROM drops ORDER BY created_at DESC LIMIT 200').all()));

app.post('/api/drops', async (c) => {
  const body = await c.req.parseBody();
  const id = randomUUID();
  const device = deviceFrom(c.req.header('user-agent'));
  const file = body.file;
  if (file instanceof File) {
    await writeFile(join(FILES_DIR, id), Buffer.from(await file.arrayBuffer()));
    db.prepare('INSERT INTO drops (id, kind, filename, mime, size, device, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
      id, 'file', file.name || 'file', file.type || 'application/octet-stream', file.size, device, now(), now(),
    );
  } else if (typeof body.text === 'string' && body.text.trim()) {
    db.prepare('INSERT INTO drops (id, kind, text, device, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run(id, 'text', body.text, device, now(), now());
  } else {
    return c.json({ error: 'send `text` or `file`' }, 400);
  }
  emit('drops');
  return c.json(db.prepare('SELECT * FROM drops WHERE id = ?').get(id), 201);
});

app.get('/api/drops/:id/file', async (c) => {
  const row = db.prepare('SELECT * FROM drops WHERE id = ? AND kind = ?').get(c.req.param('id'), 'file') as
    | { id: string; filename: string; mime: string }
    | undefined;
  const path = row && join(FILES_DIR, row.id);
  if (!row || !path || !existsSync(path)) return c.json({ error: 'not found' }, 404);
  const disposition = c.req.query('inline') ? 'inline' : 'attachment';
  return new Response(Readable.toWeb(createReadStream(path)) as ReadableStream, {
    headers: {
      'content-type': row.mime,
      'content-length': String((await stat(path)).size),
      'content-disposition': `${disposition}; filename*=UTF-8''${encodeURIComponent(row.filename)}`,
      'cache-control': 'private, max-age=31536000, immutable',
    },
  });
});

app.delete('/api/drops/:id', async (c) => {
  const id = c.req.param('id');
  db.prepare('DELETE FROM drops WHERE id = ?').run(id);
  await unlink(join(FILES_DIR, id)).catch(() => {});
  emit('drops');
  return c.body(null, 204);
});

// ---- Settings (shared between devices) ----
app.get('/api/settings', (c) => {
  const rows = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[];
  return c.json(Object.fromEntries(rows.map((r) => [r.key, JSON.parse(r.value)])));
});

app.put('/api/settings', async (c) => {
  const body = await c.req.json<Record<string, unknown>>();
  const stmt = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value');
  for (const [k, v] of Object.entries(body)) stmt.run(k, JSON.stringify(v));
  emit('settings');
  return c.json({ ok: true });
});

// ---- DSA progress (keyed by plan problem id) ----
const DSA_COLS = ['status', 'confidence', 'minutes', 'notes', 'sol_cpp', 'sol_java', 'sol_py', 'solved_at', 'revisit_at'];
app.get('/api/dsa', (c) => c.json(db.prepare('SELECT * FROM dsa_progress').all()));
app.put('/api/dsa/:problem', async (c) => {
  const body = await c.req.json<Record<string, string | number | null>>();
  const cols = DSA_COLS.filter((k) => k in body);
  const problem = c.req.param('problem');
  db.prepare(
    `INSERT INTO dsa_progress (problem, ${cols.join(', ')}${cols.length ? ', ' : ''}updated_at) VALUES (?, ${cols.map(() => '?').join(', ')}${cols.length ? ', ' : ''}?)
     ON CONFLICT (problem) DO UPDATE SET ${[...cols.map((k) => `${k} = excluded.${k}`), 'updated_at = excluded.updated_at'].join(', ')}`,
  ).run(problem, ...cols.map((k) => body[k] ?? null), now());
  emit('dsa');
  return c.json(db.prepare('SELECT * FROM dsa_progress WHERE problem = ?').get(problem));
});

// ---- Contests & profiles (cached upstream fetches) ----
app.get('/api/contests', async (c) => c.json(await upcomingContests()));
app.get('/api/profiles', async (c) => c.json(await profiles({ codeforces: c.req.query('cf') || undefined, leetcode: c.req.query('lc') || undefined })));

// ---- Code runner ----
app.post('/api/run', async (c) => {
  if (process.env.RUNNER === 'off') return c.json({ error: 'runner disabled (RUNNER=off)' }, 403);
  const { lang, code, stdin = '' } = await c.req.json<{ lang: Lang; code: string; stdin?: string }>();
  if (!['cpp', 'java', 'py'].includes(lang) || typeof code !== 'string') return c.json({ error: 'lang must be cpp | java | py' }, 400);
  return c.json(await run(lang, code, stdin));
});

// ---- Push reminders ----
app.get('/api/push/key', (c) => c.json({ publicKey }));
app.get('/api/push/subs', (c) => c.json(subscriptions()));
app.post('/api/push/subscribe', async (c) => {
  const sub = await c.req.json();
  if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) return c.json({ error: 'invalid subscription' }, 400);
  subscribe(sub, deviceFrom(c.req.header('user-agent')));
  return c.json({ ok: true });
});
app.post('/api/push/unsubscribe', async (c) => {
  const { endpoint } = await c.req.json<{ endpoint: string }>();
  unsubscribe(endpoint);
  return c.json({ ok: true });
});
app.post('/api/push/test', async (c) => c.json(await pushAll({ tag: 'test', title: '🏁 Push reminders are on', body: 'This device will get task reminders, even with the app closed.', url: '/tasks' })));
app.post('/api/push/action', async (c) => {
  const { taskId, action } = await c.req.json<{ taskId: string; action: 'done' | 'snooze' }>();
  if (!taskId || !['done', 'snooze'].includes(action)) return c.json({ error: 'bad action' }, 400);
  taskAction(taskId, action);
  emit('tasks');
  return c.json({ ok: true });
});

app.get('/api/health-check', (c) => c.json({ ok: true, time: now() }));

// ---- Built web app (production) ----
if (process.env.NODE_ENV === 'production') {
  app.use('/*', serveStatic({ root: './dist' }));
  // Read per request (it's tiny) so a rebuild never leaves deep links pointing at deleted asset hashes.
  app.get('*', async (c) => c.html(await readFile('./dist/index.html', 'utf8')));
}

startReminderLoop();

serve({ fetch: app.fetch, port: PORT, hostname: HOST }, (info) => {
  console.log(`✦ Dev Tools 2.0 API on http://${HOST}:${info.port}`);
});
