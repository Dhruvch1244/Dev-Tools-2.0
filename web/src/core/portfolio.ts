// Portfolio: what you hold (NSE stocks/ETFs, mutual funds, crypto, gold, FDs, cash…), valued with
// live prices, and the AI money advisor's brief. Pure: no React, no I/O.

export type AssetKind = 'stock' | 'etf' | 'mf' | 'crypto' | 'gold' | 'fd' | 'cash' | 'other';
export const ASSETS: Record<AssetKind, { label: string; emoji: string; color: string; live: boolean; hint: string }> = {
  stock: { label: 'Stocks', emoji: '📈', color: '#4fb3ff', live: true, hint: 'NSE symbol, e.g. RELIANCE' },
  etf: { label: 'ETFs', emoji: '🧺', color: '#7ee0a1', live: true, hint: 'NSE symbol, e.g. NIFTYBEES, GOLDBEES' },
  mf: { label: 'Mutual funds', emoji: '🏦', color: '#c9a2ff', live: true, hint: 'Search the scheme name' },
  crypto: { label: 'Crypto', emoji: '🪙', color: '#ffb547', live: true, hint: 'BTC, ETH…' },
  gold: { label: 'Gold', emoji: '🥇', color: '#ffd23f', live: false, hint: 'Physical / SGB — enter current value' },
  fd: { label: 'FD / RD', emoji: '🔒', color: '#2bd46b', live: false, hint: 'Enter current value' },
  cash: { label: 'Cash & savings', emoji: '💵', color: '#9aa0ad', live: false, hint: 'Bank balance, emergency fund' },
  other: { label: 'Other', emoji: '✨', color: '#ff5fa2', live: false, hint: 'PF, PPF, NPS, real estate…' },
};
export const ASSET_ORDER = Object.keys(ASSETS) as AssetKind[];
export const isAsset = (v: unknown): v is AssetKind => typeof v === 'string' && v in ASSETS;

export type Holding = { id: string; kind: AssetKind; symbol: string | null; name: string; qty: number | null; avg_price: number | null; value: number | null };
export type Quote = { price: number; prev: number | null; name?: string; at?: string };

/** Yahoo symbol for a live holding: NSE by default, crypto in INR. Null for mutual funds/manual. */
export function yahooSymbol(h: Pick<Holding, 'kind' | 'symbol'>) {
  const s = h.symbol?.trim().toUpperCase();
  if (!s) return null;
  if (h.kind === 'stock' || h.kind === 'etf') return s.includes('.') || s.startsWith('^') ? s : `${s}.NS`;
  if (h.kind === 'crypto') return s.includes('-') ? s : `${s}-INR`;
  return null;
}

export type Valued = Holding & { price: number | null; current: number; invested: number; pnl: number; dayChange: number };

export function valueOf(h: Holding, q: Quote | null | undefined): Valued {
  const qty = h.qty ?? 0;
  const invested = h.avg_price != null && h.qty != null ? h.avg_price * h.qty : (h.value ?? 0);
  if (ASSETS[h.kind].live && q) {
    const current = q.price * qty;
    return { ...h, price: q.price, current, invested, pnl: current - invested, dayChange: q.prev != null ? (q.price - q.prev) * qty : 0 };
  }
  // Manual assets (FD, cash…) or a live one without a quote yet: the value you entered, else cost.
  const current = h.value ?? invested;
  return { ...h, price: null, current, invested: h.avg_price != null && h.qty != null ? invested : current, pnl: h.avg_price != null && h.qty != null ? current - invested : 0, dayChange: 0 };
}

export function summary(holdings: Holding[], quotes: Record<string, Quote | null>) {
  const rows = holdings.map((h) => valueOf(h, quotes[h.id]));
  const total = rows.reduce((a, r) => a + r.current, 0);
  const invested = rows.reduce((a, r) => a + r.invested, 0);
  const day = rows.reduce((a, r) => a + r.dayChange, 0);
  const byKind = ASSET_ORDER.map((k) => ({ kind: k, value: rows.filter((r) => r.kind === k).reduce((a, r) => a + r.current, 0) })).filter((x) => x.value > 0);
  const equity = rows.filter((r) => ['stock', 'etf', 'mf', 'crypto'].includes(r.kind)).reduce((a, r) => a + r.current, 0);
  return {
    rows: rows.sort((a, b) => b.current - a.current),
    total,
    invested,
    pnl: total - invested,
    pnlPct: invested ? (total - invested) / invested : 0,
    day,
    dayPct: total - day ? day / (total - day) : 0,
    byKind: byKind.map((x) => ({ ...x, share: total ? x.value / total : 0 })),
    equityShare: total ? equity / total : 0,
    /** The biggest market position (stocks, funds, crypto) as a share of the market money — FDs and cash don't count as concentration. */
    top: equity ? Math.max(...rows.filter((r) => ['stock', 'etf', 'mf', 'crypto'].includes(r.kind)).map((r) => r.current)) / equity : 0,
    topName: rows.filter((r) => ['stock', 'etf', 'mf', 'crypto'].includes(r.kind)).sort((a, b) => b.current - a.current)[0]?.name ?? null,
  };
}

/** One-line portfolio facts for the advisor prompt. */
export function portfolioText(s: ReturnType<typeof summary>) {
  if (!s.rows.length) return 'Portfolio: nothing added yet.';
  const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;
  return [
    `Portfolio ${inr(s.total)} (invested ${inr(s.invested)}, P&L ${s.pnl >= 0 ? '+' : ''}${inr(s.pnl)} / ${(s.pnlPct * 100).toFixed(1)}%, today ${s.day >= 0 ? '+' : ''}${inr(s.day)}).`,
    `Allocation: ${s.byKind.map((k) => `${ASSETS[k.kind].label} ${(k.share * 100).toFixed(0)}%`).join(', ')}.`,
    `Holdings: ${s.rows.slice(0, 25).map((r) => `${r.name}${r.symbol ? ` (${r.symbol})` : ''} ${inr(r.current)}${r.invested ? ` ${r.pnl >= 0 ? '+' : ''}${((r.pnl / r.invested) * 100).toFixed(0)}%` : ''}`).join('; ')}.`,
  ].join('\n');
}

export const ADVISOR_SYSTEM = `You are "Pit Wall Finance", a straight-talking personal finance advisor for a young salaried software engineer in India (INR, Indian products and tax rules: 80C, NPS 80CCD(1B), new vs old regime, ELSS, PPF, EPF, SIPs, index funds, term + health insurance, emergency fund).
You see their real data: spending by category, budgets, subscriptions, money people owe them, and their portfolio with live prices. They may also paste chats, bank SMS, statements or offers — read them carefully.
- Be concrete: use their numbers ("you spent ₹8,400 on food delivery — 2× your grocery spend"). Prioritise: emergency fund → insurance → high-interest debt → tax-saving → long-term investing.
- Give clear options with trade-offs, not hype. Prefer low-cost index funds over stock tips. Never promise returns. Flag concentration risk and fees.
- For a specific security, explain the considerations rather than a buy/sell call, and note it's not licensed advice when it matters.
- Markdown, short sections, tables where useful. Under ~250 words unless asked for more.`;

export const HOLDINGS_SYSTEM = `You read a broker / app screenshot or pasted text of someone's investments (Zerodha, Groww, Kuvera, INDmoney, bank FD statements…) and list the holdings.
Reply with ONLY JSON: {"holdings":[{"kind":"stock","symbol":"RELIANCE","name":"Reliance Industries","qty":10,"avg_price":2450.5,"value":null}]}
kind is one of: stock, etf, mf, crypto, gold, fd, cash, other. symbol: the NSE symbol for stocks/ETFs (no .NS), the coin for crypto, null for mutual funds and manual assets.
For mutual funds put the full scheme name in "name", units in qty and average NAV in avg_price if shown. For FDs/cash/other put the current amount in "value". Use numbers without commas. Skip totals and headers.`;

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() && Number.isFinite(Number(v.replace(/[,₹\s]/g, ''))) ? Number(v.replace(/[,₹\s]/g, '')) : null);

export function normaliseHoldings(raw: unknown): Omit<Holding, 'id'>[] {
  const o = (raw && typeof raw === 'object' ? raw : {}) as { holdings?: unknown };
  return (Array.isArray(o.holdings) ? o.holdings : [])
    .slice(0, 60)
    .map((x) => {
      const r = (x ?? {}) as Record<string, unknown>;
      const kind: AssetKind = isAsset(r.kind) ? r.kind : 'other';
      const name = typeof r.name === 'string' ? r.name.trim().slice(0, 120) : '';
      const symbol = typeof r.symbol === 'string' && r.symbol.trim() && kind !== 'mf' ? r.symbol.trim().toUpperCase().replace(/\.NS$/, '').slice(0, 30) : null;
      return { kind, symbol, name: name || symbol || '', qty: num(r.qty), avg_price: num(r.avg_price), value: num(r.value) };
    })
    .filter((h) => h.name && (h.qty != null || h.value != null));
}
