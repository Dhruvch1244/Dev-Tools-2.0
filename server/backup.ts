// Nightly snapshot of the database (plus the small key files), keeping the last 14 days.
// Uses SQLite's online backup API, so it's consistent while the app keeps writing.
// Dropped files (data/files) are not included — they can be large; copy data/ for a full backup.
import { backup } from 'node:sqlite';
import { copyFile, mkdir, readdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { db, DATA_DIR } from './db.ts';

export const BACKUP_DIR = join(DATA_DIR, 'backups');
const KEEP = 14;

export async function runBackup() {
  const stamp = new Date().toISOString().slice(0, 10);
  const dir = join(BACKUP_DIR, stamp);
  await mkdir(dir, { recursive: true });
  await backup(db, join(dir, 'life.db'));
  for (const f of ['vapid.json', 'google.json']) if (existsSync(join(DATA_DIR, f))) await copyFile(join(DATA_DIR, f), join(dir, f));
  const all = (await readdir(BACKUP_DIR)).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
  for (const old of all.slice(0, Math.max(0, all.length - KEEP))) await rm(join(BACKUP_DIR, old), { recursive: true, force: true });
  return { dir, kept: Math.min(all.length, KEEP) };
}

export async function listBackups() {
  if (!existsSync(BACKUP_DIR)) return [];
  return (await readdir(BACKUP_DIR)).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort().reverse();
}

export const hasBackupFor = (day: string) => existsSync(join(BACKUP_DIR, day, 'life.db'));
