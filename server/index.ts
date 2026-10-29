import { Hono, type Context } from 'hono';
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
import { getQuestion } from './leetcode.ts';
import { judge, support } from './judge.ts';
import { localStamp, publicKey, pushAll, remindersTick, subscribe, subscriptions, taskAction, unsubscribe } from './push.ts';
import { schedule, startScheduler } from './scheduler.ts';
import { listBackups, runBackup } from './backup.ts';
import * as google from './google.ts';
import { briefsTick, eveningRecap, morningBrief } from './briefs.ts';
import { syncLeetCode } from './lcsync.ts';
import { DSA_SYSTEM, FUEL_SYSTEM, ask, dsaPrompt, type DsaAsk } from './coach.ts';

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
  if (name === 'routines') void google.syncRoutine(row.id).then(() => emit('routines'));
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
  if (name === 'routines' && !('gcal_event_id' in patch)) void google.syncRoutine(c.req.param('id')).then(() => emit('routines'));
  return c.json(db.prepare(`SELECT * FROM ${name} WHERE id = ?`).get(c.req.param('id')) ?? null);
});

app.delete('/api/r/:res/:id', (c) => {
  const name = c.req.param('res');
  if (!RESOURCES[name]) return c.json({ error: 'unknown resource' }, 404);
  if (name === 'routines') {
    const ev = (db.prepare('SELECT gcal_event_id FROM routines WHERE id = ?').get(c.req.param('id')) as { gcal_event_id: string | null } | undefined)?.gcal_event_id;
    db.prepare('DELETE FROM routine_logs WHERE routine_id = ?').run(c.req.param('id'));
    void google.syncRoutine(c.req.param('id'), ev ?? null);
  }
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

// ---- LeetCode statements + local judge ----
app.get('/api/lc/:slug', async (c) => {
  try {
    const q = await getQuestion(c.req.param('slug'));
    return c.json({ ...q, support: support(q) });
  } catch (e) {
    return c.json({ error: (e as Error).message }, 502);
  }
});
app.post('/api/judge', async (c) => {
  if (process.env.RUNNER === 'off') return c.json({ error: 'runner disabled (RUNNER=off)' }, 403);
  const { slug, lang, code, input, ignoreOrder } = await c.req.json<{ slug: string; lang: Lang; code: string; input?: string; ignoreOrder?: boolean }>();
  if (!['cpp', 'java', 'py'].includes(lang) || typeof code !== 'string') return c.json({ error: 'lang must be cpp | java | py' }, 400);
  const q = await getQuestion(slug);
  const sup = support(q);
  if (!sup.ok) return c.json({ error: sup.reason }, 422);
  return c.json(await judge(q, lang, code, { input, ignoreOrder }));
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

// ---- Routines: check-offs (a linked habit is ticked with them) ----
app.get('/api/routine_logs', (c) => c.json(db.prepare('SELECT * FROM routine_logs WHERE date >= ?').all(c.req.query('from') ?? '0000')));
app.post('/api/routine_logs/toggle', async (c) => {
  const { routine_id, date } = await c.req.json<{ routine_id: string; date: string }>();
  const removed = db.prepare('DELETE FROM routine_logs WHERE routine_id = ? AND date = ?').run(routine_id, date).changes > 0;
  if (!removed) db.prepare('INSERT INTO routine_logs (routine_id, date) VALUES (?, ?)').run(routine_id, date);
  const habit = (db.prepare('SELECT habit_id FROM routines WHERE id = ?').get(routine_id) as { habit_id: string | null } | undefined)?.habit_id;
  if (habit) {
    if (removed) db.prepare('DELETE FROM habit_logs WHERE habit_id = ? AND date = ?').run(habit, date);
    else db.prepare('INSERT OR IGNORE INTO habit_logs (habit_id, date) VALUES (?, ?)').run(habit, date);
    emit('habit_logs');
  }
  emit('routine_logs');
  return c.json({ done: !removed });
});

// ---- Google Calendar ----
/** Public origin of this request — behind `tailscale serve` the scheme is https even though we see http. */
const originOf = (c: { req: { url: string; header: (k: string) => string | undefined } }) => {
  const u = new URL(c.req.url);
  const host = c.req.header('x-forwarded-host') ?? c.req.header('host') ?? u.host;
  const proto = c.req.header('x-forwarded-proto') ?? (host.endsWith('.ts.net') ? 'https' : u.protocol.replace(':', ''));
  return `${proto}://${host}`;
};
app.get('/api/google/status', (c) => c.json({ ...google.status(), redirectUri: `${originOf(c)}/api/google/callback` }));
app.post('/api/google/config', async (c) => {
  const { clientId, clientSecret } = await c.req.json<{ clientId: string; clientSecret: string }>();
  if (!clientId?.includes('.apps.googleusercontent.com') || !clientSecret) return c.json({ error: 'That doesn’t look like an OAuth client ID / secret' }, 400);
  google.configure(clientId, clientSecret);
  return c.json(google.status());
});
app.get('/api/google/auth', (c) => c.redirect(google.authUrl(`${originOf(c)}/api/google/callback`)));
app.get('/api/google/callback', async (c) => {
  const err = c.req.query('error');
  if (err) return c.redirect(`/routines?google=${encodeURIComponent(err)}`);
  try {
    await google.finishAuth(c.req.query('code') ?? '');
    const n = await google.syncAll();
    emit('routines');
    return c.redirect(`/routines?google=connected&synced=${n}`);
  } catch (e) {
    return c.redirect(`/routines?google=${encodeURIComponent((e as Error).message)}`);
  }
});
app.post('/api/google/disconnect', async (c) => (await google.disconnect(), emit('routines'), c.json(google.status())));
app.post('/api/google/sync', async (c) => (c.json({ synced: await google.syncAll() })));
app.get('/api/google/events', async (c) => {
  try {
    return c.json(await google.events(c.req.query('from') ?? '', c.req.query('to') ?? c.req.query('from') ?? ''));
  } catch (e) {
    return c.json({ error: (e as Error).message }, 502);
  }
});

app.get('/api/briefs/preview', (c) => c.json({ morning: morningBrief(), evening: eveningRecap() }));
app.post('/api/briefs/test', async (c) => {
  const which = c.req.query('which') === 'evening' ? eveningRecap() : morningBrief();
  return c.json(await pushAll({ tag: 'brief-test', ...which }));
});

app.post('/api/dsa/sync-leetcode', async (c) => {
  const r = await syncLeetCode();
  if (!r) return c.json({ error: 'Add your LeetCode username in DSA → Driver ratings first' }, 400);
  if (r.marked.length) emit('dsa');
  return c.json(r);
});

// ---- AI coach via the local Claude Code CLI (streamed as SSE) ----
function coachStream(c: Context, system: string, prompt: string) {
  return streamSSE(c, async (stream) => {
    const ctl = new AbortController();
    stream.onAbort(() => ctl.abort());
    try {
      await ask(system, prompt, { signal: ctl.signal, onDelta: (t) => void stream.writeSSE({ event: 'delta', data: JSON.stringify(t) }) });
      await stream.writeSSE({ event: 'done', data: '' });
    } catch (e) {
      if (!ctl.signal.aborted) await stream.writeSSE({ event: 'error', data: (e as Error).message });
    }
  });
}
app.post('/api/coach/dsa', async (c) => {
  const body = await c.req.json<DsaAsk & { slug?: string }>();
  let statementHtml: string | undefined;
  if (body.slug) statementHtml = await getQuestion(body.slug).then((q) => q.html).catch(() => undefined);
  return coachStream(c, DSA_SYSTEM, dsaPrompt({ ...body, statementHtml }));
});
app.post('/api/coach/fuel', async (c) => {
  const { remaining, usual, meal } = await c.req.json<{ remaining: { kcal: number; protein: number; carbs: number; fat: number }; usual: string[]; meal: string }>();
  const prompt = `Plan my ${meal} so I finish the day on target.\nRemaining today: ${Math.round(remaining.kcal)} kcal, ${Math.round(remaining.protein)} g protein, ${Math.round(remaining.carbs)} g carbs, ${Math.round(remaining.fat)} g fat.\nFoods I eat often: ${usual.slice(0, 20).join(', ') || 'typical North Indian home food'}.\nI'm vegetarian-friendly unless I've logged meat above.`;
  return coachStream(c, FUEL_SYSTEM, prompt);
});

app.get('/api/backups', async (c) => c.json(await listBackups()));
app.post('/api/backups', async (c) => c.json(await runBackup()));

app.get('/api/health-check', (c) => c.json({ ok: true, time: now() }));

// ---- Android share target: Share → Dev Tools lands in Drop ----
app.post('/share', async (c) => {
  const body = await c.req.parseBody({ all: true });
  const device = deviceFrom(c.req.header('user-agent'));
  const text = [body.title, body.text, body.url].filter((x) => typeof x === 'string' && x.trim()).join('\n');
  if (text) db.prepare('INSERT INTO drops (id, kind, text, device, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run(randomUUID(), 'text', text, device, now(), now());
  const files = ([] as unknown[]).concat(body.file ?? []).filter((f): f is File => f instanceof File && f.size > 0);
  for (const file of files) {
    const id = randomUUID();
    await writeFile(join(FILES_DIR, id), Buffer.from(await file.arrayBuffer()));
    db.prepare('INSERT INTO drops (id, kind, filename, mime, size, device, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(id, 'file', file.name || 'shared', file.type || 'application/octet-stream', file.size, device, now(), now());
  }
  emit('drops');
  return c.redirect('/drop', 303);
});

// ---- Built web app (production) ----
if (process.env.NODE_ENV === 'production') {
  app.use('/*', serveStatic({ root: './dist' }));
  // Read per request (it's tiny) so a rebuild never leaves deep links pointing at deleted asset hashes.
  app.get('*', async (c) => c.html(await readFile('./dist/index.html', 'utf8')));
}

schedule({ name: 'task-reminders', every: 20_000, run: remindersTick });
schedule({ name: 'backup', at: '03:00', run: runBackup });
schedule({ name: 'routine-reminders', every: 20_000, run: routineReminders });
schedule({ name: 'briefs', every: 20_000, run: briefsTick });
schedule({ name: 'leetcode-sync', every: 30 * 60_000, run: async () => (await syncLeetCode())?.marked.length && emit('dsa') });
// If the laptop was off at 03:00, back up on the first start of the day instead.
schedule({ name: 'backup-catchup', at: '00:00', run: async () => (await listBackups())[0] !== new Date().toISOString().slice(0, 10) && runBackup() });
/** Push "time for X" when a routine's start time arrives on one of its days (once per day). */
async function routineReminders() {
  const now = new Date();
  const stamp = localStamp(now);
  const [day, hm] = stamp.split('T');
  const rows = db.prepare('SELECT id, name, emoji, days, time, duration_min FROM routines WHERE active = 1 AND remind = 1').all() as { id: string; name: string; emoji: string | null; days: string; time: string; duration_min: number }[];
  for (const r of rows) {
    if (!JSON.parse(r.days).includes(now.getDay()) || r.time > hm || hm > addMinutes(r.time, 10)) continue;
    const claimed = db.prepare('INSERT OR IGNORE INTO push_sent (task_id, due, sent_at) VALUES (?, ?, ?)').run(`routine:${r.id}`, `${day}T${r.time}`, now.toISOString());
    if (claimed.changes) await pushAll({ tag: `routine-${r.id}`, title: `${r.emoji ?? '⏱️'} ${r.name}`, body: `Starting now · ${r.duration_min} min`, url: '/routines' });
  }
}
const addMinutes = (hm: string, n: number) => {
  const [h, m] = hm.split(':').map(Number);
  const t = h * 60 + m + n;
  return `${String(Math.floor(t / 60) % 24).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
};

startScheduler();

serve({ fetch: app.fetch, port: PORT, hostname: HOST }, (info) => {
  console.log(`✦ Dev Tools 2.0 API on http://${HOST}:${info.port}`);
});
