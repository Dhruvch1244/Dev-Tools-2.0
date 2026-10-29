import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FOODS } from '../web/src/core/foods.ts';
import { hasMicros, microReport, microTargets, microsForLog, sumMicros } from '../web/src/core/micros.ts';
import { extractJson, normaliseAi, rescale } from '../web/src/core/aiFood.ts';

test('every catalogue food has micronutrient data', () => {
  const missing = FOODS.filter((f) => !hasMicros(f.id)).map((f) => f.id);
  assert.deepEqual(missing, []);
});

test('micros scale with qty; a stored snapshot wins over the catalogue', () => {
  assert.equal(microsForLog({ food_id: 'rajma', qty: 2 })?.fiber, 14);
  assert.equal(microsForLog({ food_id: 'rajma', qty: 1, micros: JSON.stringify({ fiber: 3 }) })?.fiber, 3);
  assert.equal(microsForLog({ food_id: null, qty: 1 }), undefined);
});

test('sumMicros counts calories with no data so the UI can say "partial"', () => {
  const { total, unknownKcal } = sumMicros([
    { food_id: 'curd', qty: 2, kcal: 120 },
    { food_id: 'my-custom', qty: 1, kcal: 300 },
  ]);
  assert.equal(total.calcium, 240);
  assert.equal(unknownKcal, 300);
});

test('micro report flags lows and limit overruns', () => {
  const t = microTargets('male', 2200);
  const total = { fiber: 10, sugar: 80, sodium: 1500, calcium: 1000, iron: 19, potassium: 3500, magnesium: 440, zinc: 17, vitC: 80, b12: 0.5 };
  const r = Object.fromEntries(microReport(total, t).map((x) => [x.key, x.status]));
  assert.equal(r.fiber, 'low');
  assert.equal(r.b12, 'low');
  assert.equal(r.sugar, 'over');
  assert.equal(r.sodium, 'ok');
  assert.equal(r.iron, 'ok');
});

test('AI reply: catalogue matches use our numbers, unknown dishes use the estimate, egg is flagged for veg', () => {
  const reply = 'Sure! {"items":[{"id":"roti","qty":3,"kcal":9999,"confidence":"high"},{"name":"Gongura chutney","portion":"1 tbsp","kcal":40,"protein":0.5,"fiber":1.2,"confidence":"low"},{"id":"boiled-egg","qty":1},{"name":"nothing"},{"id":"no-such-food","name":""}],"note":"ok"}';
  const r = normaliseAi(extractJson(reply), 'veg');
  assert.equal(r.items.length, 3);
  const [roti, chutney, egg] = r.items;
  assert.equal(roti.kcal, 312, 'kcal comes from the food table, not the model');
  assert.equal(roti.micros.fiber, 10.2);
  assert.equal(chutney.food_id, null);
  assert.equal(chutney.micros.fiber, 1.2);
  assert.equal(chutney.confidence, 'low');
  assert.ok(egg.offDiet);
  assert.ok(!roti.offDiet && !chutney.offDiet);
});

test('rescaling an AI item keeps everything proportional', () => {
  const [roti] = normaliseAi({ items: [{ id: 'roti', qty: 2 }] }, 'veg').items;
  const four = rescale(roti, 4);
  assert.equal(four.kcal, 416);
  assert.equal(four.micros.iron, 5.6);
});

import { DEFAULT_COOK, DINNERS, MAKE_AHEAD, cookBrief, dishBoosts, lunchEstimate, nextWeekday, planCookDay, shoppingList, shoppingTrips } from '../web/src/core/cook.ts';
import { FOODS as ALL_FOODS } from '../web/src/core/foods.ts';

test('cook plan: every dish is buildable from the food table', () => {
  const ids = new Set(ALL_FOODS.map((f) => f.id));
  for (const d of [...MAKE_AHEAD, ...DINNERS]) for (const [id] of d.items) assert.ok(ids.has(id), `${d.name}: unknown food ${id}`);
  assert.ok(MAKE_AHEAD.length >= 25 && DINNERS.length >= 20);
  assert.equal(new Set(DINNERS.map((d) => d.name.toLowerCase())).size, DINNERS.length, 'duplicate dinner names');
});

test('cook plan: lunch reserved from your average, whey from 1 Nov, near target, stable per date', () => {
  const target = { kcal: 2200, protein: 144 };
  const logs = ['2026-11-05', '2026-11-06', '2026-11-07'].map((date) => ({ date, meal: 'lunch', kcal: 600, protein: 25 }));
  const lunch = lunchEstimate(logs, '2026-11-10', target);
  assert.deepEqual(lunch, { kcal: 600, protein: 25, from: 'average' });
  assert.equal(lunchEstimate([], '2026-11-10', target).from, 'typical');
  const d = planCookDay('2026-11-10', { target, cfg: DEFAULT_COOK, diet: 'veg', lunch })!;
  assert.ok(MAKE_AHEAD.some((m) => m.name === d.breakfast.name));
  assert.deepEqual(d.whey, { scoops: 2.5, kcal: 300, protein: 60 });
  assert.equal(planCookDay('2026-10-30', { target, cfg: DEFAULT_COOK, diet: 'veg' })!.whey.scoops, 0);
  assert.ok(Math.abs(d.total.kcal - target.kcal) < 450, `total ${d.total.kcal}`);
  assert.ok(d.total.protein >= target.protein * 0.85, `protein ${d.total.protein}`);
  assert.equal(planCookDay('2026-11-10', { target, cfg: DEFAULT_COOK, diet: 'veg', lunch })!.breakfast.name, d.breakfast.name);
  const swapped = planCookDay('2026-11-10', { target, cfg: DEFAULT_COOK, diet: 'veg', lunch, picks: { breakfast: d.breakfastOptions.find((n) => n !== d.breakfast.name) } })!;
  assert.notEqual(swapped.breakfast.name, d.breakfast.name);
  const brief = cookBrief(d, d);
  assert.match(brief, /Breakfast for tomorrow/);
  assert.doesNotMatch(brief.split('\n').slice(0, -1).join('\n'), /\b(egg|chicken|fish)\b/i);
  assert.ok(shoppingList([d, d]).every((i) => i.qty));
});

test('cook plan: dishes rich in a weekly gap get picked and say why', () => {
  const target = { kcal: 2200, protein: 144 };
  const gaps = [{ key: 'iron' as const, target: 19 }];
  const d = planCookDay('2026-11-10', { target, cfg: DEFAULT_COOK, diet: 'veg', gaps })!;
  assert.ok(d.dinner.boosts.length + d.breakfast.boosts.length > 0, 'nothing iron-rich chosen');
  assert.deepEqual(dishBoosts([{ food: { id: 'lauki' }, qty: 0.1 }], gaps), []);
});

test('shopping: big shop Sunday takes staples + early fresh, Wednesday tops up fresh', () => {
  const target = { kcal: 2200, protein: 144 };
  const plan = (date: string) => planCookDay(date, { target, cfg: DEFAULT_COOK, diet: 'veg' });
  assert.equal(nextWeekday('2026-10-29', 0), '2026-11-01');
  const [big, top] = shoppingTrips('2026-10-29', plan);
  assert.equal(big.date, '2026-11-01');
  assert.equal(top.date, '2026-11-04');
  assert.deepEqual(big.covers, ['2026-11-01', '2026-11-03']);
  assert.ok(top.items.every((i) => i.keeps < 7), 'only fresh things on the top-up');
  assert.ok(big.items.some((i) => i.name === 'Whey protein' && i.qty.startsWith('525 g')), 'a week of 2.5 scoops = 525 g');
  assert.ok(big.items.length > 0 && top.items.length > 0);
});

import { amount, nice, portionText } from '../web/src/core/portion.ts';

test('portions read like a cook would say them', () => {
  assert.equal(nice(1.5), '1½');
  assert.equal(nice(0.25), '¼');
  assert.equal(amount('1 katori (100 g)', 1.5), '1½ katori (~150 g)');
  assert.equal(amount('1 katori', 2), '2 katoris (~300 g)');
  assert.equal(amount('100 g', 0.5), '50 g');
  assert.equal(amount('4 pieces', 1.5), '6 pieces');
  assert.equal(amount('1 glass (250 ml)', 1.5), '1½ glass (~375 ml)');
  assert.equal(portionText({ id: 'roti', name: 'Roti / Phulka', serving: '1 medium (35 g atta)' }, 3), '3 rotis');
  assert.equal(portionText({ id: 'whey', name: 'Whey protein', serving: '1 scoop (30 g)' }, 1.5), 'Whey protein · 1½ scoop (~45 g)');
});
