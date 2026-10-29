// The app's one scheduler (dsgn pillar #2). Every timed job registers here instead of owning a
// setInterval, so "what runs when" lives in one place and a slow job can't overlap itself.
//
// Jobs are either `every` (ms interval) or `at` ("HH:MM" laptop-local, once per day). Daily jobs
// remember the last day they ran in the settings table, so a restart doesn't re-fire a brief that
// already went out, and a laptop that was asleep at 08:00 still sends it once it wakes (until noon).
import { db } from './db.ts';

type Job = { name: string; run: () => Promise<unknown> } & ({ every: number } | { at: string; until?: string });

const jobs: Job[] = [];
const running = new Set<string>();
const lastEvery = new Map<string, number>();

export function schedule(job: Job) {
  jobs.push(job);
}

const localDay = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const hm = (d = new Date()) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
const getRan = (name: string) => (db.prepare('SELECT value FROM settings WHERE key = ?').get(`job:${name}`) as { value: string } | undefined)?.value;
const setRan = (name: string, day: string) => db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value').run(`job:${name}`, JSON.stringify(day));

async function exec(job: Job) {
  if (running.has(job.name)) return;
  running.add(job.name);
  try {
    await job.run();
  } catch (e) {
    console.error(`job ${job.name} failed`, e);
  } finally {
    running.delete(job.name);
  }
}

function tick() {
  const now = Date.now();
  const today = localDay();
  const t = hm();
  for (const job of jobs) {
    if ('every' in job) {
      if (now - (lastEvery.get(job.name) ?? 0) >= job.every) (lastEvery.set(job.name, now), void exec(job));
    } else if (t >= job.at && t < (job.until ?? '23:59') && JSON.parse(getRan(job.name) ?? '""') !== today) {
      setRan(job.name, today);
      void exec(job);
    }
  }
}

/** Claim a once-per-day slot for jobs whose time comes from settings; false if already done today. */
export function claimToday(name: string) {
  const today = localDay();
  if (JSON.parse(getRan(name) ?? '""') === today) return false;
  setRan(name, today);
  return true;
}
export const nowHM = hm;

let started = false;
export function startScheduler() {
  if (started) return;
  started = true;
  tick();
  setInterval(tick, 20_000);
}
