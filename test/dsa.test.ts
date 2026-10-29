// DSA plan, visualizers and their code-line mapping.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ALL_PRACTICE, MEGAS, WEEKS, currentWeek, problemsForDay } from '../web/src/core/dsa/plan.ts';
import { ALGOS, framesFromEvents } from '../web/src/core/dsa/viz.ts';
import { VIZ_CODE, parseMarked } from '../web/src/core/dsa/vizCode.ts';
import { mastery, pickMock } from '../web/src/core/dsa/mastery.ts';

test('season plan: 13 rounds × 12, no duplicate problems anywhere', () => {
  assert.equal(WEEKS.length, 13);
  assert.ok(WEEKS.every((w) => w.problems.length === 12 && w.test.length === 3));
  const all = [...ALL_PRACTICE, ...WEEKS.flatMap((w) => w.test), ...MEGAS.flatMap((m) => m.problems)].map((p) => p.id);
  assert.equal(new Set(all).size, all.length);
});

test('calendar maths', () => {
  assert.equal(currentWeek('2026-11-02', '2026-11-01'), 0);
  assert.equal(currentWeek('2026-11-02', '2026-11-10'), 2);
  assert.deepEqual(problemsForDay('2026-11-02', '2026-11-02').map((p) => p.id), ['product-of-array-except-self', 'subarray-sum-equals-k']);
  assert.deepEqual(problemsForDay('2026-11-02', '2026-11-08'), [], 'Sunday is qualifying');
});

const run = (id: string, inp?: Record<string, string>) => {
  const a = ALGOS.find((x) => x.id === id)!;
  return a.run(inp ?? Object.fromEntries(a.inputs.map((i) => [i.key, i.value])));
};

test('visualizers reach the right answers', () => {
  assert.match(run('heap', { nums: '3,2,1,5,6,4,8,7', k: '4' }).at(-1)!.msg, /Root = 5/);
  assert.match(run('coin-change', { coins: '1,3,4', amt: '10' }).at(-1)!.msg, /: 3\./);
  assert.match(run('lcs', { a: 'abcbdab', b: 'bdcaba' }).at(-1)!.msg, /length 4/);
  assert.match(run('binary-search', { a: '1,3,3,5,7,7,7,9', t: '7' }).at(-1)!.msg, /index 4/);
  assert.match(run('two-pointers', { h: '1,8,6,2,5,4,8,3,7' }).at(-1)!.msg, /49/);
  assert.match(run('dijkstra').at(-1)!.msg, /F=14/);
  assert.match(run('topo-sort', { e: 'a->b, b->c, c->a' }).at(-1)!.msg, /Cycle/);
  assert.match(run('grid-bfs').at(-1)!.msg, /after 5 minute/);
});

test('every frame line exists in the C++, Java and Python reference code', () => {
  for (const a of ALGOS) {
    const used = new Set(run(a.id).map((f) => f.line).filter(Boolean));
    for (const lang of ['cpp', 'java', 'py'] as const) {
      const { code, lines } = parseMarked(VIZ_CODE[a.id][lang]);
      assert.deepEqual([...used].filter((l) => !(l! in lines)), [], `${a.id}/${lang}`);
      assert.doesNotMatch(code, /@\w/, `${a.id}/${lang} leaks a marker`);
    }
  }
});

test('runner viz events fold into frames', () => {
  const f = framesFromEvents([{ op: 'array', name: 'a', value: [1, 2] }, { op: 'ptr', name: 'i', target: 'a', index: 1 }, { op: 'step', msg: 'x' }]);
  assert.equal(f.length, 1);
  assert.deepEqual(f[0].arrays?.[0].pointers, [{ name: 'i', index: 1 }]);
});

test('mastery and mock picking', () => {
  const m = mastery([], []);
  assert.equal(m.length, 13);
  assert.ok(m.every((x) => x.value === 0));
  const p = pickMock([], [], 2);
  assert.ok(p && p.week <= 2 && p.diff !== 'E');
});
