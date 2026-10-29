// Receipts and shared bills. The AI reads a receipt photo into line items; splitting decides each
// person's share (equally, or item by item with tax/service spread proportionally); balances roll
// the open splits up into "who owes me how much" with a message ready to send. Pure: no React, no I/O.

export type ReceiptItem = { name: string; amount: number };
export type Receipt = { merchant: string; date: string | null; items: ReceiptItem[]; extras: number; total: number; category: string; note: string };

export const RECEIPT_CATEGORIES = ['Food', 'Groceries', 'Transport', 'Shopping', 'Bills', 'Rent', 'Health', 'Fun', 'Travel', 'Other'];

export const RECEIPT_SYSTEM = `You read receipts and bills (restaurant, grocery, Swiggy/Zomato, cab, utility) for an expense tracker in India (INR).
Reply with ONLY a JSON object, no prose, no code fences:
{"merchant":"Toit","date":"2026-10-28","items":[{"name":"Paneer tikka","amount":420}],"extras":118.5,"total":1418.5,"category":"Food","note":"one short line: anything unclear"}
- items: each line item with its final line amount (qty × price) in rupees. Skip zero lines.
- extras: GST/CGST/SGST, service charge, delivery, packaging, tip minus any discount (can be negative).
- total: the grand total actually paid. If items + extras doesn't match it, trust the printed total.
- date as YYYY-MM-DD if visible, else null.
- category: one of ${RECEIPT_CATEGORIES.join(', ')}.
If the image isn't a receipt, return {"merchant":"","items":[],"extras":0,"total":0,"category":"Other","note":"…"}.`;

const num = (v: unknown, max = 1e7) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(-max, Math.min(max, n)) : 0;
};
const r2 = (n: number) => Math.round(n * 100) / 100;

export function normaliseReceipt(raw: unknown): Receipt {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const items = (Array.isArray(o.items) ? o.items : [])
    .slice(0, 60)
    .map((i) => ({ name: typeof i?.name === 'string' ? i.name.trim().slice(0, 60) : '', amount: r2(num(i?.amount)) }))
    .filter((i) => i.name && i.amount > 0);
  const itemSum = items.reduce((a, i) => a + i.amount, 0);
  const total = r2(num(o.total) > 0 ? num(o.total) : itemSum + num(o.extras));
  const date = typeof o.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(o.date) ? o.date : null;
  return {
    merchant: typeof o.merchant === 'string' ? o.merchant.trim().slice(0, 60) : '',
    date,
    items,
    // Whatever the printed total has beyond the items (taxes, charges, discounts).
    extras: r2(items.length ? total - itemSum : 0),
    total,
    category: RECEIPT_CATEGORIES.includes(o.category as string) ? (o.category as string) : 'Other',
    note: typeof o.note === 'string' ? o.note.slice(0, 200) : '',
  };
}

/** "me" is the owner; other ids are people rows. */
export const ME = 'me';

/**
 * Each participant's share. Equal: total / n. By item: each item split among the people assigned to
 * it (unassigned items are shared by everyone), then extras spread in proportion to item subtotals.
 * Shares are rounded to the rupee and the rounding remainder lands on "me" so they sum exactly.
 */
export function splitShares(r: { total: number; items: ReceiptItem[] }, people: string[], mode: 'equal' | 'items', assign: Record<number, string[]> = {}): Record<string, number> {
  const ps = [...new Set(people)];
  if (!ps.length) return {};
  const raw: Record<string, number> = Object.fromEntries(ps.map((p) => [p, 0]));
  if (mode === 'equal' || !r.items.length) for (const p of ps) raw[p] = r.total / ps.length;
  else {
    const itemSum = r.items.reduce((a, i) => a + i.amount, 0) || 1;
    r.items.forEach((it, i) => {
      const who = (assign[i] ?? []).filter((p) => ps.includes(p));
      const group = who.length ? who : ps;
      for (const p of group) raw[p] += it.amount / group.length;
    });
    const k = r.total / itemSum;
    for (const p of ps) raw[p] *= k;
  }
  const out: Record<string, number> = Object.fromEntries(ps.map((p) => [p, Math.round(raw[p])]));
  const diff = Math.round(r.total) - Object.values(out).reduce((a, b) => a + b, 0);
  out[ps.includes(ME) ? ME : ps[0]] += diff;
  return out;
}

export type Split = { id: string; person_id: string; amount: number; note: string | null; date: string; settled_at: string | null };
export type Balance = { person_id: string; net: number; open: Split[] };

/** Open splits per person; net > 0 means they owe you. Settled people drop out. */
export function balances(splits: Split[]): Balance[] {
  const m = new Map<string, Split[]>();
  for (const s of splits) if (!s.settled_at) m.set(s.person_id, [...(m.get(s.person_id) ?? []), s]);
  return [...m]
    .map(([person_id, open]) => ({ person_id, open: open.sort((a, b) => a.date.localeCompare(b.date)), net: Math.round(open.reduce((a, s) => a + s.amount, 0)) }))
    .filter((b) => b.net !== 0)
    .sort((a, b) => b.net - a.net);
}

const inr = (n: number) => `₹${Math.abs(Math.round(n)).toLocaleString('en-IN')}`;
const day = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

/** A friendly WhatsApp-ready tally for one person. */
export function settleMessage(name: string, b: Balance, upi?: string) {
  const lines = b.open.map((s) => `• ${s.note || 'Shared bill'} (${day(s.date)}) — ${s.amount < 0 ? 'I owe ' : ''}${inr(s.amount)}`);
  const head = b.net > 0 ? `Hey ${name}! Quick tally of what's pending 🙂` : `Hey ${name}, I owe you for these 🙂`;
  const foot = b.net > 0 ? `Total: ${inr(b.net)}${upi ? ` — UPI ${upi} whenever you can` : ' — send whenever you can'} 🙏` : `Total: ${inr(b.net)} — sending it now.`;
  return [head, ...lines, foot].join('\n');
}

/** One-line overview: "Rahul owes ₹600 · Priya owes ₹250 · you owe Amit ₹120". */
export function balancesSummary(bs: Balance[], nameOf: (id: string) => string) {
  const owed = bs.filter((b) => b.net > 0).reduce((a, b) => a + b.net, 0);
  const owe = -bs.filter((b) => b.net < 0).reduce((a, b) => a + b.net, 0);
  return { owed, owe, text: bs.map((b) => (b.net > 0 ? `${nameOf(b.person_id)} owes ${inr(b.net)}` : `you owe ${nameOf(b.person_id)} ${inr(b.net)}`)).join(' · ') };
}
