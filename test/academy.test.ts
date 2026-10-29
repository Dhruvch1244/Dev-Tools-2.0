// The Academy: course data is well-formed and predict questions are correct by construction.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COURSES, isGraded, predictQuestions, starsFor, unlocked } from '../web/src/core/dsa/course.ts';
import { ALGOS } from '../web/src/core/dsa/viz.ts';
import { COURSE_ALGOS } from '../web/src/core/dsa/courseViz.ts';

const algo = (id: string) => [...ALGOS, ...COURSE_ALGOS].find((a) => a.id === id);
const run = (id: string, inputs?: Record<string, string>) => {
  const a = algo(id)!;
  return a.run({ ...Object.fromEntries(a.inputs.map((i) => [i.key, i.value])), ...inputs });
};

test('every card is answerable and every sim exists', () => {
  const ids = new Set<string>();
  for (const c of COURSES)
    for (const m of c.modules) {
      assert.ok(!ids.has(m.id), `duplicate module ${m.id}`);
      ids.add(m.id);
      assert.ok(m.cards.some(isGraded), `${m.id} has nothing to answer`);
      for (const card of m.cards) {
        if (card.kind === 'mcq' || card.kind === 'blank') assert.ok(card.answer >= 0 && card.answer < card.choices.length, `${m.id}: answer out of range`);
        if (card.kind === 'bug') assert.ok(card.bug < card.code.split('\n').length, `${m.id}: bug line out of range`);
        if (card.kind === 'speed') for (const it of card.items) assert.ok(it.answer < it.choices.length);
        if (card.kind === 'match') assert.equal(new Set(card.pairs.map((p) => p[1])).size, card.pairs.length);
        if (card.kind === 'order') assert.equal(new Set(card.lines).size, card.lines.length, `${m.id}: duplicate order lines`);
        if (card.kind === 'sim' || card.kind === 'predict' || (card.kind === 'learn' && card.viz)) {
          const id = card.kind === 'learn' ? card.viz!.algo : card.algo;
          assert.ok(algo(id), `${m.id}: unknown sim ${id}`);
          assert.ok(run(id, card.kind === 'learn' ? card.viz!.inputs : card.inputs).length > 2, `${m.id}: ${id} produced no frames`);
        }
        if (card.kind === 'predict') assert.ok(predictQuestions(run(card.algo, card.inputs), card.var, card.questions).length >= 2, `${m.id}: too few predict questions for ${card.var}`);
      }
    }
});

test('course sims compute the right answers', () => {
  const last = (id: string, inputs?: Record<string, string>) => run(id, inputs).at(-1)!;
  assert.equal(last('prefix-hash', { nums: '3, 4, 7, 2, -3, 1, 4, 2', k: '7' }).vars!.count, 4);
  assert.equal(last('trap-water').vars!.water, 6);
  assert.equal(last('trap-water', { h: '4, 2, 0, 3, 2, 5' }).vars!.water, 9);
  assert.equal(last('first-missing-positive', { nums: '7, 8, 9, 11, 12' }).vars!.answer, 1);
  assert.equal(last('first-missing-positive', { nums: '1, 2, 0' }).vars!.answer, 3);
  assert.deepEqual(last('product-except-self').arrays!.find((a) => a.name === 'answer')!.values, [24, 12, 8, 6]);
  assert.deepEqual(last('sliding-max').arrays!.find((a) => a.name === 'max per window')!.values, [3, 3, 5, 5, 6, 7]);
  assert.deepEqual(last('move-zeroes').arrays![0].values, [1, 3, 12, 0, 0]);
  assert.equal(last('two-sum-hash').vars!.found, true);
});

test('predict: answer is the next frame value and always among 4 distinct choices', () => {
  const frames = run('prefix-hash');
  const qs = predictQuestions(frames, 'count', 3);
  assert.ok(qs.length >= 2);
  for (const q of qs) {
    assert.equal(q.answer, frames[q.at + 1].vars!.count);
    assert.ok(q.choices.includes(q.answer));
    assert.equal(new Set(q.choices).size, q.choices.length);
  }
});

test('stars and unlocking', () => {
  assert.equal(starsFor(0, 8), 3);
  assert.equal(starsFor(2, 8), 2);
  assert.equal(starsFor(5, 8), 1);
  const c = COURSES[0];
  assert.deepEqual([...unlocked(c, {})], [c.modules[0].id]);
  assert.deepEqual([...unlocked(c, { [c.modules[0].id]: 2 })], [c.modules[0].id, c.modules[1].id]);
});

test('week 3-4 sims compute the right answers', () => {
  const last = (id: string, inputs?: Record<string, string>) => run(id, inputs).at(-1)!;
  assert.equal(last('bs-first').vars!.answer, 4);
  assert.equal(last('bs-first', { nums: '1, 3, 5', t: '9' }).vars!.answer, 3);
  assert.equal(last('koko').vars!.answer, 4);
  assert.equal(last('koko', { piles: '30, 11, 23, 4, 20', h: '6' }).vars!.answer, 23);
  assert.equal(last('rotated-min').vars!.answer, 0);
  assert.equal(last('rotated-min', { nums: '11, 13, 15, 17' }).vars!.answer, 11);
  assert.equal(last('histogram').vars!.best, 10);
  assert.equal(last('rpn').vars!.top, 12);
  assert.equal(last('rpn', { tokens: '10 6 9 3 + -11 * / * 17 + 5 +' }).vars!.top, 22);
  assert.equal(last('valid-parens').vars!.valid, false);
  assert.equal(last('valid-parens', { s: '()[]{}' }).vars!.valid, true);
  assert.deepEqual(last('next-greater').arrays!.find((a) => a.name === 'next greater')!.values, [4, 2, 4, 5, 5, 5, -1]);
});
