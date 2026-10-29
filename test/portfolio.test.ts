// Portfolio valuation, symbols and AI import normalisation.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normaliseHoldings, summary, valueOf, yahooSymbol, type Holding } from '../web/src/core/portfolio.ts';

const H = (x: Partial<Holding>): Holding => ({ id: x.name ?? 'h', kind: 'stock', symbol: null, name: 'x', qty: null, avg_price: null, value: null, ...x });

test('yahoo symbols', () => {
  assert.equal(yahooSymbol({ kind: 'stock', symbol: 'reliance' }), 'RELIANCE.NS');
  assert.equal(yahooSymbol({ kind: 'etf', symbol: 'NIFTYBEES.BO' }), 'NIFTYBEES.BO');
  assert.equal(yahooSymbol({ kind: 'crypto', symbol: 'BTC' }), 'BTC-INR');
  assert.equal(yahooSymbol({ kind: 'mf', symbol: '122639' }), null);
});

test('valuation: live, manual, missing quote', () => {
  const live = valueOf(H({ symbol: 'TCS', qty: 10, avg_price: 3000 }), { price: 3300, prev: 3250 });
  assert.equal(live.current, 33000);
  assert.equal(live.pnl, 3000);
  assert.equal(live.dayChange, 500);
  const fd = valueOf(H({ kind: 'fd', name: 'SBI FD', value: 200000 }), null);
  assert.equal(fd.current, 200000);
  assert.equal(fd.pnl, 0);
  const noQuote = valueOf(H({ symbol: 'TCS', qty: 10, avg_price: 3000 }), null);
  assert.equal(noQuote.current, 30000);
  const s = summary([H({ name: 'a', symbol: 'TCS', qty: 10, avg_price: 3000 }), H({ name: 'b', kind: 'cash', value: 70000 })], { a: { price: 3000, prev: 2900 } });
  assert.equal(s.total, 100000);
  assert.equal(s.byKind.find((k) => k.kind === 'cash')!.share, 0.7);
  assert.equal(s.day, 1000);
});

test('normaliseHoldings cleans AI output', () => {
  const h = normaliseHoldings({ holdings: [{ kind: 'stock', symbol: 'infy.ns', name: 'Infosys', qty: '12', avg_price: '1,450.5' }, { kind: 'mf', symbol: 'X', name: 'Parag Parikh Flexi Cap', qty: 120.5 }, { kind: 'weird', name: 'PPF', value: '₹1,20,000' }, { kind: 'stock', name: '' }] });
  assert.equal(h.length, 3);
  assert.deepEqual(h[0], { kind: 'stock', symbol: 'INFY', name: 'Infosys', qty: 12, avg_price: 1450.5, value: null });
  assert.equal(h[1].symbol, null);
  assert.equal(h[2].kind, 'other');
  assert.equal(h[2].value, 120000);
});
