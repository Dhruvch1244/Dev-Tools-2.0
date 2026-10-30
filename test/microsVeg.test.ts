// Micro suggestions follow the diet (vegetarian: no meat, fish or eggs) and favour what you eat.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FOODS, allowedFor, foodKind } from '../web/src/core/foods.ts';
import { MICRO_ORDER, microTargets, richIn } from '../web/src/core/micros.ts';

test('vegetarian suggestions never include meat, fish or eggs', () => {
  const t = microTargets('male', 2400);
  for (const key of MICRO_ORDER)
    for (const { food } of richIn(key, FOODS, t[key], 12, { allowed: (id) => allowedFor('veg', id) })) assert.equal(foodKind(food.id), 'veg', `${key}: ${food.id}`);
});

test('foods you already eat rank first', () => {
  const t = microTargets('male', 2400);
  const plain = richIn('iron', FOODS, t.iron, 8, { allowed: (id) => allowedFor('veg', id) });
  const pick = plain.at(-1)!.food.id;
  const mine = richIn('iron', FOODS, t.iron, 8, { allowed: (id) => allowedFor('veg', id), liked: new Set([pick]) });
  assert.ok(mine.findIndex((x) => x.food.id === pick) < plain.length - 1);
  assert.ok(mine.find((x) => x.food.id === pick)!.liked);
});
