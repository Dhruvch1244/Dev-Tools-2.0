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
