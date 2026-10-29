// Two-way Google Calendar: routines become recurring events in the user's primary calendar, and
// their calendar events are readable in the app.
//
// Plain fetch against Google's OAuth + Calendar REST APIs rather than the googleapis SDK — we use
// five endpoints, and the SDK is a very large dependency (dsgn pillar #7).
// Credentials and tokens live in data/google.json (0600), never in the client-readable settings.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { db, DATA_DIR } from './db.ts';

const FILE = join(DATA_DIR, 'google.json');
const SCOPES = ['https://www.googleapis.com/auth/calendar.events', 'openid', 'email'];
const API = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';

type Store = { clientId?: string; clientSecret?: string; redirectUri?: string; refreshToken?: string; accessToken?: string; expiry?: number; email?: string };
const load = (): Store => (existsSync(FILE) ? JSON.parse(readFileSync(FILE, 'utf8')) : {});
const store = (s: Store) => writeFileSync(FILE, JSON.stringify(s, null, 2), { mode: 0o600 });
export const TIMEZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;

export function status() {
  const s = load();
  return { configured: !!(s.clientId && s.clientSecret), connected: !!s.refreshToken, email: s.email ?? null, timezone: TIMEZONE };
}

export function configure(clientId: string, clientSecret: string) {
  store({ ...load(), clientId: clientId.trim(), clientSecret: clientSecret.trim() });
}

export function authUrl(redirectUri: string) {
  const s = load();
  if (!s.clientId) throw new Error('Add your OAuth client ID first');
  store({ ...s, redirectUri });
  const q = new URLSearchParams({
    client_id: s.clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPES.join(' '),
    // offline + consent ⇒ Google returns a refresh token, so the laptop can sync without you.
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
}

async function tokenRequest(body: Record<string, string>) {
  const res = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(body), signal: AbortSignal.timeout(15_000) });
  const j = await res.json();
  if (!res.ok) throw new Error(j.error_description || j.error || `token ${res.status}`);
  return j as { access_token: string; expires_in: number; refresh_token?: string; id_token?: string };
}

export async function finishAuth(code: string) {
  const s = load();
  const t = await tokenRequest({ code, client_id: s.clientId!, client_secret: s.clientSecret!, redirect_uri: s.redirectUri!, grant_type: 'authorization_code' });
  let email: string | undefined;
  if (t.id_token) {
    try {
      email = JSON.parse(Buffer.from(t.id_token.split('.')[1], 'base64url').toString()).email;
    } catch {}
  }
  store({ ...s, accessToken: t.access_token, expiry: Date.now() + (t.expires_in - 60) * 1000, refreshToken: t.refresh_token ?? s.refreshToken, email });
}

export async function disconnect() {
  const s = load();
  if (s.refreshToken) await fetch(`https://oauth2.googleapis.com/revoke?token=${s.refreshToken}`, { method: 'POST' }).catch(() => {});
  store({ clientId: s.clientId, clientSecret: s.clientSecret });
  db.prepare('UPDATE routines SET gcal_event_id = NULL').run();
}

async function accessToken() {
  const s = load();
  if (!s.refreshToken) throw new Error('Google Calendar is not connected');
  if (s.accessToken && s.expiry && s.expiry > Date.now()) return s.accessToken;
  const t = await tokenRequest({ refresh_token: s.refreshToken, client_id: s.clientId!, client_secret: s.clientSecret!, grant_type: 'refresh_token' });
  store({ ...s, accessToken: t.access_token, expiry: Date.now() + (t.expires_in - 60) * 1000 });
  return t.access_token;
}

async function gfetch(url: string, init: RequestInit = {}) {
  const res = await fetch(url, { ...init, headers: { authorization: `Bearer ${await accessToken()}`, 'content-type': 'application/json', ...init.headers }, signal: AbortSignal.timeout(15_000) });
  if (res.status === 204) return null;
  const j = await res.json().catch(() => null);
  if (!res.ok) throw Object.assign(new Error(j?.error?.message ?? `Google ${res.status}`), { status: res.status });
  return j;
}

// ---------------------------------------------------------------------------------------------
// Reading events
// ---------------------------------------------------------------------------------------------
export type GEvent = { id: string; title: string; start: string; end: string; allDay: boolean; link: string; fromRoutine: string | null; location?: string };
const cache = new Map<string, { at: number; v: GEvent[] }>();

export async function events(from: string, to: string): Promise<GEvent[]> {
  if (!load().refreshToken) return [];
  const key = `${from}|${to}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 120_000) return hit.v;
  const q = new URLSearchParams({ timeMin: new Date(`${from}T00:00:00`).toISOString(), timeMax: new Date(`${to}T23:59:59`).toISOString(), singleEvents: 'true', orderBy: 'startTime', maxResults: '250' });
  const j = await gfetch(`${API}?${q}`);
  const v: GEvent[] = (j?.items ?? [])
    .filter((e: { status?: string }) => e.status !== 'cancelled')
    .map((e: { id: string; summary?: string; start: { dateTime?: string; date?: string }; end: { dateTime?: string; date?: string }; htmlLink: string; location?: string; extendedProperties?: { private?: Record<string, string> } }) => ({
      id: e.id,
      title: e.summary ?? '(no title)',
      start: e.start.dateTime ?? e.start.date!,
      end: e.end.dateTime ?? e.end.date!,
      allDay: !e.start.dateTime,
      link: e.htmlLink,
      location: e.location,
      fromRoutine: e.extendedProperties?.private?.devtoolsRoutine ?? null,
    }));
  cache.set(key, { at: Date.now(), v });
  return v;
}

// ---------------------------------------------------------------------------------------------
// Routines → recurring events
// ---------------------------------------------------------------------------------------------
type RoutineRow = { id: string; name: string; emoji: string | null; days: string; time: string; duration_min: number; steps: string | null; active: number; gcal_event_id: string | null };
const BYDAY = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
const pad = (n: number) => String(n).padStart(2, '0');

function eventBody(r: RoutineRow) {
  const days: number[] = JSON.parse(r.days);
  // First occurrence: the next date (from today) that falls on one of the routine's weekdays.
  const d = new Date();
  for (let i = 0; i < 7 && !days.includes(d.getDay()); i++) d.setDate(d.getDate() + 1);
  const [h, m] = r.time.split(':').map(Number);
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m);
  const end = new Date(start.getTime() + r.duration_min * 60_000);
  const local = (x: Date) => `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}T${pad(x.getHours())}:${pad(x.getMinutes())}:00`;
  const steps: string[] = r.steps ? JSON.parse(r.steps) : [];
  return {
    summary: `${r.emoji ? `${r.emoji} ` : ''}${r.name}`,
    description: ['Routine from Dev Tools 2.0', ...steps.map((s) => `• ${s}`)].join('\n'),
    start: { dateTime: local(start), timeZone: TIMEZONE },
    end: { dateTime: local(end), timeZone: TIMEZONE },
    recurrence: [`RRULE:FREQ=WEEKLY;BYDAY=${days.map((x) => BYDAY[x]).join(',')}`],
    extendedProperties: { private: { devtoolsRoutine: r.id } },
    reminders: { useDefault: false, overrides: [] }, // the app pushes its own reminder
  };
}

/** Create/update/delete the calendar event for a routine. Errors are logged, never thrown at the user's save. */
export async function syncRoutine(id: string, deletedEventId?: string | null) {
  if (!load().refreshToken) return;
  try {
    if (deletedEventId !== undefined) {
      if (deletedEventId) await gfetch(`${API}/${deletedEventId}`, { method: 'DELETE' }).catch((e) => (e.status === 404 || e.status === 410 ? null : Promise.reject(e)));
      return;
    }
    const r = db.prepare('SELECT * FROM routines WHERE id = ?').get(id) as RoutineRow | undefined;
    if (!r) return;
    if (!r.active || JSON.parse(r.days).length === 0) {
      if (r.gcal_event_id) await gfetch(`${API}/${r.gcal_event_id}`, { method: 'DELETE' }).catch(() => {});
      db.prepare('UPDATE routines SET gcal_event_id = NULL WHERE id = ?').run(id);
      return;
    }
    const body = JSON.stringify(eventBody(r));
    let ev = null;
    if (r.gcal_event_id) ev = await gfetch(`${API}/${r.gcal_event_id}`, { method: 'PUT', body }).catch((e) => (e.status === 404 || e.status === 410 ? null : Promise.reject(e)));
    ev ??= await gfetch(API, { method: 'POST', body });
    db.prepare('UPDATE routines SET gcal_event_id = ? WHERE id = ?').run(ev.id, id);
    cache.clear();
  } catch (e) {
    console.error('google sync failed for routine', id, (e as Error).message);
  }
}

/** Push every routine to the calendar (after first connecting). */
export async function syncAll() {
  const ids = (db.prepare('SELECT id FROM routines').all() as { id: string }[]).map((r) => r.id);
  for (const id of ids) await syncRoutine(id);
  return ids.length;
}
