// Web Push reminders for timed tasks.
//
// One scheduler loop (dsgn pillar #2) owns all reminder sending: every 20 s it looks for tasks
// whose due *time* has passed and pushes each one once per due value. Keying the "sent" record
// on (task, due) means editing or snoozing a task re-arms it, without mutating the task itself.
//
// VAPID keys live in a file in DATA_DIR, not in the settings table — /api/settings is readable
// by every client and the private key must never leave the laptop.
import webpush, { WebPushError, type PushSubscription } from 'web-push';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { db, DATA_DIR } from './db.ts';
import { isRepeat, nextDue, remindAt } from '../web/src/core/tasks.ts';

db.exec(`
  CREATE TABLE IF NOT EXISTS push_subs (
    endpoint TEXT PRIMARY KEY, keys TEXT NOT NULL, device TEXT, created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS push_sent (task_id TEXT NOT NULL, due TEXT NOT NULL, sent_at TEXT NOT NULL, PRIMARY KEY (task_id, due));
`);

const keyFile = join(DATA_DIR, 'vapid.json');
const vapid: { publicKey: string; privateKey: string } = existsSync(keyFile)
  ? JSON.parse(readFileSync(keyFile, 'utf8'))
  : (() => {
      const k = webpush.generateVAPIDKeys();
      writeFileSync(keyFile, JSON.stringify(k), { mode: 0o600 });
      return k;
    })();
// The subject identifies the sender to the push service (Apple requires a URL or mailto).
webpush.setVapidDetails('https://github.com/Dhruvch1244/Dev-Tools-2.0', vapid.publicKey, vapid.privateKey);

export const publicKey = vapid.publicKey;

type Row = { endpoint: string; keys: string; device: string | null };

export function subscribe(sub: PushSubscription, device: string) {
  db.prepare('INSERT INTO push_subs (endpoint, keys, device, created_at) VALUES (?, ?, ?, ?) ON CONFLICT (endpoint) DO UPDATE SET keys = excluded.keys, device = excluded.device').run(
    sub.endpoint,
    JSON.stringify(sub.keys),
    device,
    new Date().toISOString(),
  );
}
export const unsubscribe = (endpoint: string) => db.prepare('DELETE FROM push_subs WHERE endpoint = ?').run(endpoint);
export const subscriptions = () => (db.prepare('SELECT endpoint, device, created_at FROM push_subs').all() as { endpoint: string; device: string; created_at: string }[]).map((s) => ({ ...s, endpoint: s.endpoint.slice(0, 48) + '…' }));

/** Send to every subscribed device; drop subscriptions the push service says are gone. */
export async function pushAll(payload: Record<string, unknown>) {
  const subs = db.prepare('SELECT endpoint, keys, device FROM push_subs').all() as Row[];
  let sent = 0;
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: JSON.parse(s.keys) }, JSON.stringify(payload), { TTL: 6 * 3600, urgency: 'high' });
        sent++;
      } catch (e) {
        if (e instanceof WebPushError && (e.statusCode === 404 || e.statusCode === 410)) unsubscribe(s.endpoint);
        else console.error('push failed', s.device, (e as Error).message);
      }
    }),
  );
  return { devices: subs.length, sent };
}

/** "YYYY-MM-DDTHH:mm" in the laptop's local time — the same clock the devices on the tailnet use. */
export const localStamp = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

// Reminders older than this are skipped rather than sent late (e.g. laptop was asleep overnight).
const STALE_MS = 6 * 3600_000;

async function tick() {
  const now = Date.now();
  const tasks = db.prepare("SELECT id, title, notes, due, remind_before, updated_at, kind, amount, place FROM tasks WHERE done = 0 AND due LIKE '%T%'").all() as { id: string; title: string; notes: string | null; due: string; remind_before: number | null; updated_at: string; kind: string | null; amount: number | null; place: string | null }[];
  for (const t of tasks) {
    // An early warning (remind_before) and the at-time ping are separate sends, keyed apart. The
    // early one is skipped if the task was edited/snoozed after its time — you've just seen it.
    const early = remindAt(t.due, t.remind_before);
    const lead = early != null && early >= Date.parse(t.updated_at) ? (t.remind_before ?? 0) : 0;
    for (const [at, key, body] of [
      ...(lead > 0 ? [[remindAt(t.due, lead), `${t.due}@-${lead}`, `In ${lead >= 1440 ? `${lead / 1440} day` : lead >= 60 ? `${lead / 60} h` : `${lead} min`} · ${t.due.slice(11, 16)}`] as const] : []),
      [remindAt(t.due, 0), t.due, t.notes?.startsWith('http') ? 'Starting now — tap to open' : t.notes || 'Due now'] as const,
    ]) {
      if (at == null || at > now || now - at > STALE_MS) continue;
      const claimed = db.prepare('INSERT OR IGNORE INTO push_sent (task_id, due, sent_at) VALUES (?, ?, ?)').run(t.id, key, new Date().toISOString());
      if (claimed.changes === 0) continue;
      // Bills say what they cost; plans say where. Same buttons (Done / Snooze) either way.
      const icon = t.kind === 'bill' ? '🧾' : t.kind === 'plan' ? '📍' : '⏰';
      const extra = t.kind === 'bill' && t.amount ? `₹${Math.round(t.amount).toLocaleString('en-IN')} · ` : t.kind === 'plan' && t.place ? `${t.place} · ` : '';
      const r = await pushAll({ tag: t.id, title: `${icon} ${t.title}`, body: extra + body, url: t.notes?.startsWith('http') ? t.notes : t.kind ? '/' : '/tasks', taskId: t.id });
      // Every device failed (laptop offline, push service hiccup): release the claim so the next
      // tick retries, until the reminder goes stale.
      if (r.devices > 0 && r.sent === 0) db.prepare('DELETE FROM push_sent WHERE task_id = ? AND due = ?').run(t.id, key);
    }
  }
}

/**
 * Plans get two extra heads-ups on top of the task pings: the evening before (20:00) and the
 * morning of (08:30) — "Tomorrow: Hauz Khas with Riya · 19:00". All-day plans get just those.
 */
async function planTick() {
  const now = Date.now();
  const plans = db.prepare("SELECT id, title, due, place FROM tasks WHERE done = 0 AND kind = 'plan' AND due IS NOT NULL AND substr(due,1,10) >= date('now','localtime','-1 day')").all() as { id: string; title: string; due: string; place: string | null }[];
  for (const p of plans) {
    const day = p.due.slice(0, 10);
    const at = p.due.length > 10 ? p.due.slice(11, 16) : null;
    const eve = new Date(`${day}T20:00`);
    eve.setDate(eve.getDate() - 1);
    const pings: [number, string, string][] = [[eve.getTime(), 'eve', `Tomorrow${at ? ` · ${at}` : ''}${p.place ? ` · ${p.place}` : ''}`]];
    // A morning reminder only helps when the plan is later in the day (or has no time).
    if (!at || at >= '11:00') pings.push([Date.parse(`${day}T08:30`), 'morn', `Today${at ? ` · ${at}` : ''}${p.place ? ` · ${p.place}` : ''}`]);
    for (const [when, k, body] of pings) {
      if (when > now || now - when > STALE_MS) continue;
      const key = `${p.due}@${k}`;
      if (db.prepare('INSERT OR IGNORE INTO push_sent (task_id, due, sent_at) VALUES (?, ?, ?)').run(p.id, key, new Date().toISOString()).changes === 0) continue;
      const r = await pushAll({ tag: `plan-${p.id}`, title: `📍 ${p.title}`, body, url: '/' });
      if (r.devices > 0 && r.sent === 0) db.prepare('DELETE FROM push_sent WHERE task_id = ? AND due = ?').run(p.id, key);
    }
  }
}

/** Called by the app scheduler (scheduler.ts) every tick. */
export const remindersTick = async () => (await tick(), await planTick());

/** Tick off a task; a repeating one rolls to its next due date instead of closing. True if it rolled. */
export function completeTask(taskId: string) {
  const t = db.prepare('SELECT title, due, repeat, kind, amount FROM tasks WHERE id = ?').get(taskId) as { title: string; due: string | null; repeat: string | null; kind: string | null; amount: number | null } | undefined;
  const stamp = new Date().toISOString();
  // Paying a bill is spending: it lands in Money under Bills, so the month's total stays honest.
  if (t?.kind === 'bill' && t.amount && t.amount > 0)
    db.prepare("INSERT INTO expenses (id, amount, kind, category, note, date, created_at, updated_at) VALUES (?, ?, 'expense', 'Bills', ?, ?, ?, ?)").run(crypto.randomUUID(), t.amount, t.title, localStamp(new Date()).slice(0, 10), stamp, stamp);
  if (t?.due && isRepeat(t.repeat)) {
    db.prepare('UPDATE tasks SET due = ?, done = 0, done_at = NULL, updated_at = ? WHERE id = ?').run(nextDue(t.due, t.repeat, localStamp(new Date()).slice(0, 10)), stamp, taskId);
    return true;
  }
  db.prepare('UPDATE tasks SET done = 1, done_at = ?, updated_at = ? WHERE id = ?').run(stamp, stamp, taskId);
  return false;
}

/** Notification button actions, handled without opening the app. */
export function taskAction(taskId: string, action: 'done' | 'snooze') {
  if (action === 'done') completeTask(taskId);
  else db.prepare('UPDATE tasks SET due = ?, updated_at = ? WHERE id = ?').run(localStamp(new Date(Date.now() + 10 * 60_000)), new Date().toISOString(), taskId);
}
