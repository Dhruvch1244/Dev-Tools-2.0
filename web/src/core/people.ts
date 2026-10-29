// Keep in touch: people with a contact rhythm ("call Mom every Sunday", "Rahul every 2 weeks") and
// birthdays. Decides who is due today and what to push when. Pure: no React, no I/O.

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
