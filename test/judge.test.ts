// Local judge: generated harnesses actually compile and run in all three languages.
// Uses inline LeetCode metadata (no network). Needs g++, javac/java and python3.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATA_DIR ??= mkdtempSync(join(tmpdir(), 'dt2-test-'));
const { judge, compare, support } = await import('../server/judge.ts');

const twoSum = {
  slug: 'two-sum', id: '1', title: 'Two Sum', difficulty: 'Easy', html: '', tags: [], hints: [], snippets: {},
  meta: { name: 'twoSum', params: [{ name: 'nums', type: 'integer[]' }, { name: 'target', type: 'integer' }], return: { type: 'integer[]' } },
  exampleLines: ['[2,7,11,15]', '9', '[3,2,4]', '6'],
  expected: ['[0,1]', '[1,2]'],
};
const minStack = {
  slug: 'min-stack', id: '155', title: 'Min Stack', difficulty: 'Medium', html: '', tags: [], hints: [], snippets: {},
  meta: { classname: 'MinStack', systemdesign: true, constructor: { params: [] }, methods: [
    { name: 'push', params: [{ name: 'val', type: 'integer' }], return: { type: 'void' } },
    { name: 'pop', params: [], return: { type: 'void' } },
    { name: 'top', params: [], return: { type: 'integer' } },
    { name: 'getMin', params: [], return: { type: 'integer' } },
  ] },
  exampleLines: ['["MinStack","push","push","push","getMin","pop","top","getMin"]', '[[],[-2],[0],[-3],[],[],[],[]]'],
  expected: ['[null,null,null,null,-3,null,0,-2]'],
};

const SOL = {
  cpp: [twoSum, `class Solution { public: vector<int> twoSum(vector<int>& a, int t) { unordered_map<int,int> m; for (int i = 0; i < (int)a.size(); i++) { if (m.count(t - a[i])) return {m[t - a[i]], i}; m[a[i]] = i; } return {}; } };`],
  java: [minStack, `class MinStack { Deque<int[]> s = new ArrayDeque<>(); public MinStack() {} public void push(int v) { s.push(new int[]{v, s.isEmpty() ? v : Math.min(v, s.peek()[1])}); } public void pop() { s.pop(); } public int top() { return s.peek()[0]; } public int getMin() { return s.peek()[1]; } }`],
  py: [twoSum, `class Solution:\n    def twoSum(self, nums: List[int], target: int) -> List[int]:\n        seen = {}\n        for i, x in enumerate(nums):\n            if target - x in seen: return [seen[target - x], i]\n            seen[x] = i`],
} as const;

for (const [lang, [q, code]] of Object.entries(SOL)) {
  test(`judge passes a correct ${lang} solution`, { timeout: 60_000 }, async () => {
    assert.equal(support(q as never).ok, true);
    const r = await judge(q as never, lang as never, code);
    assert.equal(r.phase, 'run', r.stderr);
    assert.deepEqual(r.results.map((x) => x.pass), q.expected.map(() => true), JSON.stringify(r.results));
  });
}

test('judge reports wrong answers and compile errors', { timeout: 60_000 }, async () => {
  const wrong = await judge(twoSum as never, 'py', 'class Solution:\n    def twoSum(self, nums, target):\n        return [0, 0]');
  assert.deepEqual(wrong.results.map((x) => x.pass), [false, false]);
  const ce = await judge(twoSum as never, 'cpp', 'class Solution { public: vector<int> twoSum(vector<int>& a, int t) { return oops; } };');
  assert.equal(ce.phase, 'compile');
});

test('output comparison', () => {
  assert.equal(compare('2.50000', '2.5', false), true);
  assert.equal(compare('[[1,2],[3]]', '[[3],[2,1]]', true), true);
  assert.equal(compare('[[1,2],[3]]', '[[3],[2,1]]', false), false);
  assert.equal(compare('"bab"', '"bab"', false), true);
  assert.equal(compare('[null, null, 1]', '[null,null,1]', false), true);
});
