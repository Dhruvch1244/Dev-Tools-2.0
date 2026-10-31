// Scan history: every AI read of a photo (a gym machine, a plate of food, a bill) is kept with a
// small thumbnail, so an old answer can be opened again — or re-logged — without asking the AI twice.
import { Hono } from 'hono';
import { db } from './db.ts';

db.exec(`CREATE TABLE IF NOT EXISTS scans (
  id TEXT PRIMARY KEY, kind TEXT NOT NULL, title TEXT NOT NULL, input TEXT, result TEXT NOT NULL, thumb TEXT, created_at TEXT NOT NULL
)`);

export const SCAN_KINDS = ['machine', 'food', 'receipt'] as const;
export type ScanKind = (typeof SCAN_KINDS)[number];
/** Oldest scans beyond this many per kind are dropped. */
const KEEP = 200;

/** A thumbnail only: a JPEG data URL, small. Anything else is dropped rather than stored. */
const okThumb = (t: unknown) => (typeof t === 'string' && /^data:image\/jpeg;base64,/.test(t) && t.length < 120_000 ? t : null);

export function saveScan(kind: ScanKind, title: string, input: string | undefined, result: unknown, thumb: unknown) {
  const id = crypto.randomUUID();
  db.prepare('INSERT INTO scans (id, kind, title, input, result, thumb, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(id, kind, title.slice(0, 120) || 'Scan', input?.trim().slice(0, 300) || null, JSON.stringify(result), okThumb(thumb), new Date().toISOString());
  db.prepare('DELETE FROM scans WHERE kind = ? AND id NOT IN (SELECT id FROM scans WHERE kind = ? ORDER BY created_at DESC LIMIT ?)').run(kind, kind, KEEP);
  return id;
}

export function scanRoutes(emit: (r: string) => void) {
  const r = new Hono();
  r.get('/', (c) => {
    const kind = c.req.query('kind');
    const limit = Math.min(200, Number(c.req.query('limit')) || 50);
    const rows = (kind ? db.prepare('SELECT * FROM scans WHERE kind = ? ORDER BY created_at DESC LIMIT ?').all(kind, limit) : db.prepare('SELECT * FROM scans ORDER BY created_at DESC LIMIT ?').all(limit)) as { result: string }[];
    return c.json(rows.map((x) => ({ ...x, result: JSON.parse(x.result) })));
  });
  r.delete('/:id', (c) => {
    db.prepare('DELETE FROM scans WHERE id = ?').run(c.req.param('id'));
    emit('scans');
    return c.json({ ok: true });
  });
  return r;
}
