// Receipt normalising, bill splitting and the owes-me tally.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ME, balances, normaliseReceipt, settleMessage, splitShares } from '../web/src/core/money.ts';

test('receipt: items kept, extras = printed total − items, junk dropped', () => {
  const r = normaliseReceipt({ merchant: 'Toit', date: '2026-10-28', items: [{ name: 'Paneer tikka', amount: 420 }, { name: '', amount: 9 }, { name: 'Coke', amount: 0 }, { name: 'Dal makhani', amount: 380 }], extras: 0, total: 944, category: 'Food' });
  assert.equal(r.items.length, 2);
  assert.equal(r.extras, 144);
  assert.equal(r.total, 944);
  assert.equal(normaliseReceipt({ total: 'abc', category: 'Weird' }).category, 'Other');
});

test('split: equal, by item with extras spread, and rupee-exact totals', () => {
  assert.deepEqual(splitShares({ total: 1000, items: [] }, [ME, 'a', 'b'], 'equal'), { me: 334, a: 333, b: 333 });
  // a had the 600 item alone; the 200 item is shared; 10 % extras spread by subtotal.
  const s = splitShares({ total: 880, items: [{ name: 'x', amount: 600 }, { name: 'y', amount: 200 }] }, [ME, 'a'], 'items', { 0: ['a'] });
  assert.deepEqual(s, { me: 110, a: 770 });
  assert.equal(Object.values(s).reduce((x, y) => x + y, 0), 880);
});

test('balances: open splits per person, settled ones drop out, message lists bills', () => {
  const rows = [
    { id: '1', person_id: 'a', amount: 450, note: 'Dinner at Toit', date: '2026-10-12', settled_at: null },
    { id: '2', person_id: 'a', amount: 150, note: 'Cab', date: '2026-10-14', settled_at: null },
    { id: '3', person_id: 'b', amount: -120, note: 'Movie', date: '2026-10-20', settled_at: null },
    { id: '4', person_id: 'c', amount: 999, note: 'Old', date: '2026-09-01', settled_at: '2026-09-02' },
  ];
  const bs = balances(rows);
  assert.deepEqual(bs.map((b) => [b.person_id, b.net]), [['a', 600], ['b', -120]]);
  const msg = settleMessage('Rahul', bs[0], 'me@okhdfc', 0.3);
  assert.match(msg, /Dinner at Toit/);
  assert.match(msg, /Total: ₹600 → UPI me@okhdfc/);
  // With bill items, the opener mentions one of them; different seeds give different lines.
  const withItems = balances([{ ...rows[0], items: JSON.stringify(['Paneer Tikka', 'Garlic Naan']) }]);
  const a = settleMessage('Rahul', withItems[0], undefined, 0.05);
  assert.match(a.split('\n')[0], /Paneer Tikka|Garlic Naan/);
  assert.notEqual(a, settleMessage('Rahul', withItems[0], undefined, 0.55));
});

import { normalisePhone, parseVcf } from '../web/src/core/vcard.ts';

test('vCard import: names, Indian mobiles, birthdays (iOS no-year), folded lines', () => {
  const vcf = 'BEGIN:VCARD\r\nVERSION:3.0\r\nN:Sharma;Rahul;;;\r\nFN:Rahul Sharma\r\nitem1.TEL;type=WORK:080 2222 3333\r\nTEL;type=CELL;type=VOICE:98765 43210\r\nBDAY;X-APPLE-OMIT-YEAR=1604:1604-03-14\r\nEND:VCARD\r\nBEGIN:VCARD\r\nN:;Mom;;;\r\nTEL:+91 99999\r\n 00000\r\nEND:VCARD\r\nBEGIN:VCARD\r\nFN:\r\nEND:VCARD';
  const c = parseVcf(vcf);
  assert.deepEqual(c, [
    { name: 'Rahul Sharma', phone: '+919876543210', birthday: '2000-03-14' },
    { name: 'Mom', phone: '+919999900000', birthday: null },
  ]);
  assert.equal(normalisePhone('09876543210'), '+919876543210');
  assert.equal(normalisePhone('12'), null);
});
