// Every exercise and warm-up drill can be shown: a photo pair, a drawn figure, or the breathing guide.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EXERCISES } from '../web/src/core/exercises.ts';
import { DEFAULT_TEMPLATES } from '../web/src/core/gym.ts';
import { cooldownFor, warmupFor } from '../web/src/core/warmup.ts';
import { demoId } from '../web/src/core/exerciseDemos.ts';
import { BONES, FIGURES, cycleOf, figureFor, frameOf, isBreathing, joints, poseAt } from '../web/src/core/figures.ts';

const shown = (n: string) => !!demoId(n) || !!figureFor(n) || isBreathing(n);

test('every library exercise, template lift and drill has a demo', () => {
  const drills = (['push', 'pull', 'legs', 'upper', 'lower', 'rest'] as const).flatMap((t) => [...warmupFor(t, { name: 'Barbell Bench Press', sets: 3, reps: '5' }, 60), ...(t === 'rest' ? [] : [cooldownFor(t)])].flatMap((p) => p.drills.map((d) => d.name)));
  const ramp = new Set(['Barbell Bench Press']);
  const missing = [...EXERCISES.map((e) => e.name), ...Object.values(DEFAULT_TEMPLATES).flat().map((e) => e.name), ...drills.filter((d) => !ramp.has(d))].filter((n) => !shown(n));
  assert.deepEqual([...new Set(missing)], []);
  assert.equal(demoId('Chin-up (biceps focus)'), demoId('Chin-up'));
});

test('figures never stretch a limb, and planted feet stay planted', () => {
  const dist = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  for (const [name, f] of Object.entries(FIGURES)) {
    assert.ok(f.keys.length >= 2, `${name}: needs at least two poses`);
    const total = cycleOf(f);
    for (let s = 0; s < total; s += total / 60) {
      const j = joints(poseAt(f, s), f.view);
      for (const [a, b, len] of [['shoulderF', 'elbowF', BONES.upperArm], ['elbowF', 'handF', BONES.foreArm], ['hipF', 'kneeF', BONES.thigh], ['kneeF', 'ankleF', BONES.shin], ['shoulderB', 'elbowB', BONES.upperArm], ['hipB', 'kneeB', BONES.thigh]] as const)
        assert.ok(Math.abs(dist(j[a], j[b]) - len) < 0.05, `${name} at ${s.toFixed(2)}s: ${a}–${b} is ${dist(j[a], j[b]).toFixed(2)}, not ${len}`);
      if (f.floor !== false) assert.ok(Math.max(j.ankleF[1], j.ankleB[1], j.handF[1]) < 74, `${name}: through the floor`);
    }
    const [x, y, w, h] = frameOf(f);
    assert.ok([x, y, w, h].every(Number.isFinite) && Math.abs(w / h - 1.5) < 0.01, `${name}: bad frame`);
  }
  // Ankle rocks: the front foot doesn't slide while the knee travels forward.
  const rocks = FIGURES['Ankle rocks'];
  const a0 = joints(poseAt(rocks, 0), 'side').ankleF;
  const a1 = joints(poseAt(rocks, 1.2), 'side').ankleF;
  assert.ok(dist(a0, a1) < 0.5);
});
