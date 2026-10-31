// End-to-end checks of the HTTP API: boots the real server on a throwaway data dir and port,
// then exercises the contracts the phone relies on (idempotent creates for the offline outbox,
// optimistic-update shapes, secrets never leaking through /api/settings).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

const dir = mkdtempSync(join(tmpdir(), 'devtools-api-'));
const port = 4700 + Math.floor(Math.random() * 200);
const base = `http://127.0.0.1:${port}/api`;
let server: ChildProcess;

const call = async (path: string, init: RequestInit & { json?: unknown } = {}) => {
  const res = await fetch(base + path, {
    ...init,
    body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
    headers: init.json !== undefined ? { 'content-type': 'application/json' } : undefined,
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : undefined };
};

before(async () => {
  // A google.json in the data dir must never surface through the settings API.
  writeFileSync(join(dir, 'google.json'), JSON.stringify({ client_id: 'x', client_secret: 'TOP-SECRET', refresh_token: 'TOP-SECRET' }));
  server = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], {
    env: { ...process.env, DATA_DIR: dir, PORT: String(port), RUNNER: 'off', NODE_ENV: 'test' },
    stdio: 'ignore',
  });
  for (let i = 0; i < 80; i++) {
    try {
      if ((await fetch(`${base}/health-check`)).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error('server did not start');
});

after(() => {
  server?.kill();
  rmSync(dir, { recursive: true, force: true });
});

test('create → list → update → delete round-trip', async () => {
  const id = randomUUID();
  const made = await call('/r/tasks', { method: 'POST', json: { id, title: 'Leg day', priority: 2, done: 0, bogus: 'dropped' } });
  assert.equal(made.status, 201);
  assert.equal(made.body.id, id);
  assert.equal(made.body.title, 'Leg day');
  assert.ok(!('bogus' in made.body), 'unknown columns are ignored');

  const list = await call('/r/tasks');
  assert.ok(list.body.some((t: { id: string }) => t.id === id));

  const patched = await call(`/r/tasks/${id}`, { method: 'PATCH', json: { done: 1 } });
  assert.equal(patched.body.done, 1);
  assert.equal(patched.body.title, 'Leg day');

  assert.equal((await call(`/r/tasks/${id}`, { method: 'DELETE' })).status, 204);
  assert.ok(!(await call('/r/tasks')).body.some((t: { id: string }) => t.id === id));
});

test('replayed create with the same client id is idempotent (offline outbox)', async () => {
  const id = randomUUID();
  const first = await call('/r/expenses', { method: 'POST', json: { id, amount: 120, kind: 'expense', category: 'Food', date: '2026-10-29' } });
  const again = await call('/r/expenses', { method: 'POST', json: { id, amount: 999, kind: 'expense', category: 'Food', date: '2026-10-29' } });
  assert.equal(first.status, 201);
  assert.equal(again.status, 200);
  assert.equal(again.body.amount, 120, 'the replay returns the original row, not a second one');
  const rows = (await call('/r/expenses')).body.filter((e: { id: string }) => e.id === id);
  assert.equal(rows.length, 1);
});

test('a workout and its sets created offline keep their link', async () => {
  const workout = randomUUID();
  await call('/r/workouts', { method: 'POST', json: { id: workout, date: '2026-10-29', day_type: 'legs' } });
  const set = await call('/r/sets', { method: 'POST', json: { workout_id: workout, date: '2026-10-29', exercise: 'squat', set_no: 1, weight: 80, reps: 8 } });
  assert.equal(set.status, 201);
  const sets = (await call('/r/sets')).body.filter((s: { workout_id: string }) => s.workout_id === workout);
  assert.equal(sets.length, 1);
});

test('date-range filters apply to dated resources', async () => {
  await call('/r/food_logs', { method: 'POST', json: { date: '2026-10-01', food_id: 'roti', name: 'Roti', qty: 2, meal: 'lunch', kcal: 240, protein: 6, carbs: 44, fat: 4 } });
  await call('/r/food_logs', { method: 'POST', json: { date: '2026-10-29', food_id: 'dal-tadka', name: 'Dal tadka', qty: 1, meal: 'lunch', kcal: 180, protein: 9, carbs: 22, fat: 6 } });
  const oct29 = (await call('/r/food_logs?from=2026-10-29&to=2026-10-29')).body;
  assert.ok(oct29.length >= 1);
  assert.ok(oct29.every((f: { date: string }) => f.date === '2026-10-29'));
});

test('daily health values upsert instead of piling up', async () => {
  await call('/health/2026-10-29/water', { method: 'PUT', json: { value: 3 } });
  await call('/health/2026-10-29/water', { method: 'PUT', json: { value: 4 } });
  const water = (await call('/r/health')).body.filter((h: { date: string; kind: string }) => h.date === '2026-10-29' && h.kind === 'water');
  assert.equal(water.length, 1);
  assert.equal(water[0].value, 4);
});

test('settings round-trip and never expose secrets', async () => {
  await call('/settings', { method: 'PUT', json: { diet: 'veg', waterGoal: 9 } });
  const s = await call('/settings');
  assert.equal(s.body.diet, 'veg');
  assert.equal(s.body.waterGoal, 9);
  assert.ok(!JSON.stringify(s.body).includes('TOP-SECRET'));
});

test('rows missing required fields are a 400 (the outbox drops them instead of retrying forever)', async () => {
  const r = await call('/r/food_logs', { method: 'POST', json: { date: '2026-10-29' } });
  assert.equal(r.status, 400);
});

test('unknown resources are 404, not SQL errors', async () => {
  assert.equal((await call('/r/sqlite_master')).status, 404);
  assert.equal((await call('/r/nope', { method: 'POST', json: {} })).status, 404);
});

test('ticking a repeating task rolls it forward instead of closing it', async () => {
  const id = randomUUID();
  await call('/r/tasks', { method: 'POST', json: { id, title: 'Pay rent', due: '2020-01-05T10:00', repeat: 'monthly', remind_before: 1440, done: 0 } });
  const r = await call(`/r/tasks/${id}`, { method: 'PATCH', json: { done: 1, done_at: new Date().toISOString() } });
  assert.equal(r.body.done, 0);
  assert.match(r.body.due, /^\d{4}-\d{2}-05T10:00$/);
  assert.ok(r.body.due > new Date().toISOString().slice(0, 10), 'lands in the future');
  assert.equal(r.body.remind_before, 1440);
  const plain = randomUUID();
  await call('/r/tasks', { method: 'POST', json: { id: plain, title: 'One-off', due: '2020-01-05', done: 0 } });
  assert.equal((await call(`/r/tasks/${plain}`, { method: 'PATCH', json: { done: 1 } })).body.done, 1);
});

test('AI endpoints validate input before calling the model', async () => {
  assert.equal((await call('/coach/chat', { method: 'POST', json: { message: ' ' } })).status, 400);
  assert.equal((await call('/ai/capture', { method: 'POST', json: { text: '' } })).status, 400);
  const ctx = await fetch(`${base}/ai/context`).then((r) => r.text());
  assert.match(ctx, /WORK today:/);
  assert.ok(!ctx.includes('TOP-SECRET'));
});

test('Daily 3: the same three questions all day, answers saved, a swap brings a new one', async () => {
  const a = (await call('/story/today?date=2030-01-01')).body;
  const b = (await call('/story/today?date=2030-01-01')).body;
  assert.equal(a.length, 3);
  assert.deepEqual(b.map((x: { id: string }) => x.id), a.map((x: { id: string }) => x.id));
  // Short answer: long ones also queue an AI follow-up, which the test shouldn't spawn.
  assert.equal((await call(`/story/${a[0].id}`, { method: 'PUT', json: { a: 'Jaipur, near the old city.' } })).status, 200);
  assert.deepEqual((await call('/story/days')).body, ['2030-01-01']);
  await call(`/story/${a[1].id}/swap`, { method: 'POST' });
  const c = (await call('/story/today?date=2030-01-01')).body;
  assert.equal(c.length, 3);
  assert.ok(!c.some((x: { q: string }) => x.q === a[1].q), 'swapped question is gone');
  // The next day carries on the story instead of repeating it.
  const next = (await call('/story/today?date=2030-01-02')).body;
  assert.ok(!next.some((x: { q: string }) => c.some((y: { q: string }) => y.q === x.q)));
});

test('places: test mode has no side effects; a real office arrival clocks you in', async () => {
  await call('/settings', { method: 'PUT', json: { places: [{ id: 'office', name: 'Office', kind: 'office' }, { id: 'gym', name: 'Gym', kind: 'gym' }] } });
  assert.equal((await call('/hook/place/nowhere/arrive')).status, 404);
  const t = await call('/hook/place/gym/arrive?test=1');
  assert.ok(t.body.push.title);
  assert.equal((await call('/hook/places/log')).body.length, 0);
  const r = await call('/hook/place/office/arrive', { method: 'POST' });
  assert.match(r.body.message, /Clocked in/);
  const s = (await call('/settings')).body;
  const today = Object.keys(s.workOverrides)[0];
  assert.equal(s.workOverrides[today].mode, 'office');
  assert.match(s.workOverrides[today].in, /^\d\d:\d\d$/);
  assert.equal((await call('/hook/places/log')).body[0].place, 'office');
});

test('widget snapshot has everything the Scriptable script reads', async () => {
  const w = (await call('/hook/widget')).body;
  for (const k of ['date', 'gym', 'kcal', 'protein', 'water', 'habits', 'story', 'work', 'next', 'shutdown', 'top']) assert.ok(k in w, k);
  assert.ok(w.kcal.target > 0 && w.protein.target > 0);
});

test('undo a tick-off: a paid repeating bill goes back to its date and its expense leaves Money', async () => {
  const bill = (await call('/r/tasks', { method: 'POST', json: { title: 'Undo rent', kind: 'bill', amount: 777, due: '2030-03-05', repeat: 'monthly' } })).body;
  await call(`/r/tasks/${bill.id}`, { method: 'PATCH', json: { done: 1 } });
  const spent = async () => (await call('/r/expenses')).body.filter((e: { note: string }) => e.note === 'Undo rent').length;
  assert.equal(await spent(), 1);
  const back = (await call(`/tasks/${bill.id}/undo`, { method: 'POST' })).body;
  assert.equal(back.due, '2030-03-05');
  assert.equal(back.done, 0);
  assert.equal(await spent(), 0);
  // A one-off: unticking it in the list takes the expense back out too.
  const once = (await call('/r/tasks', { method: 'POST', json: { title: 'Undo once', kind: 'bill', amount: 50, due: '2030-03-06' } })).body;
  await call(`/r/tasks/${once.id}`, { method: 'PATCH', json: { done: 1 } });
  await call(`/r/tasks/${once.id}`, { method: 'PATCH', json: { done: 0 } });
  assert.equal((await call('/r/expenses')).body.filter((e: { note: string }) => e.note === 'Undo once').length, 0);
});
