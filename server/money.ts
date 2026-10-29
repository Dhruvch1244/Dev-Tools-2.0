// Money AI and live prices: search instruments, quote the portfolio (Yahoo Finance for NSE stocks,
// ETFs and crypto; mfapi.in for mutual fund NAVs — both free, no key), read holdings from a broker
// screenshot or pasted text, and the streamed money advisor that sees your spending and portfolio.
import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { db } from './db.ts';
import { ask, type Prompt } from './coach.ts';
import { localStamp } from './push.ts';
import { extractJson } from '../web/src/core/aiFood.ts';
import { ADVISOR_SYSTEM, HOLDINGS_SYSTEM, normaliseHoldings, portfolioText, summary, yahooSymbol, type Holding, type Quote } from '../web/src/core/portfolio.ts';

export const money = new Hono();
// Yahoo rate-limits full browser user agents without cookies (429); the bare one is let through.
const UA = { 'user-agent': 'Mozilla/5.0' };
const cache = new Map<string, { at: number; v: Quote | null }>();
const FRESH = 60_000; // stocks: a minute; NAVs only change once a day but the call is cheap once cached

async function yahoo(sym: string): Promise<Quote | null> {
  const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=1d&interval=1d`, { headers: UA, signal: AbortSignal.timeout(8000) });
  const m = ((await r.json()) as { chart?: { result?: { meta: { regularMarketPrice: number; chartPreviousClose?: number; longName?: string; shortName?: string; regularMarketTime?: number } }[] } }).chart?.result?.[0]?.meta;
  return m?.regularMarketPrice ? { price: m.regularMarketPrice, prev: m.chartPreviousClose ?? null, name: m.longName ?? m.shortName, at: m.regularMarketTime ? new Date(m.regularMarketTime * 1000).toISOString() : undefined } : null;
}

async function mfSearch(q: string) {
  const r = await fetch(`https://api.mfapi.in/mf/search?q=${encodeURIComponent(q)}`, { signal: AbortSignal.timeout(10_000) });
  return ((await r.json()) as { schemeCode: number; schemeName: string }[]).slice(0, 8);
}
async function nav(code: string): Promise<Quote | null> {
  const r = await fetch(`https://api.mfapi.in/mf/${encodeURIComponent(code)}`, { signal: AbortSignal.timeout(15_000) });
  const j = (await r.json()) as { meta?: { scheme_name?: string }; data?: { date: string; nav: string }[] };
  const [a, b] = j.data ?? [];
  if (!a) return null;
  const [d, m, y] = a.date.split('-');
  return { price: Number(a.nav), prev: b ? Number(b.nav) : null, name: j.meta?.scheme_name, at: `${y}-${m}-${d}` };
}

async function quote(h: Holding): Promise<Quote | null> {
  let key = h.kind === 'mf' ? (h.symbol ? `mf:${h.symbol}` : null) : yahooSymbol(h);
  // A fund imported by name gets its scheme code looked up once and remembered.
  if (h.kind === 'mf' && !h.symbol) {
    const hit = (await mfSearch(h.name).catch(() => []))[0];
    if (!hit) return null;
    db.prepare('UPDATE holdings SET symbol = ? WHERE id = ?').run(String(hit.schemeCode), h.id);
    key = `mf:${hit.schemeCode}`;
  }
  if (!key) return null;
  const c = cache.get(key);
  if (c && Date.now() - c.at < (key.startsWith('mf:') ? 30 * 60_000 : FRESH)) return c.v;
  try {
    const v = key.startsWith('mf:') ? await nav(key.slice(3)) : await yahoo(key);
    cache.set(key, { at: Date.now(), v });
    return v;
  } catch {
    return c?.v ?? null;
  }
}

const holdings = () => db.prepare('SELECT id, kind, symbol, name, qty, avg_price, value FROM holdings').all() as Holding[];
async function quotes(hs = holdings()) {
  const out: Record<string, Quote | null> = {};
  await Promise.all(hs.map(async (h) => (out[h.id] = await quote(h))));
  return out;
}

money.get('/quotes', async (c) => c.json(await quotes()));

money.get('/search', async (c) => {
  const q = c.req.query('q')?.trim() ?? '';
  const kind = c.req.query('kind') ?? 'stock';
  if (q.length < 2) return c.json([]);
  try {
    if (kind === 'mf') return c.json((await mfSearch(q)).map((x) => ({ symbol: String(x.schemeCode), name: x.schemeName, exchange: 'AMFI' })));
    const r = await fetch(`https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=8&newsCount=0`, { headers: UA, signal: AbortSignal.timeout(8000) });
    const rows = ((await r.json()) as { quotes?: { symbol: string; shortname?: string; longname?: string; exchange?: string; quoteType?: string }[] }).quotes ?? [];
    const want = kind === 'crypto' ? (x: { quoteType?: string }) => x.quoteType === 'CRYPTOCURRENCY' : (x: { symbol: string }) => /\.(NS|BO)$/.test(x.symbol);
    return c.json(rows.filter(want).map((x) => ({ symbol: kind === 'crypto' ? x.symbol.replace(/-(USD|INR)$/, '') : x.symbol.replace(/\.NS$/, ''), name: x.longname ?? x.shortname ?? x.symbol, exchange: x.exchange })));
  } catch (e) {
    return c.json({ error: (e as Error).message }, 502);
  }
});

// Broker screenshot or pasted text → holdings to review before saving.
money.post('/parse', async (c) => {
  const { text, image } = await c.req.json<{ text?: string; image?: string }>();
  if (!text?.trim() && !image) return c.json({ error: 'Paste your holdings or add a screenshot' }, 400);
  const prompt: Prompt = image
    ? [{ type: 'image', source: { type: 'base64', media_type: image.slice(5, image.indexOf(';')), data: image.slice(image.indexOf(',') + 1) } }, { type: 'text', text: text?.trim() || 'List these holdings.' }]
    : text!.slice(0, 15_000);
  try {
    return c.json({ holdings: normaliseHoldings(extractJson(await ask(HOLDINGS_SYSTEM, prompt, { onDelta: () => {}, signal: c.req.raw.signal }))) });
  } catch (e) {
    return c.json({ error: (e as Error).message }, 502);
  }
});

/** Everything the advisor reads: 3 months of spending, budgets, subscriptions, IOUs, bills, portfolio. */
async function moneyContext() {
  const q = <T>(sql: string, ...a: string[]) => db.prepare(sql).all(...a) as T[];
  const today = localStamp(new Date()).slice(0, 10);
  const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;
  const months = q<{ m: string; kind: string; category: string; total: number }>("SELECT substr(date,1,7) m, kind, category, sum(amount) total FROM expenses WHERE date >= date(?, 'start of month', '-2 months') GROUP BY m, kind, category ORDER BY m, total DESC", today);
  const byMonth = [...new Set(months.map((r) => r.m))].map((m) => {
    const rows = months.filter((r) => r.m === m);
    const spent = rows.filter((r) => r.kind === 'expense');
    return `${m}: spent ${inr(spent.reduce((a, r) => a + r.total, 0))}, received ${inr(rows.filter((r) => r.kind === 'income').reduce((a, r) => a + r.total, 0))} — ${spent.slice(0, 10).map((r) => `${r.category} ${inr(r.total)}`).join(', ')}`;
  });
  const big = q<{ date: string; amount: number; category: string; note: string | null }>("SELECT date, amount, category, note FROM expenses WHERE kind = 'expense' AND date >= date(?, '-30 days') ORDER BY amount DESC LIMIT 12", today);
  const budgets = q<{ category: string; amount: number }>('SELECT category, amount FROM budgets');
  const subs = q<{ name: string; amount: number; cycle: string }>('SELECT name, amount, cycle FROM subscriptions');
  const owed = q<{ name: string; total: number }>('SELECT p.name, sum(s.amount) total FROM splits s JOIN people p ON p.id = s.person_id WHERE s.settled_at IS NULL GROUP BY p.name');
  const bills = q<{ title: string; amount: number | null; due: string; repeat: string | null }>("SELECT title, amount, due, repeat FROM tasks WHERE kind = 'bill' AND done = 0 ORDER BY due LIMIT 15");
  const hs = holdings();
  return [
    `Today: ${today}. Currency INR.`,
    `# Spending by month (last 3)\n${byMonth.join('\n') || 'nothing logged'}`,
    big.length ? `# Biggest expenses, last 30 days\n${big.map((e) => `${e.date} ${inr(e.amount)} ${e.category}${e.note ? ` — ${e.note}` : ''}`).join('\n')}` : '',
    budgets.length ? `# Monthly budgets\n${budgets.map((b) => `${b.category} ${inr(b.amount)}`).join(', ')}` : '# Budgets: none set',
    subs.length ? `# Subscriptions\n${subs.map((s) => `${s.name} ${inr(s.amount)}/${s.cycle}`).join(', ')}` : '',
    bills.length ? `# Bills\n${bills.map((b) => `${b.title}${b.amount ? ` ${inr(b.amount)}` : ''} due ${b.due.slice(0, 10)}${b.repeat ? ` (${b.repeat})` : ''}`).join('\n')}` : '',
    owed.length ? `# Friends owe me\n${owed.map((o) => `${o.name} ${inr(o.total)}`).join(', ')}` : '',
    `# ${portfolioText(summary(hs, await quotes(hs)))}`,
  ]
    .filter(Boolean)
    .join('\n\n');
}

money.post('/advisor', async (c) => {
  const { message, history = [] } = await c.req.json<{ message: string; history?: { role: 'user' | 'assistant'; text: string }[] }>();
  if (!message?.trim()) return c.json({ error: 'Ask something' }, 400);
  const prompt = [`# My money right now\n${await moneyContext()}`, history.length ? '# Conversation so far' : '', ...history.slice(-8).map((h) => `${h.role === 'user' ? 'Me' : 'Advisor'}: ${h.text.slice(0, 3000)}`), `# Me now\n${message.slice(0, 20_000)}`].filter(Boolean).join('\n\n');
  return streamSSE(c, async (stream) => {
    const ctl = new AbortController();
    stream.onAbort(() => ctl.abort());
    try {
      await ask(ADVISOR_SYSTEM, prompt, { signal: ctl.signal, onDelta: (t) => void stream.writeSSE({ event: 'delta', data: JSON.stringify(t) }) });
      await stream.writeSSE({ event: 'done', data: '' });
    } catch (e) {
      if (!ctl.signal.aborted) await stream.writeSSE({ event: 'error', data: (e as Error).message });
    }
  });
});
