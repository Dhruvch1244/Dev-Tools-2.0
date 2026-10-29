// Warm-ups fit the day, ramp to the working weight, and cool-downs stretch what was trained.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cooldownFor, minutesOf, rampSets, warmupFor } from '../web/src/core/warmup.ts';

test('warm-up phases per day type', () => {
  const legs = warmupFor('legs', { name: 'Back Squat', sets: 4, reps: '5' }, 100);
  assert.deepEqual(legs.map((p) => p.id), ['raise', 'mobilise', 'activate', 'ramp']);
  assert.deepEqual(legs[3].drills.map((d) => d.dose), ['40 kg × 10', '60 kg × 5', '80 kg × 2']);
  assert.deepEqual(warmupFor('rest').map((p) => p.id), ['raise', 'flow']);
  assert.ok(minutesOf(warmupFor('push')) >= 8);
});

test('ramp sets round to 2.5 kg and fall back without history', () => {
  assert.deepEqual(rampSets({ name: 'Bench', sets: 3, reps: '8' }, 62.5).map((d) => d.dose), ['25 kg × 10', '37.5 kg × 5', '50 kg × 2']);
  assert.equal(rampSets({ name: 'Bench', sets: 3, reps: '8' }, null).length, 1);
  assert.equal(rampSets(undefined, 80).length, 0);
});

test('cool-down stretches match the muscles trained', () => {
  const names = (t: Parameters<typeof cooldownFor>[0]) => cooldownFor(t).drills.map((d) => d.name).join(' ');
  assert.match(names('push'), /chest/i);
  assert.match(names('pull'), /biceps/i);
  assert.match(names('legs'), /Couch stretch/);
});
