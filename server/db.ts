import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

export const DATA_DIR = resolve(process.env.DATA_DIR ?? join(process.cwd(), 'data'));
export const FILES_DIR = join(DATA_DIR, 'files');
mkdirSync(FILES_DIR, { recursive: true });

export const db = new DatabaseSync(join(DATA_DIR, 'life.db'));

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY, title TEXT NOT NULL, notes TEXT, due TEXT,
    priority INTEGER NOT NULL DEFAULT 0, done INTEGER NOT NULL DEFAULT 0, done_at TEXT,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS notes (
    id TEXT PRIMARY KEY, title TEXT, body TEXT, pinned INTEGER NOT NULL DEFAULT 0, color TEXT,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS expenses (
    id TEXT PRIMARY KEY, amount REAL NOT NULL, kind TEXT NOT NULL DEFAULT 'expense',
    category TEXT NOT NULL, note TEXT, date TEXT NOT NULL,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS budgets (
    id TEXT PRIMARY KEY, category TEXT NOT NULL UNIQUE, amount REAL NOT NULL,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS subscriptions (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, amount REAL NOT NULL, cycle TEXT NOT NULL DEFAULT 'monthly',
    next_date TEXT NOT NULL, category TEXT NOT NULL DEFAULT 'Bills',
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS habits (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, emoji TEXT, color TEXT, archived INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS habit_logs (
    habit_id TEXT NOT NULL REFERENCES habits(id) ON DELETE CASCADE, date TEXT NOT NULL,
    PRIMARY KEY (habit_id, date)
  );
  CREATE TABLE IF NOT EXISTS health (
    id TEXT PRIMARY KEY, date TEXT NOT NULL, kind TEXT NOT NULL, value REAL NOT NULL,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE (date, kind)
  );
  CREATE TABLE IF NOT EXISTS journal (
    id TEXT PRIMARY KEY, date TEXT NOT NULL UNIQUE, body TEXT, mood INTEGER,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS drops (
    id TEXT PRIMARY KEY, kind TEXT NOT NULL, text TEXT, filename TEXT, mime TEXT, size INTEGER,
    device TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
`);

type Resource = { cols: string[]; order: string; dateCol?: string };

/** Tables exposed through the generic CRUD API, with the columns clients may write. */
export const RESOURCES: Record<string, Resource> = {
  tasks: { cols: ['title', 'notes', 'due', 'priority', 'done', 'done_at'], order: 'done ASC, due IS NULL, due ASC, created_at DESC' },
  notes: { cols: ['title', 'body', 'pinned', 'color'], order: 'pinned DESC, updated_at DESC' },
  expenses: { cols: ['amount', 'kind', 'category', 'note', 'date'], order: 'date DESC, created_at DESC', dateCol: 'date' },
  budgets: { cols: ['category', 'amount'], order: 'category ASC' },
  subscriptions: { cols: ['name', 'amount', 'cycle', 'next_date', 'category'], order: 'next_date ASC' },
  habits: { cols: ['name', 'emoji', 'color', 'archived'], order: 'created_at ASC' },
  health: { cols: ['date', 'kind', 'value'], order: 'date DESC', dateCol: 'date' },
  journal: { cols: ['date', 'body', 'mood'], order: 'date DESC', dateCol: 'date' },
};

/** node:sqlite only binds string/number/bigint/null/bytes, so coerce booleans and drop unknown keys. */
export function pickColumns(res: Resource, body: Record<string, unknown>) {
  const out: Record<string, string | number | null> = {};
  for (const col of res.cols) {
    if (!(col in body)) continue;
    const v = body[col];
    out[col] = typeof v === 'boolean' ? Number(v) : v === undefined ? null : (v as string | number | null);
  }
  return out;
}
