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

  -- Gym: one workout per session, sets denormalise the date so history queries stay single-table.
  CREATE TABLE IF NOT EXISTS workouts (
    id TEXT PRIMARY KEY, date TEXT NOT NULL, day_type TEXT NOT NULL, notes TEXT,
    started_at TEXT, finished_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sets (
    id TEXT PRIMARY KEY, workout_id TEXT NOT NULL REFERENCES workouts(id) ON DELETE CASCADE,
    date TEXT NOT NULL, exercise TEXT NOT NULL, set_no INTEGER NOT NULL, weight REAL NOT NULL, reps INTEGER NOT NULL,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS sets_exercise ON sets (exercise, date);

  -- Fuel: macros are snapshotted onto the log row, so editing a food later never rewrites past days.
  CREATE TABLE IF NOT EXISTS food_logs (
    id TEXT PRIMARY KEY, date TEXT NOT NULL, meal TEXT NOT NULL, food_id TEXT, name TEXT NOT NULL,
    qty REAL NOT NULL, unit TEXT, kcal REAL NOT NULL, protein REAL NOT NULL, carbs REAL NOT NULL, fat REAL NOT NULL,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS custom_foods (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, serving TEXT NOT NULL, kcal REAL NOT NULL,
    protein REAL NOT NULL, carbs REAL NOT NULL, fat REAL NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );

  -- DSA: one row per problem from the season plan (keyed by its plan id, not a uuid).
  CREATE TABLE IF NOT EXISTS dsa_progress (
    problem TEXT PRIMARY KEY, status TEXT NOT NULL DEFAULT 'todo', confidence INTEGER, minutes INTEGER,
    notes TEXT, sol_cpp TEXT, sol_java TEXT, sol_py TEXT, solved_at TEXT, revisit_at TEXT, updated_at TEXT NOT NULL
  );
  -- Sport: badminton / runs / walks / anything. route = GPS track [[lat, lng, tMs], …] when tracked live.
  CREATE TABLE IF NOT EXISTS activities (
    id TEXT PRIMARY KEY, date TEXT NOT NULL, type TEXT NOT NULL, started_at TEXT, duration_min REAL NOT NULL,
    distance_km REAL, kcal REAL, rpe INTEGER, notes TEXT, details TEXT, route TEXT,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );
  -- Routines: a recurring time block (days + time) with optional steps, linked habit and Google event.
  CREATE TABLE IF NOT EXISTS routines (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, emoji TEXT, days TEXT NOT NULL, time TEXT NOT NULL, duration_min INTEGER NOT NULL DEFAULT 30,
    steps TEXT, habit_id TEXT, remind INTEGER NOT NULL DEFAULT 1, gcal_event_id TEXT, active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS routine_logs (routine_id TEXT NOT NULL, date TEXT NOT NULL, steps TEXT, PRIMARY KEY (routine_id, date));
  -- Saved meals: a named bundle of foods logged in one tap.
  CREATE TABLE IF NOT EXISTS saved_meals (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, meal TEXT, items TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );
  -- Shopping list: built from the cook plan (source 'plan') or added by hand.
  CREATE TABLE IF NOT EXISTS shopping (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, qty TEXT, done INTEGER NOT NULL DEFAULT 0, source TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );
  -- Keep in touch: contact rhythm + birthdays. Also the people expenses are split with.
  CREATE TABLE IF NOT EXISTS people (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, emoji TEXT, phone TEXT, birthday TEXT, every_days INTEGER, weekday INTEGER, call_at TEXT,
    last_contact TEXT, notes TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );
  -- Daily check-offs keyed by kind (e.g. 'supp') and ref (the supplement id).
  CREATE TABLE IF NOT EXISTS checks (kind TEXT NOT NULL, ref TEXT NOT NULL, date TEXT NOT NULL, PRIMARY KEY (kind, ref, date));
  -- Shared bills: amount > 0 means the person owes me, < 0 means I owe them.
  CREATE TABLE IF NOT EXISTS splits (
    id TEXT PRIMARY KEY, expense_id TEXT, person_id TEXT NOT NULL, amount REAL NOT NULL, note TEXT, date TEXT NOT NULL, settled_at TEXT,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );
  -- Phone/address-book contacts (imported from vCard or the contact picker) — a directory to pick
  -- bill-split people and Pit crew from.
  CREATE TABLE IF NOT EXISTS contacts (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, phone TEXT, birthday TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS dsa_tests (
    id TEXT PRIMARY KEY, kind TEXT NOT NULL, ref TEXT NOT NULL, started_at TEXT NOT NULL, finished_at TEXT,
    duration_min INTEGER NOT NULL, results TEXT, score REAL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );
`);

/** Add a column to an existing table if an older database doesn't have it yet. */
function addColumn(table: string, col: string, type: string) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!cols.some((c) => c.name === col)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${type}`);
}
// Micronutrient snapshot (JSON) for rows whose food isn't in the catalogue — AI photo estimates, custom foods.
addColumn('food_logs', 'micros', 'TEXT');
// Repeating tasks roll their due date forward when ticked; remind_before = minutes of early warning.
addColumn('tasks', 'repeat', 'TEXT');
addColumn('tasks', 'remind_before', 'INTEGER');
// What was on a shared bill (JSON item names) — flavours the "pay me" message.
addColumn('splits', 'items', 'TEXT');
// Guided journal: the night's questions and answers (JSON [{q, a}]); body holds the written story.
addColumn('journal', 'answers', 'TEXT');
// Pinned drops stay at the top and survive "clear old".
addColumn('drops', 'pinned', 'INTEGER NOT NULL DEFAULT 0');

type Resource = { cols: string[]; order: string; dateCol?: string };

/** Tables exposed through the generic CRUD API, with the columns clients may write. */
export const RESOURCES: Record<string, Resource> = {
  tasks: { cols: ['title', 'notes', 'due', 'priority', 'done', 'done_at', 'repeat', 'remind_before'], order: 'done ASC, due IS NULL, due ASC, created_at DESC' },
  notes: { cols: ['title', 'body', 'pinned', 'color'], order: 'pinned DESC, updated_at DESC' },
  expenses: { cols: ['amount', 'kind', 'category', 'note', 'date'], order: 'date DESC, created_at DESC', dateCol: 'date' },
  budgets: { cols: ['category', 'amount'], order: 'category ASC' },
  subscriptions: { cols: ['name', 'amount', 'cycle', 'next_date', 'category'], order: 'next_date ASC' },
  habits: { cols: ['name', 'emoji', 'color', 'archived'], order: 'created_at ASC' },
  health: { cols: ['date', 'kind', 'value'], order: 'date DESC', dateCol: 'date' },
  journal: { cols: ['date', 'body', 'mood', 'answers'], order: 'date DESC', dateCol: 'date' },
  workouts: { cols: ['date', 'day_type', 'notes', 'started_at', 'finished_at'], order: 'date DESC, created_at DESC', dateCol: 'date' },
  sets: { cols: ['workout_id', 'date', 'exercise', 'set_no', 'weight', 'reps'], order: 'date ASC, set_no ASC', dateCol: 'date' },
  food_logs: { cols: ['date', 'meal', 'food_id', 'name', 'qty', 'unit', 'kcal', 'protein', 'carbs', 'fat', 'micros'], order: 'date DESC, created_at ASC', dateCol: 'date' },
  custom_foods: { cols: ['name', 'serving', 'kcal', 'protein', 'carbs', 'fat'], order: 'name ASC' },
  activities: { cols: ['date', 'type', 'started_at', 'duration_min', 'distance_km', 'kcal', 'rpe', 'notes', 'details', 'route'], order: 'date DESC, started_at DESC', dateCol: 'date' },
  routines: { cols: ['name', 'emoji', 'days', 'time', 'duration_min', 'steps', 'habit_id', 'remind', 'gcal_event_id', 'active'], order: 'time ASC' },
  saved_meals: { cols: ['name', 'meal', 'items'], order: 'name ASC' },
  people: { cols: ['name', 'emoji', 'phone', 'birthday', 'every_days', 'weekday', 'call_at', 'last_contact', 'notes'], order: 'name ASC' },
  splits: { cols: ['expense_id', 'person_id', 'amount', 'note', 'date', 'settled_at', 'items'], order: 'date DESC, created_at DESC', dateCol: 'date' },
  contacts: { cols: ['name', 'phone', 'birthday'], order: 'name COLLATE NOCASE ASC' },
  shopping: { cols: ['name', 'qty', 'done', 'source'], order: 'done ASC, name ASC' },
  dsa_tests: { cols: ['kind', 'ref', 'started_at', 'finished_at', 'duration_min', 'results', 'score'], order: 'started_at DESC' },
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
