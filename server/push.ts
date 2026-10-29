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
  const tasks = db.prepare("SELECT id, title, notes, due FROM tasks WHERE done = 0 AND due LIKE '%T%'").all() as { id: string; title: string; notes: string | null; due: string }[];
  for (const t of tasks) {
    const at = new Date(t.due).getTime(); // no offset ⇒ parsed as laptop-local time
    if (Number.isNaN(at) || at > now || now - at > STALE_MS) continue;
    const claimed = db.prepare('INSERT OR IGNORE INTO push_sent (task_id, due, sent_at) VALUES (?, ?, ?)').run(t.id, t.due, new Date().toISOString());
    if (claimed.changes === 0) continue;
    const r = await pushAll({
      tag: t.id,
      title: `⏰ ${t.title}`,
      body: t.notes?.startsWith('http') ? 'Starting now — tap to open' : t.notes || 'Due now',
      url: t.notes?.startsWith('http') ? t.notes : '/tasks',
      taskId: t.id,
    });
    // Every device failed (laptop offline, push service hiccup): release the claim so the next
    // tick retries, until the reminder goes stale.
    if (r.devices > 0 && r.sent === 0) db.prepare('DELETE FROM push_sent WHERE task_id = ? AND due = ?').run(t.id, t.due);
  }
}

/** Called by the app scheduler (scheduler.ts) every tick. */
export const remindersTick = tick;

/** Notification button actions, handled without opening the app. */
export function taskAction(taskId: string, action: 'done' | 'snooze') {
  if (action === 'done') db.prepare('UPDATE tasks SET done = 1, done_at = ?, updated_at = ? WHERE id = ?').run(new Date().toISOString(), new Date().toISOString(), taskId);
  else db.prepare('UPDATE tasks SET due = ?, updated_at = ? WHERE id = ?').run(localStamp(new Date(Date.now() + 10 * 60_000)), new Date().toISOString(), taskId);
}

