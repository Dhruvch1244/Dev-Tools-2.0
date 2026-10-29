// Notes as an inbox: jot anything, and it is filed where it is useful — a place to go (one tap to
// plan it), something to watch/read, a gift idea for someone, an idea, something to buy (straight
// to the shopping list), or a plain note. Things with a date become reminders/plans/bills through
// the usual confirm cards. Pure: no React, no I/O.

import { ACTIONS_GUIDE, normaliseActions, type AiAction } from './aiActions';

export type ListId = 'places' | 'watch' | 'gifts' | 'ideas' | 'buy' | 'note';
export const LISTS: Record<ListId, { label: string; emoji: string; color: string; hint: string }> = {
  places: { label: 'Places to go', emoji: '📍', color: '#e10600', hint: 'Cafés, trips, things to try — tap Plan it when you’re free' },
  watch: { label: 'Watch & read', emoji: '🎬', color: '#4fb3ff', hint: 'Films, series, books, videos, articles' },
  gifts: { label: 'Gift ideas', emoji: '🎁', color: '#ff5fa2', hint: 'Shows up on their Pit crew card and birthday reminder' },
  ideas: { label: 'Ideas', emoji: '💡', color: '#ffd23f', hint: 'Projects, app features, side quests' },
  buy: { label: 'To buy', emoji: '🛒', color: '#2bd46b', hint: 'Goes to your shopping list in one tap' },
  note: { label: 'Notes', emoji: '📝', color: '#9aa0ad', hint: 'Anything else — addresses, recipes, thoughts' },
};
export const LIST_ORDER: ListId[] = ['places', 'watch', 'gifts', 'ideas', 'buy', 'note'];
export const isList = (v: unknown): v is ListId => typeof v === 'string' && v in LISTS;

export type Filed = { list: ListId; title: string; body: string | null; person: string | null };
export type Sorted = { items: Filed[]; actions: AiAction[] };

export const SORT_SYSTEM = `You file quick notes for a personal life app. One jot may hold several things — split them.
For each thing decide:
- If it has a date/time or is a payment/reminder/trip on a day → an ACTION (plan, bill, task, routine or person), using the actions format below.
- Otherwise → a LIST item: "places" (somewhere to go, eat, visit, try), "watch" (film, series, book, video, article, podcast), "gifts" (a gift idea — set "person" to who it is for), "ideas" (projects, features, plans without a date), "buy" (things to purchase), "note" (anything else).
Reply with ONLY one JSON object, no prose:
{"items":[{"list":"places","title":"Bukhara, ITC Maurya","body":"dal Bukhara — go with Riya","person":null},{"list":"gifts","title":"Pashmina shawl","body":null,"person":"Mom"}],"actions":[]}
Titles: short and clean (fix spelling, no "remember to"). "body": extra detail from the jot or null. Keep the user's language for names.
Action shapes for "actions" (a JSON array inside the object — not a fenced block):
${ACTIONS_GUIDE.replace(/^[^\n]*\n/, '').replace(/```actions\n|\n```/g, '')}`;

const str = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);

export function normaliseSorted(raw: unknown): Sorted {
  const o = (raw && typeof raw === 'object' ? raw : {}) as { items?: unknown; actions?: unknown };
  const items: Filed[] = [];
  for (const it of (Array.isArray(o.items) ? o.items : []).slice(0, 12) as Record<string, unknown>[]) {
    const title = str(it?.title, 140);
    if (!title) continue;
    items.push({ list: isList(it.list) ? it.list : 'note', title, body: str(it.body, 600), person: it.list === 'gifts' ? str(it.person, 60) : null });
  }
  return { items, actions: normaliseActions(o.actions ?? []) };
}

/** "Lodhi Garden picnic" → the prompt that turns a places item into a calendar plan. */
export const planPrompt = (title: string, body?: string | null) => `Plan a visit: ${title}${body ? ` (${body})` : ''} — this coming weekend, a sensible time`;
