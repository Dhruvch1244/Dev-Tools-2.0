// Keep in touch: people with a contact rhythm ("call Mom every Sunday", "Rahul every 2 weeks") and
// birthdays. Decides who is due today and what to push when. Pure: no React, no I/O.

import { haversine } from './sport';

export type Person = {
  id: string;
  name: string;
  emoji: string | null;
  phone: string | null;
  /** "MM-DD" or "YYYY-MM-DD" (year → age shown). */
  birthday: string | null;
  /** Contact every N days (0/null = no rhythm). With `weekday` set and N = 7 it means "every <weekday>". */
  every_days: number | null;
  weekday: number | null;
  call_at: string | null;
  last_contact: string | null;
  notes: string | null;
  /** Circle and sub-group: "Work" › "Google", "College" › "IIT Delhi". */
  circle?: string | null;
  org?: string | null;
  city?: string | null;
  lat?: number | null;
  lon?: number | null;
};

const DAY = 86_400_000;
const utc = (d: string) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);

/** Next date (≥ today) a contact is due, or null with no rhythm. */
export function nextContact(p: Person, today: string): string | null {
  const n = p.every_days ?? 0;
  if (n <= 0) return null;
  if (p.weekday != null && n % 7 === 0) {
    // "Every Sunday": the first such weekday a full cycle after the last call, so a call any day in
    // the week before covers that Sunday.
    for (let t = utc(today), i = 0; i < 400; i++, t += DAY)
      if (new Date(t).getUTCDay() === p.weekday && (!p.last_contact || (t - utc(p.last_contact)) / DAY >= n)) return iso(t);
    return null;
  }
  if (!p.last_contact) return today;
  const due = iso(utc(p.last_contact) + n * DAY);
  return due < today ? today : due;
}

/** Days overdue (0 = due today, negative = not yet). */
export function overdueDays(p: Person, today: string) {
  const n = p.every_days ?? 0;
  if (n <= 0 || !p.last_contact) return n > 0 ? 0 : -1;
  if (p.weekday != null && n % 7 === 0) return nextContact(p, today) === today ? 0 : -1;
  return Math.round((utc(today) - utc(p.last_contact)) / DAY) - n;
}

/** Next birthday date (≥ today) and the age turned, if the year is known. */
export function nextBirthday(p: Person, today: string): { date: string; inDays: number; age: number | null } | null {
  if (!p.birthday) return null;
  const md = p.birthday.slice(-5);
  const y = Number(today.slice(0, 4));
  // 29 Feb in a non-leap year → 28 Feb.
  const on = (yy: number) => {
    const t = utc(`${yy}-${md}`);
    return Number.isNaN(t) || iso(t).slice(5) !== md ? iso(utc(`${yy}-02-28`)) : iso(t);
  };
  let date = on(y);
  if (date < today) date = on(y + 1);
  const born = p.birthday.length === 10 ? Number(p.birthday.slice(0, 4)) : null;
  return { date, inDays: Math.round((utc(date) - utc(today)) / DAY), age: born ? Number(date.slice(0, 4)) - born : null };
}

export const rhythmLabel = (p: Person) => {
  const n = p.every_days ?? 0;
  if (!n) return 'No rhythm';
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  if (p.weekday != null && n % 7 === 0) return n === 7 ? `Every ${days[p.weekday]}` : `Every ${n / 7} weeks, ${days[p.weekday]}`;
  return n === 1 ? 'Daily' : n % 7 === 0 ? `Every ${n / 7 === 1 ? 'week' : `${n / 7} weeks`}` : `Every ${n} days`;
};

export type PeoplePing = { id: string; person: string; at: string; title: string; body: string; call: boolean };

/** Pushes for today: keep-in-touch at the person's call time, birthdays the evening before and that morning. */
export function peoplePings(people: Person[], today: string): PeoplePing[] {
  const out: PeoplePing[] = [];
  const tomorrow = iso(utc(today) + DAY);
  for (const p of people) {
    const who = `${p.emoji ?? '📞'} ${p.name}`;
    if (nextContact(p, today) === today) {
      const od = overdueDays(p, today);
      out.push({ id: `touch:${p.id}`, person: p.id, at: p.call_at ?? '19:00', title: `${who} — time to call`, body: od > 0 ? `${od} days overdue · ${rhythmLabel(p)}` : `${rhythmLabel(p)}${p.notes ? ` · ${p.notes}` : ''}`, call: true });
    }
    const b = nextBirthday(p, today);
    if (b?.date === today) out.push({ id: `bday:${p.id}`, person: p.id, at: '09:00', title: `🎂 ${p.name}'s birthday today${b.age ? ` — ${b.age}` : ''}`, body: 'Call or send a wish', call: true });
    if (b?.date === tomorrow) out.push({ id: `bday-eve:${p.id}`, person: p.id, at: '20:00', title: `🎁 ${p.name}'s birthday is tomorrow`, body: 'Gift or plan sorted?', call: false });
  }
  return out;
}

// ---- Circles: who's who, as a hierarchy (circle › org › people) ----

export const CIRCLES: Record<string, { emoji: string; color: string; org: string | null }> = {
  Family: { emoji: '👪', color: '#ff5fa2', org: 'Side (Mom’s, Dad’s…)' },
  Friends: { emoji: '🫶', color: '#ffd23f', org: 'Group' },
  College: { emoji: '🎓', color: '#4fb3ff', org: 'College' },
  School: { emoji: '🏫', color: '#7ee0a1', org: 'School' },
  Work: { emoji: '💼', color: '#c9a2ff', org: 'Company' },
  Gym: { emoji: '🏋️', color: '#e10600', org: 'Gym' },
  Neighbours: { emoji: '🏘️', color: '#ffb547', org: 'Area' },
  Other: { emoji: '✨', color: '#9aa0ad', org: null },
};
export const CIRCLE_ORDER = Object.keys(CIRCLES);

export type CircleNode<P> = { circle: string; count: number; due: number; orgs: { org: string | null; people: P[] }[] };

/** Group people into circles (in CIRCLE_ORDER) and orgs inside them; no circle → "Other". */
export function circleTree<P extends Person>(people: P[], today: string): CircleNode<P>[] {
  const by = new Map<string, Map<string, P[]>>();
  for (const p of people) {
    const c = p.circle && p.circle in CIRCLES ? p.circle : 'Other';
    const orgs = by.get(c) ?? new Map<string, P[]>();
    const o = p.org?.trim() ?? '';
    orgs.set(o, [...(orgs.get(o) ?? []), p]);
    by.set(c, orgs);
  }
  return CIRCLE_ORDER.filter((c) => by.has(c)).map((c) => {
    const orgs = [...by.get(c)!.entries()].sort(([a], [b]) => (a === '' ? -1 : b === '' ? 1 : a.localeCompare(b))).map(([org, ps]) => ({ org: org || null, people: ps }));
    const all = orgs.flatMap((o) => o.people);
    return { circle: c, count: all.length, due: all.filter((p) => nextContact(p, today) === today).length, orgs };
  });
}

/** People who live in the same city share one map pin. */
export function cityPins<P extends Person>(people: P[]) {
  const pins = new Map<string, { city: string; lat: number; lon: number; people: P[] }>();
  for (const p of people) {
    if (p.lat == null || p.lon == null) continue;
    const k = `${p.lat.toFixed(2)},${p.lon.toFixed(2)}`;
    const pin = pins.get(k) ?? { city: p.city ?? '', lat: p.lat, lon: p.lon, people: [] };
    pin.people.push(p);
    pins.set(k, pin);
  }
  return [...pins.values()].sort((a, b) => b.people.length - a.people.length);
}

/** WMO weather code → emoji and words (Open-Meteo). */
export function weatherOf(code: number, day = true): { emoji: string; text: string } {
  if (code === 0) return day ? { emoji: '☀️', text: 'Clear' } : { emoji: '🌙', text: 'Clear night' };
  if (code <= 2) return { emoji: day ? '🌤️' : '☁️', text: 'Partly cloudy' };
  if (code === 3) return { emoji: '☁️', text: 'Overcast' };
  if (code === 45 || code === 48) return { emoji: '🌫️', text: 'Fog' };
  if (code >= 51 && code <= 57) return { emoji: '🌦️', text: 'Drizzle' };
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return { emoji: '🌧️', text: 'Rain' };
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return { emoji: '❄️', text: 'Snow' };
  if (code >= 95) return { emoji: '⛈️', text: 'Thunderstorm' };
  return { emoji: '🌡️', text: '—' };
}

/** A conversation starter from their weather: "It's 41° in Jaipur — ask Mom if she's staying in." */
export function weatherNudge(name: string, city: string, w: { temp: number; code: number }) {
  if (w.code >= 95) return `Storm in ${city} — check ${name} is okay`;
  if ((w.code >= 61 && w.code <= 67) || (w.code >= 80 && w.code <= 82)) return `Raining in ${city} — good excuse to call ${name}`;
  if (w.temp >= 40) return `${Math.round(w.temp)}° in ${city} — ask ${name} to stay cool`;
  if (w.temp <= 8) return `${Math.round(w.temp)}° in ${city} — ${name} is freezing`;
  if (w.code === 45 || w.code === 48) return `Foggy in ${city} — ${name} should drive carefully`;
  return null;
}

/** Straight-line km between two points. */
export const kmBetween = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) => haversine([a.lat, a.lon, 0], [b.lat, b.lon, 0]) / 1000;
