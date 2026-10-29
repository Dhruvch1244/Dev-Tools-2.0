// Pure core logic (web/src/core). Runs without a browser: `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CYCLE, dayTypeOn, e1rm, platesPerSide, sectorColor, suggestNext, repRange } from '../web/src/core/gym.ts';
import { bmr, mealForNow, targets, DEFAULT_PROFILE } from '../web/src/core/fuel.ts';
import { FOODS } from '../web/src/core/foods.ts';
import { parseFoodText, proteinFixes } from '../web/src/core/foodParse.ts';
import { acceptFix, estimateKcal, haversine, pace, splits, trackDistanceKm, type Pt } from '../web/src/core/sport.ts';
import { EXERCISES } from '../web/src/core/exercises.ts';

test('gym cycle is anchored on Wed 2026-10-28 = legs, and a shift pushes it back', () => {
  assert.equal(dayTypeOn('2026-10-28'), 'legs');
  assert.equal(dayTypeOn('2026-10-29'), 'rest');
  assert.equal(dayTypeOn('2026-10-30'), 'upper');
  assert.equal(dayTypeOn('2026-11-02'), 'push');
  assert.equal(dayTypeOn('2026-10-21'), 'legs', 'a 7-day cycle repeats weekly');
  assert.equal(dayTypeOn('2026-10-29', 1), 'legs', 'skipping a day moves legs to tomorrow');
  assert.equal(CYCLE.filter((d) => d === 'rest').length, 2);
});

test('sector colours: only the session-best set can be purple', () => {
  const set = (weight: number, reps: number) => ({ exercise: 'x', weight, reps });
  const sessionBest = e1rm(90, 6);
  assert.equal(sectorColor(set(90, 6), sessionBest, e1rm(85, 6), e1rm(85, 6)), 'purple');
  assert.equal(sectorColor(set(85, 8), sessionBest, e1rm(85, 6), e1rm(85, 6)), 'green');
  assert.equal(sectorColor(set(70, 10), e1rm(70, 10), e1rm(70, 10), e1rm(70, 10)), 'yellow');
});

test('double progression coach', () => {
  assert.deepEqual(repRange('6-8'), [6, 8]);
  const all8 = suggestNext('Back Squat', '5-8', [{ exercise: 'Back Squat', weight: 85, reps: 8 }, { exercise: 'Back Squat', weight: 85, reps: 8 }]);
  assert.equal(all8?.weight, 90, 'big lower lifts go up 5 kg');
  assert.equal(all8?.reps, 5);
  const notYet = suggestNext('Barbell Bench Press', '6-8', [{ exercise: 'b', weight: 72.5, reps: 6 }]);
  assert.deepEqual([notYet?.weight, notYet?.reps], [72.5, 7]);
  assert.equal(suggestNext('Curl', '10-12', [])?.weight, undefined, 'no history, no guess');
});

test('plates per side', () => {
  assert.deepEqual(platesPerSide(102.5), [25, 15, 1.25]);
  assert.deepEqual(platesPerSide(20), []);
  assert.equal(platesPerSide(61.25), null, 'unloadable weights return null');
  assert.equal(platesPerSide(10), null);
});

test('fuel targets (Mifflin–St Jeor)', () => {
  const p = { ...DEFAULT_PROFILE, sex: 'male' as const, weight: 72, height: 175, age: 24 };
  assert.equal(Math.round(bmr(p)), 1699);
  const t = targets({ ...p, goal: 'cut' });
  assert.equal(t.protein, 144, '2 g/kg on a cut');
  assert.ok(Math.abs(t.kcal - (t.protein * 4 + t.carbs * 4 + t.fat * 9)) < 8, 'macros add up to the kcal target');
  assert.equal(mealForNow(8), 'breakfast');
  assert.equal(mealForNow(13), 'lunch');
  assert.equal(mealForNow(17), 'snacks');
  assert.equal(mealForNow(21), 'dinner');
});

test('food list is consistent', () => {
  const ids = FOODS.map((f) => f.id);
  assert.equal(new Set(ids).size, ids.length, 'unique ids');
  assert.ok(FOODS.length >= 400);
  // Alcohol and fibre-heavy veg legitimately differ; everything else should roughly match 4/4/9.
  const off = FOODS.filter((f) => !['beer', 'whisky', 'red-wine', 'raw-broccoli'].includes(f.id) && f.kcal > 30 && Math.abs(f.protein * 4 + f.carbs * 4 + f.fat * 9 - f.kcal) / f.kcal > 0.25);
  assert.deepEqual(off.map((f) => f.id), []);
});

test('typed food parsing understands quantities and Hinglish', () => {
  const p = (t: string) => parseFoodText(t, FOODS).map((x) => `${x.qty}× ${x.food?.id ?? '??'}`);
  assert.deepEqual(p('2 roti, dal tadka and 1 katori chawal'), ['2× roti', '1× dal-tadka', '1× rice']);
  assert.deepEqual(p('ek plate poha + chai'), ['1× poha', '1× chai']);
  assert.deepEqual(p('aloo paratha with dahi'), ['1× aloo-paratha', '1× curd']);
  assert.deepEqual(p('2 chapati aur rajma chawal'), ['2× roti', '1× rajma-chawal']);
  assert.deepEqual(p('half paneer butter masala'), ['0.5× paneer-butter-masala']);
  const fixes = proteinFixes(40, FOODS, []);
  assert.ok(fixes.length > 0 && fixes.every((f) => !f.food.id.startsWith('raw-')));
});

test('sport maths', () => {
  // Gateway of India → CST, Mumbai ≈ 2.0 km apart.
  const d = haversine([18.922, 72.8347, 0], [18.9398, 72.8355, 0]);
  assert.ok(d > 1900 && d < 2100, `got ${d}`);
  assert.equal(pace(30, 5), '6:00');
  assert.equal(pace(0, 0), '—');
  const fast = estimateKcal('run', 25, 70, 5);
  const slow = estimateKcal('run', 35, 70, 5);
  assert.ok(fast / 25 > slow / 35, 'faster pace burns more per minute');
  assert.ok(estimateKcal('badminton', 60, 70, null, { format: 'singles', level: 'competitive', games: 3, won: 1 }) > estimateKcal('badminton', 60, 70, null, { format: 'doubles', level: 'casual', games: 3, won: 1 }));
  assert.equal(acceptFix(undefined, [0, 0, 0], 50, 'run'), false, 'inaccurate fixes are dropped');
  assert.equal(acceptFix([0, 0, 0], [0, 0.001, 1000], 10, 'walk'), false, '111 m in 1 s is not walking');
  // A straight 2.1 km track at 5:00/km gives two splits of 5 min.
  // ~101 m per point every 30 s ⇒ each km is crossed after exactly 10 points = 5:00.
  const pts: Pt[] = Array.from({ length: 22 }, (_, i) => [0, i * 0.00091, i * 30_000]);
  assert.ok(Math.abs(trackDistanceKm(pts) - 2.13) < 0.02);
  assert.deepEqual(splits(pts).map((m) => Math.round(m)), [5, 5]);
});

test('exercise library has unique names', () => {
  const names = EXERCISES.map((e) => e.name);
  assert.equal(new Set(names).size, names.length);
  assert.ok(names.length > 200);
});

test('diet filtering: vegetarian means no meat, fish or eggs', async () => {
  const { allowedFor, foodKind } = await import('../web/src/core/foods.ts');
  assert.equal(foodKind('chicken-biryani'), 'meat');
  assert.equal(foodKind('omelette'), 'egg');
  assert.equal(foodKind('poha-kanda'), 'veg', '"kanda" contains "anda" but is onion poha');
  assert.equal(foodKind('subway-6-veg'), 'veg', '"veggie" contains "egg"');
  assert.equal(allowedFor('veg', 'egg-bhurji'), false);
  assert.equal(allowedFor('egg', 'egg-bhurji'), true);
  assert.equal(allowedFor('egg', 'fish-curry'), false);
  assert.equal(allowedFor('veg', 'paneer-bhurji'), true);
  const vegFixes = proteinFixes(40, FOODS.filter((f) => allowedFor('veg', f.id)), []);
  assert.ok(vegFixes.length > 0 && vegFixes.every((f) => foodKind(f.food.id) === 'veg'));
});

test('route marks for the 3D map', async () => {
  const { kmMarks, climb, resample, bearing } = await import('../web/src/core/sport.ts');
  // ~101 m every 30 s for 2 km, then a faster third km (20 s per point).
  const pts: Pt[] = Array.from({ length: 31 }, (_, i) => [0, i * 0.00091, i <= 20 ? i * 30_000 : 600_000 + (i - 20) * 20_000]);
  const m = kmMarks(pts);
  assert.deepEqual(m.map((x) => x.km), [1, 2, 3]);
  assert.equal(m.find((x) => x.fastest)?.km, 3, 'the quickest km is flagged');
  // 200→210 counts (+10); the 2 m blip to 212 doesn't; 210→205 counts (−5).
  assert.deepEqual(climb([200, 201, 199, 200, 210, 212, 205]), { up: 10, down: 5 }, 'sub-3 m wobble is ignored');
  assert.ok(resample(pts, 300).length < pts.length);
  assert.ok(Math.abs(bearing([0, 0, 0], [0, 1, 0]) - 90) < 0.01, 'due east is 90°');
});
