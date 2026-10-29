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
import { completeTask, localStamp, publicKey, pushAll, remindersTick, subscribe, subscriptions, taskAction, unsubscribe } from './push.ts';
import { claimToday, nowHM, schedule, startScheduler } from './scheduler.ts';
import { listBackups, runBackup } from './backup.ts';
import * as google from './google.ts';
import { briefsTick, eveningRecap, morningBrief } from './briefs.ts';
import { syncLeetCode } from './lcsync.ts';
import { DSA_SYSTEM, FUEL_SYSTEM, INTERVIEW_SYSTEM, SCORE_SYSTEM, ask, dsaPrompt, interviewPrompt, type DsaAsk, type InterviewAsk, type Prompt } from './coach.ts';
import { CAPTURE_SYSTEM, CHAT_SYSTEM, JOURNAL_GUIDE, chatPrompt, lifeContext, workRemindersTick, cookTick, shopTick, lifePingsTick, planTick, dayFacts, dayFactsText, journalTick, type ChatTurn } from './assistant.ts';
import { normaliseActions, splitActions } from '../web/src/core/aiActions.ts';
import { generateReview, listReviews, mondayOf, reviewTick } from './review.ts';
import { contactKey, normalisePhone } from '../web/src/core/vcard.ts';
import { STORY_SYSTEM, storyPrompt, type Answer } from '../web/src/core/journal.ts';
import { RECEIPT_SYSTEM, normaliseReceipt } from '../web/src/core/money.ts';
import { AI_FOOD_SYSTEM, aiUserText, extractJson, normaliseAi } from '../web/src/core/aiFood.ts';
import { gym } from './gym.ts';

const PORT = Number(process.env.PORT ?? 4300);
// Loopback by default: `tailscale serve` proxies to it, so only devices on your tailnet can reach it.
const HOST = process.env.HOST ?? '127.0.0.1';

const app = new Hono();
app.route('/api/gym', gym);
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
  const body = await c.req.json();
  // Clients may supply the id (phones generate it so offline-queued rows can reference each other).
  // A replayed request with an id that already exists returns that row instead of failing — idempotent.
  const id = typeof body.id === 'string' && /^[0-9a-f-]{36}$/i.test(body.id) ? body.id : randomUUID();
  const existing = db.prepare(`SELECT * FROM ${name} WHERE id = ?`).get(id);
  if (existing) return c.json(existing, 200);
  const row = { id, ...pickColumns(res, body), created_at: now(), updated_at: now() };
  const keys = Object.keys(row);
  db.prepare(`INSERT INTO ${name} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`).run(...Object.values(row));
  emit(name);
  if (name === 'routines') void google.syncRoutine(row.id).then(() => emit('routines'));
  if (name === 'tasks' && (row as Record<string, unknown>).kind === 'plan') void google.syncTask(row.id).then(() => emit('tasks'));
  return c.json(db.prepare(`SELECT * FROM ${name} WHERE id = ?`).get(row.id), 201);
});

app.patch('/api/r/:res/:id', async (c) => {
  const name = c.req.param('res');
  const res = RESOURCES[name];
  if (!res) return c.json({ error: 'unknown resource' }, 404);
  const patch = { ...pickColumns(res, await c.req.json()), updated_at: now() };
  const keys = Object.keys(patch);
  db.prepare(`UPDATE ${name} SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`).run(...Object.values(patch), c.req.param('id'));
  // Ticking off a repeating task rolls it to the next due date instead of closing it.
  if (name === 'tasks' && (patch as Record<string, unknown>).done === 1) (completeTask(c.req.param('id')), emit('expenses'));
  emit(name);
  if (name === 'tasks' && !('gcal_event_id' in patch) && ['due', 'title', 'place', 'duration_min', 'kind', 'notes'].some((k) => k in patch)) void google.syncTask(c.req.param('id')).then(() => emit('tasks'));
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
  if (name === 'tasks') {
    const ev = (db.prepare('SELECT gcal_event_id FROM tasks WHERE id = ?').get(c.req.param('id')) as { gcal_event_id: string | null } | undefined)?.gcal_event_id;
    if (ev) void google.syncTask(c.req.param('id'), ev);
  }
  db.prepare(`DELETE FROM ${name} WHERE id = ?`).run(c.req.param('id'));
  emit(name);
  if (name === 'habits') emit('habit_logs');
  if (name === 'workouts') emit('sets');
  if (name === 'expenses' && db.prepare('DELETE FROM splits WHERE expense_id = ?').run(c.req.param('id')).changes) emit('splits');
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
  // Only the fields sent are changed, so saving answers never wipes the story (and vice versa).
  const patch = await c.req.json<{ body?: string | null; mood?: number | null; answers?: unknown }>();
  const date = c.req.param('date');
  const cur = db.prepare('SELECT body, mood, answers FROM journal WHERE date = ?').get(date) as { body: string | null; mood: number | null; answers: string | null } | undefined;
  const body = 'body' in patch ? (patch.body ?? null) : (cur?.body ?? null);
  const mood = 'mood' in patch ? (patch.mood ?? null) : (cur?.mood ?? null);
  const answers = 'answers' in patch ? (patch.answers == null ? null : JSON.stringify(patch.answers)) : (cur?.answers ?? null);
  db.prepare(
    `INSERT INTO journal (id, date, body, mood, answers, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (date) DO UPDATE SET body = excluded.body, mood = excluded.mood, answers = excluded.answers, updated_at = excluded.updated_at`,
  ).run(randomUUID(), date, body, mood, answers, now(), now());
  emit('journal');
  return c.json({ ok: true });
});

// ---- Guided journal: what happened today (for tailored questions) and the AI-written story ----
app.get('/api/journal/:date/facts', (c) => c.json(dayFacts(c.req.param('date'))));
app.post('/api/journal/:date/story', async (c) => {
  const date = c.req.param('date');
  const row = db.prepare('SELECT answers FROM journal WHERE date = ?').get(date) as { answers: string | null } | undefined;
  const answers = (JSON.parse(row?.answers ?? '[]') as Answer[]).filter((x) => x?.a?.trim());
  if (!answers.length) return c.json({ error: 'Answer at least one question first' }, 400);
  try {
    const story = (await ask(STORY_SYSTEM, storyPrompt(date, answers, dayFactsText(date)), { onDelta: () => {}, signal: c.req.raw.signal })).trim();
    db.prepare('UPDATE journal SET body = ?, updated_at = ? WHERE date = ?').run(story, now(), date);
    emit('journal');
    return c.json({ body: story });
  } catch (e) {
    return c.json({ error: (e as Error).message }, 502);
  }
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

app.get('/api/drops', (c) => c.json(db.prepare('SELECT * FROM drops ORDER BY pinned DESC, created_at DESC LIMIT 500').all()));

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
  const size = (await stat(path)).size;
  const headers: Record<string, string> = {
    'content-type': row.mime,
    'accept-ranges': 'bytes',
    'content-disposition': `${disposition}; filename*=UTF-8''${encodeURIComponent(row.filename)}`,
    'cache-control': 'private, max-age=31536000, immutable',
  };
  // Byte ranges: iOS Safari won't play a video (or seek audio) without them.
  const range = /^bytes=(\d*)-(\d*)$/.exec(c.req.header('range') ?? '');
  if (range && size > 0) {
    const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
    const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    if (start > end || start >= size) return new Response(null, { status: 416, headers: { 'content-range': `bytes */${size}` } });
    return new Response(Readable.toWeb(createReadStream(path, { start, end })) as ReadableStream, { status: 206, headers: { ...headers, 'content-length': String(end - start + 1), 'content-range': `bytes ${start}-${end}/${size}` } });
  }
  return new Response(Readable.toWeb(createReadStream(path)) as ReadableStream, { headers: { ...headers, 'content-length': String(size) } });
});

app.patch('/api/drops/:id', async (c) => {
  const { pinned } = await c.req.json<{ pinned?: boolean | number }>();
  db.prepare('UPDATE drops SET pinned = ?, updated_at = ? WHERE id = ?').run(pinned ? 1 : 0, now(), c.req.param('id'));
  emit('drops');
  return c.json(db.prepare('SELECT * FROM drops WHERE id = ?').get(c.req.param('id')) ?? null);
});

/** Delete unpinned drops older than N days (default 7) and their files. */
app.post('/api/drops/clear', async (c) => {
  const { days = 7 } = await c.req.json<{ days?: number }>().catch(() => ({ days: 7 }));
  const cutoff = new Date(Date.now() - Math.max(0, Number(days) || 0) * 86_400_000).toISOString();
  const rows = db.prepare('SELECT id FROM drops WHERE pinned = 0 AND created_at < ?').all(cutoff) as { id: string }[];
  for (const r of rows) await unlink(join(FILES_DIR, r.id)).catch(() => {});
  db.prepare('DELETE FROM drops WHERE pinned = 0 AND created_at < ?').run(cutoff);
  emit('drops');
  return c.json({ removed: rows.length });
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
  const { taskId, routineId, suppId, personId, action } = await c.req.json<{ taskId?: string; routineId?: string; suppId?: string; personId?: string; action: string }>();
  if (action === 'water') {
    const day = localStamp(new Date()).slice(0, 10);
    const cur = (db.prepare("SELECT value FROM health WHERE date = ? AND kind = 'water'").get(day) as { value: number } | undefined)?.value ?? 0;
    db.prepare("INSERT INTO health (id, date, kind, value, created_at, updated_at) VALUES (?, ?, 'water', ?, ?, ?) ON CONFLICT (date, kind) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at").run(randomUUID(), day, cur + 1, now(), now());
    emit('health');
    return c.json({ ok: true, water: cur + 1 });
  }
  if (suppId && action === 'taken') {
    db.prepare("INSERT OR IGNORE INTO checks (kind, ref, date) VALUES ('supp', ?, ?)").run(suppId, localStamp(new Date()).slice(0, 10));
    emit('checks');
    return c.json({ ok: true });
  }
  if (personId && action === 'talked') {
    db.prepare('UPDATE people SET last_contact = ?, updated_at = ? WHERE id = ?').run(localStamp(new Date()).slice(0, 10), now(), personId);
    emit('people');
    return c.json({ ok: true });
  }
  if (routineId && action === 'done') {
    const day = localStamp(new Date()).slice(0, 10);
    db.prepare('INSERT OR IGNORE INTO routine_logs (routine_id, date) VALUES (?, ?)').run(routineId, day);
    const habit = (db.prepare('SELECT habit_id FROM routines WHERE id = ?').get(routineId) as { habit_id: string | null } | undefined)?.habit_id;
    if (habit) db.prepare('INSERT OR IGNORE INTO habit_logs (habit_id, date) VALUES (?, ?)').run(habit, day), emit('habit_logs');
    emit('routine_logs');
    return c.json({ ok: true });
  }
  if (!taskId || !['done', 'snooze'].includes(action)) return c.json({ error: 'bad action' }, 400);
  taskAction(taskId, action as 'done' | 'snooze');
  emit('tasks');
  emit('expenses');
  return c.json({ ok: true });
});

// ---- Contacts import (vCard or contact picker): upsert, deduped by phone (or name without one) ----
app.post('/api/contacts/import', async (c) => {
  const { contacts } = await c.req.json<{ contacts: { name?: string; phone?: string | null; birthday?: string | null }[] }>();
  if (!Array.isArray(contacts)) return c.json({ error: 'contacts[] required' }, 400);
  const existing = db.prepare('SELECT id, name, phone FROM contacts').all() as { id: string; name: string; phone: string | null }[];
  const byKey = new Map(existing.map((r) => [contactKey(r), r.id]));
  let added = 0;
  let updated = 0;
  db.exec('BEGIN');
  try {
    for (const raw of contacts.slice(0, 5000)) {
      const name = String(raw.name ?? '').trim().slice(0, 80);
      if (!name) continue;
      const phone = raw.phone ? normalisePhone(String(raw.phone)) : null;
      const bday = raw.birthday && /^\d{4}-\d{2}-\d{2}$/.test(raw.birthday) ? raw.birthday : null;
      const id = byKey.get(contactKey({ name, phone }));
      if (id) (db.prepare('UPDATE contacts SET name = ?, birthday = coalesce(?, birthday), updated_at = ? WHERE id = ?').run(name, bday, now(), id), updated++);
      else {
        const nid = randomUUID();
        db.prepare('INSERT INTO contacts (id, name, phone, birthday, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run(nid, name, phone, bday, now(), now());
        byKey.set(contactKey({ name, phone }), nid);
        added++;
      }
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  emit('contacts');
  return c.json({ added, updated, total: (db.prepare('SELECT count(*) n FROM contacts').get() as { n: number }).n });
});

// ---- Daily check-offs (supplements) ----
app.get('/api/checks', (c) => c.json(db.prepare('SELECT * FROM checks WHERE kind = ? AND date >= ?').all(c.req.query('kind') ?? '', c.req.query('from') ?? '0000')));
app.post('/api/checks/toggle', async (c) => {
  const { kind, ref, date } = await c.req.json<{ kind: string; ref: string; date: string }>();
  if (!kind || !ref || !/^\d{4}-\d{2}-\d{2}$/.test(date ?? '')) return c.json({ error: 'kind, ref and date are required' }, 400);
  const removed = db.prepare('DELETE FROM checks WHERE kind = ? AND ref = ? AND date = ?').run(kind, ref, date).changes > 0;
  if (!removed) db.prepare('INSERT INTO checks (kind, ref, date) VALUES (?, ?, ?)').run(kind, ref, date);
  emit('checks');
  return c.json({ done: !removed });
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
app.get('/api/ai/context', async (c) => c.text(await lifeContext()));
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
  const { remaining, usual, meal, diet = 'veg' } = await c.req.json<{ remaining: { kcal: number; protein: number; carbs: number; fat: number }; usual: string[]; meal: string; diet?: 'veg' | 'egg' | 'nonveg' }>();
  const dietLine = { veg: 'I am strictly vegetarian: no meat, no fish, no eggs (dairy like paneer, curd, milk and whey is fine). Never suggest any of those.', egg: 'I am eggetarian: no meat or fish, eggs and dairy are fine.', nonveg: 'I eat everything.' }[diet];
  const prompt = `Plan my ${meal} so I finish the day on target.\nRemaining today: ${Math.round(remaining.kcal)} kcal, ${Math.round(remaining.protein)} g protein, ${Math.round(remaining.carbs)} g carbs, ${Math.round(remaining.fat)} g fat.\nFoods I eat often: ${usual.slice(0, 20).join(', ') || 'typical North Indian home food'}.\n${dietLine}`;
  return coachStream(c, FUEL_SYSTEM, prompt);
});

// ---- DSA mock interview: streamed interviewer turns, then a JSON scorecard ----
app.post('/api/coach/interview', async (c) => {
  const body = await c.req.json<InterviewAsk & { slug: string }>();
  const statementHtml = await getQuestion(body.slug).then((q) => q.html).catch(() => undefined);
  return coachStream(c, INTERVIEW_SYSTEM, interviewPrompt({ ...body, statementHtml }));
});
app.post('/api/dsa/mock/score', async (c) => {
  const body = await c.req.json<InterviewAsk & { slug: string }>();
  const statementHtml = await getQuestion(body.slug).then((q) => q.html).catch(() => undefined);
  try {
    const reply = await ask(SCORE_SYSTEM, interviewPrompt({ ...body, statementHtml, message: '(interview over — write the feedback)' }), { onDelta: () => {}, signal: c.req.raw.signal });
    const j = extractJson(reply) as Record<string, unknown>;
    const sc = (j.scores ?? {}) as Record<string, number>;
    const clamp = (n: unknown) => Math.max(1, Math.min(4, Math.round(Number(n) || 1)));
    const scores = Object.fromEntries(['problem_solving', 'coding', 'communication', 'testing', 'complexity'].map((k) => [k, clamp(sc[k])]));
    const list = (v: unknown) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string').slice(0, 5) : []);
    return c.json({ verdict: typeof j.verdict === 'string' ? j.verdict : 'Lean no hire', scores, hints_used: Number(j.hints_used) || 0, strengths: list(j.strengths), improve: list(j.improve), summary: String(j.summary ?? ''), next: String(j.next ?? '') });
  } catch (e) {
    return c.json({ error: (e as Error).message }, 502);
  }
});

// ---- Pit Wall: general assistant that sees today's snapshot, and one-shot quick capture ----
app.post('/api/coach/chat', async (c) => {
  const { message, history = [], scope } = await c.req.json<{ message: string; history?: ChatTurn[]; scope?: 'day' | 'journal' }>();
  if (!message?.trim()) return c.json({ error: 'Say something' }, 400);
  const journal = scope === 'journal';
  return coachStream(c, journal ? `${CHAT_SYSTEM}\n\n${JOURNAL_GUIDE}` : CHAT_SYSTEM, await chatPrompt(Array.isArray(history) ? history : [], message, journal ? 'journal' : 'day'));
});
app.post('/api/ai/capture', async (c) => {
  const { text } = await c.req.json<{ text: string }>();
  if (!text?.trim()) return c.json({ error: 'Type something to capture' }, 400);
  try {
    const reply = await ask(CAPTURE_SYSTEM, `# Snapshot\n${await lifeContext()}\n\n# Note\n${text.slice(0, 1000)}`, { onDelta: () => {}, signal: c.req.raw.signal });
    const raw = splitActions(reply).raw ?? reply.slice(reply.indexOf('['), reply.lastIndexOf(']') + 1);
    return c.json({ actions: normaliseActions(raw) });
  } catch (e) {
    return c.json({ error: (e as Error).message }, 502);
  }
});

// ---- AI meal logging: photo and/or description → items to review, then log ----
app.post('/api/fuel/vision', async (c) => {
  const { image, text, diet = 'veg' } = await c.req.json<{ image?: string; text?: string; diet?: 'veg' | 'egg' | 'nonveg' }>();
  const m = image?.match(/^data:(image\/(?:jpeg|png|webp|gif));base64,(.+)$/);
  if (image && !m) return c.json({ error: 'Send the photo as a JPEG/PNG data URL' }, 400);
  if (!m && !text?.trim()) return c.json({ error: 'Add a photo or describe the meal' }, 400);
  if (m && m[2].length > 8_000_000) return c.json({ error: 'Photo too large' }, 413);
  const userText = aiUserText({ text, diet, hasImage: !!m });
  const prompt: Prompt = m ? [{ type: 'image', source: { type: 'base64', media_type: m[1], data: m[2] } }, { type: 'text', text: userText }] : userText;
  try {
    const reply = await ask(AI_FOOD_SYSTEM, prompt, { onDelta: () => {}, signal: c.req.raw.signal });
    return c.json(normaliseAi(extractJson(reply), diet));
  } catch (e) {
    return c.json({ error: (e as Error).message }, 502);
  }
});

// ---- AI receipt reading: photo → merchant, items, extras, total, category ----
app.post('/api/money/receipt', async (c) => {
  const { image, text } = await c.req.json<{ image?: string; text?: string }>();
  const m = image?.match(/^data:(image\/(?:jpeg|png|webp|gif));base64,(.+)$/);
  if (!m && !text?.trim()) return c.json({ error: 'Add a photo of the bill' }, 400);
  if (m && m[2].length > 8_000_000) return c.json({ error: 'Photo too large' }, 413);
  const ask_ = `Read this bill.${text?.trim() ? ` The user adds: "${text.trim().slice(0, 300)}"` : ''} Today is ${localStamp(new Date()).slice(0, 10)}.`;
  const prompt: Prompt = m ? [{ type: 'image', source: { type: 'base64', media_type: m[1], data: m[2] } }, { type: 'text', text: ask_ }] : ask_;
  try {
    const reply = await ask(RECEIPT_SYSTEM, prompt, { onDelta: () => {}, signal: c.req.raw.signal });
    return c.json(normaliseReceipt(extractJson(reply)));
  } catch (e) {
    return c.json({ error: (e as Error).message }, 502);
  }
});

// ---- Weekly AI debrief ----
app.get('/api/reviews', (c) => c.json(listReviews()));
app.post('/api/reviews/generate', async (c) => {
  const { week } = await c.req.json<{ week?: string }>().catch(() => ({ week: undefined }));
  const w = week && /^\d{4}-\d{2}-\d{2}$/.test(week) ? mondayOf(week) : mondayOf(localStamp(new Date()).slice(0, 10));
  try {
    const r = await generateReview(w, c.req.raw.signal);
    emit('reviews');
    return c.json(r);
  } catch (e) {
    return c.json({ error: (e as Error).message }, 502);
  }
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
schedule({ name: 'water-nudges', every: 20_000, run: waterNudge });
schedule({ name: 'work-reminders', every: 20_000, run: workRemindersTick });
schedule({ name: 'cook-brief', every: 20_000, run: cookTick });
schedule({ name: 'shop-day', every: 60_000, run: shopTick });
schedule({ name: 'people-supps', every: 20_000, run: lifePingsTick });
schedule({ name: 'ai-review', every: 60_000, run: reviewTick });
schedule({ name: 'week-plan', every: 20_000, run: planTick });
schedule({ name: 'journal-nudge', every: 60_000, run: journalTick });
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
    if (claimed.changes)
      await pushAll({ tag: `routine-${r.id}`, title: `${r.emoji ?? '⏱️'} ${r.name}`, body: `Starting now · ${r.duration_min} min`, url: '/routines', routineId: r.id, actions: [{ action: 'done', title: '✓ Done' }] });
  }
}
/**
 * Hydration nudge at a few checkpoints, only when behind pace: by HH:MM you should have had the goal
 * × the fraction of the 08:00–22:00 day that has passed. One push per checkpoint per day.
 */
const WATER_CHECKS = ['11:00', '14:00', '17:00', '19:30'];
async function waterNudge() {
  const t = nowHM();
  const slot = WATER_CHECKS.filter((x) => t >= x && t < addMinutes(x, 45)).at(-1);
  if (!slot) return;
  const setting = (k: string) => (db.prepare('SELECT value FROM settings WHERE key = ?').get(k) as { value: string } | undefined)?.value;
  const briefs = JSON.parse(setting('briefs') ?? '{}');
  if (briefs.water === false) return;
  const goal = Number(JSON.parse(setting('waterGoal') ?? '8')) || 8;
  const day = localStamp(new Date()).slice(0, 10);
  const have = (db.prepare("SELECT value FROM health WHERE date = ? AND kind = 'water'").get(day) as { value: number } | undefined)?.value ?? 0;
  const [h, m] = slot.split(':').map(Number);
  const expected = Math.floor(goal * Math.min(1, Math.max(0, (h * 60 + m - 8 * 60) / (14 * 60))));
  if (have >= expected || !claimToday(`water-${slot}`)) return;
  await pushAll({ tag: 'water', title: `💧 ${have}/${goal} glasses`, body: `You'd usually be at ${expected} by now — have one now.`, url: '/life', actions: [{ action: 'water', title: '💧 +1 glass' }] });
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
