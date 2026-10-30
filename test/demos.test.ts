// Every exercise and warm-up drill can be shown: a photo pair, a drawn figure, or the breathing guide.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EXERCISES } from '../web/src/core/exercises.ts';
import { DEFAULT_TEMPLATES } from '../web/src/core/gym.ts';
import { cooldownFor, warmupFor } from '../web/src/core/warmup.ts';
import { demoId } from '../web/src/core/exerciseDemos.ts';
import { FIGURES, figureFor, isBreathing } from '../web/src/core/figures.ts';

const shown = (n: string) => !!demoId(n) || !!figureFor(n) || isBreathing(n);

test('every library exercise, template lift and drill has a demo', () => {
  const drills = (['push', 'pull', 'legs', 'upper', 'lower', 'rest'] as const).flatMap((t) => [...warmupFor(t, { name: 'Barbell Bench Press', sets: 3, reps: '5' }, 60), ...(t === 'rest' ? [] : [cooldownFor(t)])].flatMap((p) => p.drills.map((d) => d.name)));
  const ramp = new Set(['Barbell Bench Press']);
  const missing = [...EXERCISES.map((e) => e.name), ...Object.values(DEFAULT_TEMPLATES).flat().map((e) => e.name), ...drills.filter((d) => !ramp.has(d))].filter((n) => !shown(n));
  assert.deepEqual([...new Set(missing)], []);
  assert.equal(demoId('Chin-up (biceps focus)'), demoId('Chin-up'));
});

test('figures are well-formed and stay in the frame', () => {
  for (const [name, f] of Object.entries(FIGURES)) {
    assert.ok(f.poses.length >= 2, `${name}: needs at least two poses`);
    for (const p of f.poses)
      for (const [joint, [x, y]] of Object.entries(p)) assert.ok(x >= 0 && x <= 120 && y >= 0 && y <= 80, `${name}.${joint} out of frame`);
  }
});
