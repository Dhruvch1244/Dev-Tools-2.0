// Muscle tallies and the weekly gym report.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contribution, muscleSets, weekReport } from '../web/src/core/gymStats.ts';
import { dayTypeOn } from '../web/src/core/gym.ts';

test('contribution: primary 1, compounds add fractional secondaries, isolation stays isolated', () => {
  assert.deepEqual(contribution('Barbell Bench Press'), { Chest: 1, Shoulders: 0.5, Triceps: 0.5 });
  assert.equal(contribution('Barbell Row').Biceps, 0.5);
  assert.equal(contribution('Romanian Deadlift').Glutes, 0.5);
  assert.equal(contribution('Romanian Deadlift').Traps, undefined);
  assert.deepEqual(contribution('Leg Press Calf Raise'), { Calves: 1 });
  assert.equal(contribution('Lying Leg Curl').Forearms, undefined);
  assert.equal(contribution('Barbell Curl').Forearms, 0.25);
  assert.deepEqual(contribution('Upright Row'), { Shoulders: 1 });
  assert.deepEqual(contribution('Not A Real Lift'), {});
});

test('muscleSets sums fractional sets', () => {
  const m = muscleSets([{ exercise: 'Barbell Bench Press' }, { exercise: 'Barbell Bench Press' }, { exercise: 'Triceps Pushdown' }]);
  assert.equal(m.Chest, 2);
  assert.equal(m.Triceps, 2);
});

test('weekReport: ranges, push/pull balance, PRs and flags', () => {
  const w = [{ id: 'old', date: '2026-10-20', day_type: 'push', finished_at: 'x' }, { id: 'a', date: '2026-10-26', day_type: 'push', finished_at: 'x' }];
  const sets = [
    { workout_id: 'old', date: '2026-10-20', exercise: 'Barbell Bench Press', weight: 60, reps: 8 },
    ...Array.from({ length: 12 }, () => ({ workout_id: 'a', date: '2026-10-26', exercise: 'Barbell Bench Press', weight: 65, reps: 8 })),
  ];
  const r = weekReport('2026-10-29', sets, w, (d) => dayTypeOn(d));
  assert.equal(r.from, '2026-10-23');
  assert.equal(r.sessions, 1);
  assert.equal(r.planned, 5);
  assert.equal(r.muscles.find((m) => m.muscle === 'Chest')!.status, 'ok');
  assert.equal(r.muscles.find((m) => m.muscle === 'Back')!.status, 'low');
  assert.deepEqual(r.prs, [{ exercise: 'Barbell Bench Press', weight: 65, reps: 8 }]);
  assert.equal(r.pushPull, null);
  assert.ok(r.flags.some((f) => f.startsWith('Under-trained')));
  assert.ok(r.flags.some((f) => f.includes('1/5')));
  assert.ok(r.volumeChange! > 30);
});
