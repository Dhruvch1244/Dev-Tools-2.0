// Things the AI may propose doing — add a task/reminder, a routine, or change an office day.
// The model never writes to the database: it appends a fenced ```actions block to its reply, the
// app shows each one as a card, and nothing happens until you tap Add. Pure: no React, no I/O.

import { isRepeat, type Repeat } from './tasks';
import type { WorkMode } from './work';

export type AiAction =
  | { type: 'task'; title: string; due: string | null; repeat: Repeat | null; remind_before: number; priority: number; notes: string | null }
  | { type: 'routine'; name: string; emoji: string | null; days: number[]; time: string; duration_min: number }
  | { type: 'workday'; date: string; mode: WorkMode | null; shift: string | null }
  | { type: 'person'; name: string; birthday: string | null; every_days: number; weekday: number | null };

export const ACTIONS_GUIDE = `When the user asks you to remember, remind, schedule or plan something — or a reminder would clearly help — end your reply with ONE fenced block in exactly this format (it is turned into confirm buttons; never mention the block itself):
\`\`\`actions
[{"type":"task","title":"Pay rent","due":"2026-11-05T10:00","repeat":"monthly","remind_before":1440,"priority":2,"notes":"₹ via UPI"},
 {"type":"routine","name":"Evening walk","emoji":"🚶","days":[1,2,3,4,5],"time":"19:30","duration_min":30},
 {"type":"workday","date":"2026-11-07","mode":"leave"},
 {"type":"person","name":"Mom","birthday":"1970-03-14","every_days":7,"weekday":0}]
\`\`\`
- task: one-off or repeating reminder. "due" is "YYYY-MM-DD" (all day) or "YYYY-MM-DDTHH:MM" (local, 24 h) — give a time whenever one is implied so a push notification fires. "repeat": null | "daily" | "weekdays" | "weekly" | "monthly" | "yearly". "remind_before": minutes of early warning (0, 15, 60 or 1440). "priority": 0–3.
- routine: a recurring time block on weekdays (0 = Sunday … 6 = Saturday), "time" "HH:MM".
- person: someone to keep in touch with (Pit crew) — "call Mom every Sunday" is every_days 7 + weekday 0; birthdays go here as "YYYY-MM-DD" (use 2000 if the year is unknown). Prefer this over a task for calls and birthdays; the app pushes call reminders and birthday wishes itself.
- workday: override one office day — "mode": "office" | "wfh" | "leave" | "off", and/or "shift" (a shift id from the context).
Resolve relative dates ("next Friday", "on the 5th", "tonight") against the current date and time given in the context. Use a timed due for events with a start time; for a birthday or anniversary use 09:00 on the day with "repeat":"yearly" and "remind_before":1440 so it pings the day before too. Never invent tasks the user didn't ask for unless you're proposing them as suggestions in the text too.`;

const validDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T12:00:00Z`));
const validTime = (s: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(s);

/** Split a reply into the visible text and the actions block (if any, even if still streaming). */
export function splitActions(reply: string): { text: string; raw: string | null } {
  const i = reply.indexOf('```actions');
  if (i < 0) return { text: reply, raw: null };
  const rest = reply.slice(i + 10);
  const end = rest.indexOf('```');
  return { text: (reply.slice(0, i) + (end >= 0 ? rest.slice(end + 3) : '')).trim(), raw: end >= 0 ? rest.slice(0, end) : null };
}

const str = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);

/** Validate whatever the model produced; anything malformed is dropped, not guessed at. */
export function normaliseActions(raw: unknown): AiAction[] {
  let list: unknown = raw;
  if (typeof raw === 'string') {
    try {
      list = JSON.parse(raw.trim());
    } catch {
      return [];
    }
  }
  if (list && typeof list === 'object' && !Array.isArray(list) && Array.isArray((list as { actions?: unknown }).actions)) list = (list as { actions: unknown[] }).actions;
  if (!Array.isArray(list)) return [];
  const out: AiAction[] = [];
  for (const a of list.slice(0, 12) as Record<string, unknown>[]) {
    if (!a || typeof a !== 'object') continue;
    if (a.type === 'task') {
      const title = str(a.title, 120);
      if (!title) continue;
      let due = str(a.due, 16);
      if (due && !(validDate(due.slice(0, 10)) && (due.length === 10 || (due[10] === 'T' && validTime(due.slice(11, 16)))))) due = null;
      const lead = Number(a.remind_before);
      out.push({
        type: 'task',
        title,
        due,
        repeat: due && isRepeat(a.repeat) ? a.repeat : null,
        remind_before: due?.includes('T') && [15, 30, 60, 120, 1440].includes(lead) ? lead : 0,
        priority: Math.max(0, Math.min(3, Math.round(Number(a.priority) || 0))),
        notes: str(a.notes, 300),
      });
    } else if (a.type === 'routine') {
      const name = str(a.name, 60);
      const time = str(a.time, 5);
      const days = Array.isArray(a.days) ? [...new Set(a.days.map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort() : [];
      if (!name || !time || !validTime(time) || !days.length) continue;
      out.push({ type: 'routine', name, emoji: str(a.emoji, 4), days, time, duration_min: Math.max(5, Math.min(240, Math.round(Number(a.duration_min) || 30))) });
    } else if (a.type === 'person') {
      const name = str(a.name, 60);
      if (!name) continue;
      const bday = str(a.birthday, 10);
      const wd = Number(a.weekday);
      out.push({ type: 'person', name, birthday: bday && validDate(bday) ? bday : null, every_days: Math.max(0, Math.min(365, Math.round(Number(a.every_days) || 0))), weekday: a.weekday != null && Number.isInteger(wd) && wd >= 0 && wd <= 6 ? wd : null });
    } else if (a.type === 'workday') {
      const date = str(a.date, 10);
      const mode = ['office', 'wfh', 'leave', 'off'].includes(a.mode as string) ? (a.mode as WorkMode) : null;
      const shift = str(a.shift, 20);
      if (!date || !validDate(date) || (!mode && !shift)) continue;
      out.push({ type: 'workday', date, mode, shift });
    }
  }
  return out;
}

/** Short human line for a card, e.g. "Fri 7 Nov, 10:00 · monthly · 1 day early". */
export function describeDue(a: Extract<AiAction, { type: 'task' }>) {
  if (!a.due) return 'No date';
  const d = new Date(`${a.due.slice(0, 10)}T12:00:00`);
  const day = d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  const lead = a.remind_before >= 1440 ? '1 day early' : a.remind_before >= 60 ? `${a.remind_before / 60} h early` : a.remind_before ? `${a.remind_before} min early` : '';
  return [a.due.length > 10 ? `${day}, ${a.due.slice(11, 16)}` : day, a.repeat, lead].filter(Boolean).join(' · ');
}
