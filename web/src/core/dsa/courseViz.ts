// Extra step-through sims for the Academy lessons, in the same frame format as viz.ts so the same
// player renders them. Pure: no React / DOM.

import type { Algo, Frame, Mark } from './viz';

const nums = (s: string) => s.split(/[\s,]+/).filter(Boolean).map(Number).filter((n) => !Number.isNaN(n));
function recorder() {
  const frames: Frame[] = [];
  return { frames, push: (f: Frame) => frames.length < 400 && frames.push(structuredClone(f)) };
}

const twoSumHash: Algo = {
  id: 'two-sum-hash',
  title: 'Two Sum with a hash map',
  pattern: 'Hashing',
  problem: 'two-sum',
  blurb: 'For each number ask: have I already seen target − x? One pass, O(n).',
  inputs: [
    { key: 'nums', label: 'nums', value: '3, 8, 4, 11, 5, 1' },
    { key: 't', label: 'target', value: '9' },
  ],
  run(inp) {
    const a = nums(inp.nums);
    const t = Number(inp.t) || 0;
    const { frames, push } = recorder();
    const seen = new Map<number, number>();
    const map = (mark?: number) => ({ name: 'seen (value → index)', values: [...seen].map(([v, i]) => `${v}→${i}`), marks: mark != null ? { [[...seen.keys()].indexOf(mark)]: 'hit' as Mark } : {} });
    push({ msg: 'Empty map. Walk left to right.', arrays: [{ name: 'nums', values: a }, map()], vars: { need: '-', found: false } });
    for (let i = 0; i < a.length; i++) {
      const need = t - a[i];
      if (seen.has(need)) {
        push({ msg: `need = ${t} − ${a[i]} = ${need}. Seen at index ${seen.get(need)}! Answer [${seen.get(need)}, ${i}].`, arrays: [{ name: 'nums', values: a, pointers: [{ name: 'i', index: i }], marks: { [seen.get(need)!]: 'hit', [i]: 'hit' } }, map(need)], vars: { need, found: true } });
        return frames;
      }
      push({ msg: `need = ${t} − ${a[i]} = ${need}. Not seen yet.`, arrays: [{ name: 'nums', values: a, pointers: [{ name: 'i', index: i }] }, map()], vars: { need, found: false } });
      seen.set(a[i], i);
      push({ msg: `Store ${a[i]} → ${i} for later numbers to find.`, arrays: [{ name: 'nums', values: a, pointers: [{ name: 'i', index: i }] }, map()], vars: { need, found: false } });
    }
    push({ msg: 'No pair found.', arrays: [{ name: 'nums', values: a }, map()], vars: { need: '-', found: false } });
    return frames;
  },
};

const prefixBuild: Algo = {
  id: 'prefix-build',
  title: 'Building a prefix-sum array',
  pattern: 'Prefix sums',
  problem: 'range-sum-query-immutable',
  blurb: 'prefix[i+1] = prefix[i] + nums[i]; then any range sum is one subtraction.',
  inputs: [
    { key: 'nums', label: 'nums', value: '3, 1, 4, 1, 5, 9' },
    { key: 'l', label: 'query l', value: '1' },
    { key: 'r', label: 'query r', value: '4' },
  ],
  run(inp) {
    const a = nums(inp.nums);
    const { frames, push } = recorder();
    const p: (number | null)[] = [0, ...a.map(() => null)];
    let running = 0;
    push({ msg: 'prefix has one extra slot: prefix[0] = 0 (the sum of nothing).', arrays: [{ name: 'nums', values: a }, { name: 'prefix', values: p, marks: { 0: 'active' } }], vars: { running } });
    for (let i = 0; i < a.length; i++) {
      running += a[i];
      p[i + 1] = running;
      push({ msg: `prefix[${i + 1}] = prefix[${i}] + nums[${i}] = ${running - a[i]} + ${a[i]} = ${running}`, arrays: [{ name: 'nums', values: a, pointers: [{ name: 'i', index: i }], window: [0, i] }, { name: 'prefix', values: p, marks: { [i + 1]: 'active' } }], vars: { running } });
    }
    const l = Math.max(0, Math.min(a.length - 1, Number(inp.l) || 0));
    const r = Math.max(l, Math.min(a.length - 1, Number(inp.r) || 0));
    const ans = (p[r + 1] as number) - (p[l] as number);
    push({ msg: `sum(nums[${l}..${r}]) = prefix[${r + 1}] − prefix[${l}] = ${p[r + 1]} − ${p[l]} = ${ans}`, arrays: [{ name: 'nums', values: a, window: [l, r] }, { name: 'prefix', values: p, marks: { [r + 1]: 'hit', [l]: 'swap' } }], vars: { running, answer: ans } });
    return frames;
  },
};

const productExceptSelf: Algo = {
  id: 'product-except-self',
  title: 'Product of array except self',
  pattern: 'Prefix & suffix',
  problem: 'product-of-array-except-self',
  blurb: 'Pass 1 writes the product of everything to the left; pass 2 multiplies in everything to the right. No division.',
  inputs: [{ key: 'nums', label: 'nums', value: '1, 2, 3, 4' }],
  run(inp) {
    const a = nums(inp.nums);
    const n = a.length;
    const { frames, push } = recorder();
    const out: (number | null)[] = a.map(() => null);
    let left = 1;
    push({ msg: 'answer[i] = (product left of i) × (product right of i).', arrays: [{ name: 'nums', values: a }, { name: 'answer', values: out }], vars: { left, right: 1 } });
    for (let i = 0; i < n; i++) {
      out[i] = left;
      push({ msg: `answer[${i}] = left = ${left}. Then left × nums[${i}] → ${left * a[i]}.`, arrays: [{ name: 'nums', values: a, pointers: [{ name: 'i', index: i }], window: i > 0 ? [0, i - 1] : undefined }, { name: 'answer', values: out, marks: { [i]: 'active' } }], vars: { left, right: 1 } });
      left *= a[i];
    }
    let right = 1;
    for (let i = n - 1; i >= 0; i--) {
      out[i] = (out[i] as number) * right;
      push({ msg: `answer[${i}] ×= right (${right}) → ${out[i]}. Then right × nums[${i}] → ${right * a[i]}.`, arrays: [{ name: 'nums', values: a, pointers: [{ name: 'i', index: i }], window: i < n - 1 ? [i + 1, n - 1] : undefined }, { name: 'answer', values: out, marks: { [i]: 'hit' } }], vars: { left, right } });
      right *= a[i];
    }
    push({ msg: `Done: [${out.join(', ')}] — O(n) time, O(1) extra space.`, arrays: [{ name: 'nums', values: a }, { name: 'answer', values: out }], vars: { left, right } });
    return frames;
  },
};

const firstMissing: Algo = {
  id: 'first-missing-positive',
  title: 'First missing positive (index as hash)',
  pattern: 'Cyclic placement',
  problem: 'first-missing-positive',
  blurb: 'Swap each value v into slot v−1. Afterwards the first slot holding the wrong value names the answer.',
  inputs: [{ key: 'nums', label: 'nums', value: '3, 4, -1, 1' }],
  run(inp) {
    const a = nums(inp.nums);
    const n = a.length;
    const { frames, push } = recorder();
    push({ msg: `The answer is in 1..${n + 1}. Put every v in 1..${n} at index v−1.`, arrays: [{ name: 'nums', values: [...a] }], vars: { swaps: 0 } });
    let swaps = 0;
    for (let i = 0; i < n; i++) {
      while (a[i] >= 1 && a[i] <= n && a[a[i] - 1] !== a[i]) {
        const j = a[i] - 1;
        [a[i], a[j]] = [a[j], a[i]];
        swaps++;
        push({ msg: `Swap ${a[j]} into its home index ${j}.`, arrays: [{ name: 'nums', values: [...a], pointers: [{ name: 'i', index: i }], marks: { [i]: 'swap', [j]: 'swap' } }], vars: { swaps } });
      }
      push({ msg: `Index ${i}: ${a[i] >= 1 && a[i] <= n ? (a[i] === i + 1 ? 'in place' : `${a[i]} is a duplicate of a placed value — leave it`) : `${a[i]} is out of range — ignore`}.`, arrays: [{ name: 'nums', values: [...a], pointers: [{ name: 'i', index: i }], marks: a[i] === i + 1 ? { [i]: 'done' } : { [i]: 'dim' } }], vars: { swaps } });
    }
    const miss = a.findIndex((v, i) => v !== i + 1);
    const ans = miss < 0 ? n + 1 : miss + 1;
    push({ msg: `Scan: first index where nums[i] ≠ i+1 → answer ${ans}.`, arrays: [{ name: 'nums', values: [...a], marks: miss >= 0 ? { [miss]: 'hit' } : {} }], vars: { swaps, answer: ans } });
    return frames;
  },
};

const moveZeroes: Algo = {
  id: 'move-zeroes',
  title: 'Read / write pointers — move zeroes',
  pattern: 'Two pointers (same direction)',
  problem: 'move-zeroes',
  blurb: '`write` marks where the next keeper goes; `read` scans. Every non-zero is swapped down to `write`.',
  inputs: [{ key: 'nums', label: 'nums', value: '0, 1, 0, 3, 12' }],
  run(inp) {
    const a = nums(inp.nums);
    const { frames, push } = recorder();
    let write = 0;
    push({ msg: 'write = 0. Everything left of write is a kept (non-zero) value.', arrays: [{ name: 'nums', values: [...a], pointers: [{ name: 'W', index: 0 }] }], vars: { write } });
    for (let read = 0; read < a.length; read++) {
      if (a[read] !== 0) {
        [a[write], a[read]] = [a[read], a[write]];
        push({ msg: `nums[${read}] = ${a[write]} is non-zero → swap to write (${write}), then write++.`, arrays: [{ name: 'nums', values: [...a], pointers: [{ name: 'R', index: read }, { name: 'W', index: write }], marks: { [write]: 'hit' } }], vars: { write: write + 1 } });
        write++;
      } else {
        push({ msg: `nums[${read}] is 0 → skip; write stays ${write}.`, arrays: [{ name: 'nums', values: [...a], pointers: [{ name: 'R', index: read }, { name: 'W', index: write }], marks: { [read]: 'dim' } }], vars: { write } });
      }
    }
    push({ msg: `Done: [${a.join(', ')}] — order kept, in place, O(n).`, arrays: [{ name: 'nums', values: [...a] }], vars: { write } });
    return frames;
  },
};

const slidingMax: Algo = {
  id: 'sliding-max',
  title: 'Sliding window maximum (monotonic deque)',
  pattern: 'Monotonic deque',
  problem: 'sliding-window-maximum',
  blurb: 'Keep indices whose values decrease front→back. The front is the window max; drop it once it slides out.',
  inputs: [
    { key: 'nums', label: 'nums', value: '1, 3, -1, -3, 5, 3, 6, 7' },
    { key: 'k', label: 'k', value: '3' },
  ],
  run(inp) {
    const a = nums(inp.nums);
    const k = Math.max(1, Number(inp.k) || 1);
    const { frames, push } = recorder();
    const dq: number[] = [];
    const out: number[] = [];
    const show = (i: number, extra: Record<number, Mark> = {}) => [
      { name: 'nums', values: a, pointers: [{ name: 'i', index: i }], window: [Math.max(0, i - k + 1), i] as [number, number], marks: extra },
      { name: 'deque (values)', values: dq.map((j) => a[j]) },
      { name: 'max per window', values: out },
    ];
    for (let i = 0; i < a.length; i++) {
      while (dq.length && dq[0] <= i - k) {
        const j = dq.shift()!;
        push({ msg: `Index ${j} left the window → pop front.`, arrays: show(i, { [j]: 'dim' }), vars: { front: dq.length ? a[dq[0]] : '-' } });
      }
      while (dq.length && a[dq.at(-1)!] <= a[i]) {
        const j = dq.pop()!;
        push({ msg: `${a[j]} ≤ ${a[i]} can never be a max again → pop back.`, arrays: show(i, { [j]: 'swap' }), vars: { front: dq.length ? a[dq[0]] : '-' } });
      }
      dq.push(i);
      if (i >= k - 1) out.push(a[dq[0]]);
      push({ msg: `Push ${a[i]}.${i >= k - 1 ? ` Window max = front = ${a[dq[0]]}.` : ' Window not full yet.'}`, arrays: show(i, { [dq[0]]: 'hit' }), vars: { front: a[dq[0]] } });
    }
    return frames;
  },
};

const trapWater: Algo = {
  id: 'trap-water',
  title: 'Trapping rain water — two pointers',
  pattern: 'Two pointers',
  problem: 'trapping-rain-water',
  blurb: 'Water over a bar = min(maxLeft, maxRight) − height. Settle the side with the smaller max — it is already decided.',
  inputs: [{ key: 'h', label: 'heights', value: '0, 1, 0, 2, 1, 0, 1, 3, 2, 1, 2, 1' }],
  run(inp) {
    const h = nums(inp.h);
    const { frames, push } = recorder();
    let l = 0;
    let r = h.length - 1;
    let lm = 0;
    let rm = 0;
    let water = 0;
    const filled: (number | null)[] = h.map(() => null);
    const show = (marks: Record<number, Mark> = {}) => [{ name: 'height', values: h, pointers: [{ name: 'L', index: l }, { name: 'R', index: r }], window: [l, r] as [number, number], marks }, { name: 'water above', values: filled }];
    push({ msg: 'Pointers at both ends; leftMax = rightMax = 0.', arrays: show(), vars: { leftMax: lm, rightMax: rm, water } });
    while (l < r) {
      if (h[l] < h[r]) {
        lm = Math.max(lm, h[l]);
        const add = lm - h[l];
        water += add;
        filled[l] = add;
        push({ msg: `h[L] < h[R] → left side is bounded by leftMax ${lm}: +${add} water at ${l}.`, arrays: show({ [l]: add ? 'hit' : 'active' }), vars: { leftMax: lm, rightMax: rm, water } });
        l++;
      } else {
        rm = Math.max(rm, h[r]);
        const add = rm - h[r];
        water += add;
        filled[r] = add;
        push({ msg: `h[R] ≤ h[L] → right side is bounded by rightMax ${rm}: +${add} water at ${r}.`, arrays: show({ [r]: add ? 'hit' : 'active' }), vars: { leftMax: lm, rightMax: rm, water } });
        r--;
      }
    }
    push({ msg: `Total trapped: ${water}.`, arrays: [{ name: 'height', values: h }, { name: 'water above', values: filled }], vars: { leftMax: lm, rightMax: rm, water } });
    return frames;
  },
};

// ---------------------------------------------------------------------------------------------
// Week 3 — binary search
// ---------------------------------------------------------------------------------------------
const bsFirst: Algo = {
  id: 'bs-first',
  title: 'Binary search — first index with nums[i] ≥ target',
  pattern: 'Binary search',
  problem: 'search-insert-position',
  blurb: 'The answer always lives in [lo, hi). ok(mid) true → keep mid (hi = mid); false → discard it (lo = mid + 1).',
  inputs: [
    { key: 'nums', label: 'sorted nums', value: '1, 3, 3, 5, 7, 7, 9, 12' },
    { key: 't', label: 'target', value: '7' },
  ],
  run(inp) {
    const a = nums(inp.nums);
    const t = Number(inp.t);
    const { frames, push } = recorder();
    let lo = 0;
    let hi = a.length;
    const dim = () => Object.fromEntries(a.map((_, i) => [i, 'dim' as Mark]).filter(([i]) => (i as number) < lo || (i as number) >= hi));
    push({ msg: `Answer is somewhere in [0, ${hi}) — ${hi} is allowed: "past the end" means every value < ${t}.`, arrays: [{ name: 'nums', values: a, pointers: [{ name: 'lo', index: lo }, { name: 'hi', index: Math.min(hi, a.length - 1) }] }], vars: { lo, hi, mid: '-' } });
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      const ok = a[mid] >= t;
      push({ msg: `mid = (${lo} + ${hi}) // 2 = ${mid}; nums[mid] = ${a[mid]} ${ok ? '≥' : '<'} ${t}.`, arrays: [{ name: 'nums', values: a, pointers: [{ name: 'lo', index: lo }, { name: 'mid', index: mid }], marks: { ...dim(), [mid]: 'active' } }], vars: { lo, hi, mid } });
      if (ok) hi = mid;
      else lo = mid + 1;
      push({ msg: ok ? `ok(mid) → the answer is mid or left of it: hi = ${hi}.` : `not ok → mid and everything left can't be it: lo = ${lo}.`, arrays: [{ name: 'nums', values: a, pointers: [{ name: 'lo', index: Math.min(lo, a.length - 1) }], marks: dim() }], vars: { lo, hi, mid } });
    }
    push({ msg: `lo == hi == ${lo}: ${lo < a.length ? `first index with value ≥ ${t}` : 'every value is smaller — insert at the end'}.`, arrays: [{ name: 'nums', values: a, marks: lo < a.length ? { [lo]: 'hit' } : {} }], vars: { lo, hi, mid: '-', answer: lo } });
    return frames;
  },
};

const koko: Algo = {
  id: 'koko',
  title: 'Search on the answer — Koko eating bananas',
  pattern: 'Binary search on the answer',
  problem: 'koko-eating-bananas',
  blurb: 'Faster speed never needs more hours, so "can she finish at speed k?" is monotonic — binary search k itself.',
  inputs: [
    { key: 'piles', label: 'piles', value: '3, 6, 7, 11' },
    { key: 'h', label: 'hours', value: '8' },
  ],
  run(inp) {
    const piles = nums(inp.piles);
    const h = Number(inp.h) || 1;
    const { frames, push } = recorder();
    let lo = 1;
    let hi = Math.max(...piles);
    const hoursAt = (k: number) => piles.reduce((acc, p) => acc + Math.ceil(p / k), 0);
    push({ msg: `Speed is between 1 and the biggest pile (${hi}) — faster than that never helps.`, arrays: [{ name: 'piles', values: piles }], vars: { lo, hi, mid: '-', hours: '-' } });
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      const hours = hoursAt(mid);
      push({ msg: `Try k = ${mid}: ${piles.map((p) => `⌈${p}/${mid}⌉`).join(' + ')} = ${hours} h ${hours <= h ? '≤' : '>'} ${h}.`, arrays: [{ name: 'piles', values: piles, marks: Object.fromEntries(piles.map((_, i) => [i, 'active' as Mark])) }], vars: { lo, hi, mid, hours } });
      if (hours <= h) hi = mid;
      else lo = mid + 1;
      push({ msg: hours <= h ? `Finishes in time → maybe slower works too: hi = ${hi}.` : `Too slow → need faster: lo = ${lo}.`, arrays: [{ name: 'piles', values: piles }], vars: { lo, hi, mid, hours } });
    }
    push({ msg: `Minimum speed: ${lo} bananas/hour (${hoursAt(lo)} h).`, arrays: [{ name: 'piles', values: piles }], vars: { lo, hi, mid: '-', hours: hoursAt(lo), answer: lo } });
    return frames;
  },
};

const rotatedMin: Algo = {
  id: 'rotated-min',
  title: 'Minimum in a rotated sorted array',
  pattern: 'Binary search',
  problem: 'find-minimum-in-rotated-sorted-array',
  blurb: 'Compare nums[mid] with nums[hi]: bigger means the drop (the minimum) is to the right of mid.',
  inputs: [{ key: 'nums', label: 'rotated nums', value: '4, 5, 6, 7, 0, 1, 2' }],
  run(inp) {
    const a = nums(inp.nums);
    const { frames, push } = recorder();
    let lo = 0;
    let hi = a.length - 1;
    const dim = () => Object.fromEntries(a.map((_, i) => [i, 'dim' as Mark]).filter(([i]) => (i as number) < lo || (i as number) > hi));
    push({ msg: 'The minimum is where the array "drops". Search [lo, hi] inclusive.', arrays: [{ name: 'nums', values: a, pointers: [{ name: 'lo', index: lo }, { name: 'hi', index: hi }] }], vars: { lo, hi, mid: '-' } });
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      const right = a[mid] > a[hi];
      push({ msg: `mid = ${mid}: nums[mid] = ${a[mid]} ${right ? '>' : '≤'} nums[hi] = ${a[hi]}.`, arrays: [{ name: 'nums', values: a, pointers: [{ name: 'lo', index: lo }, { name: 'mid', index: mid }, { name: 'hi', index: hi }], marks: { ...dim(), [mid]: 'active' } }], vars: { lo, hi, mid } });
      if (right) lo = mid + 1;
      else hi = mid;
      push({ msg: right ? `[mid, hi] isn't sorted → the drop is right of mid: lo = ${lo}.` : `[mid, hi] is sorted → the minimum is mid or left: hi = ${hi}.`, arrays: [{ name: 'nums', values: a, pointers: [{ name: 'lo', index: lo }, { name: 'hi', index: hi }], marks: dim() }], vars: { lo, hi, mid } });
    }
    push({ msg: `Minimum: ${a[lo]} at index ${lo}.`, arrays: [{ name: 'nums', values: a, marks: { [lo]: 'hit' } }], vars: { lo, hi, mid: '-', answer: a[lo] } });
    return frames;
  },
};

// ---------------------------------------------------------------------------------------------
// Week 4 — stacks
// ---------------------------------------------------------------------------------------------
const validParens: Algo = {
  id: 'valid-parens',
  title: 'Valid parentheses — a stack of open brackets',
  pattern: 'Stack',
  problem: 'valid-parentheses',
  blurb: 'Push every opener; a closer must match the top. Valid only if the stack ends empty.',
  inputs: [{ key: 's', label: 's', value: '{[()()]}(' }],
  run(inp) {
    const s = [...(inp.s || '')];
    const pair: Record<string, string> = { ')': '(', ']': '[', '}': '{' };
    const { frames, push } = recorder();
    const st: string[] = [];
    push({ msg: 'Empty stack.', arrays: [{ name: 's', values: s }, { name: 'stack', values: [] }], vars: { depth: 0 } });
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (!(c in pair)) {
        st.push(c);
        push({ msg: `'${c}' opens → push.`, arrays: [{ name: 's', values: s, pointers: [{ name: 'i', index: i }] }, { name: 'stack', values: [...st], marks: { [st.length - 1]: 'active' } }], vars: { depth: st.length } });
      } else if (st.at(-1) === pair[c]) {
        st.pop();
        push({ msg: `'${c}' matches the top '${pair[c]}' → pop.`, arrays: [{ name: 's', values: s, pointers: [{ name: 'i', index: i }], marks: { [i]: 'done' } }, { name: 'stack', values: [...st] }], vars: { depth: st.length } });
      } else {
        push({ msg: `'${c}' doesn't match ${st.length ? `top '${st.at(-1)}'` : 'anything (empty stack)'} → invalid.`, arrays: [{ name: 's', values: s, pointers: [{ name: 'i', index: i }], marks: { [i]: 'swap' } }, { name: 'stack', values: [...st] }], vars: { depth: st.length, valid: false } });
        return frames;
      }
    }
    push({ msg: st.length ? `End with ${st.length} unclosed → invalid. (Don't forget this check!)` : 'Stack empty at the end → valid.', arrays: [{ name: 's', values: s }, { name: 'stack', values: [...st], marks: Object.fromEntries(st.map((_, i) => [i, 'swap' as Mark])) }], vars: { depth: st.length, valid: st.length === 0 } });
    return frames;
  },
};

const nextGreater: Algo = {
  id: 'next-greater',
  title: 'Next greater element — monotonic stack',
  pattern: 'Monotonic stack',
  problem: 'next-greater-element-ii',
  blurb: 'The stack holds indices still waiting for something bigger, values decreasing. A bigger value answers everyone smaller.',
  inputs: [{ key: 'nums', label: 'nums', value: '2, 1, 2, 4, 3, 1, 5' }],
  run(inp) {
    const a = nums(inp.nums);
    const { frames, push } = recorder();
    const ans: (number | string)[] = a.map(() => '?');
    const st: number[] = [];
    const view = (i: number, marks: Record<number, Mark> = {}) => [
      { name: 'nums', values: a, pointers: [{ name: 'i', index: i }], marks },
      { name: 'stack (values)', values: st.map((j) => a[j]) },
      { name: 'next greater', values: ans },
    ];
    for (let i = 0; i < a.length; i++) {
      while (st.length && a[i] > a[st.at(-1)!]) {
        const j = st.pop()!;
        ans[j] = a[i];
        push({ msg: `${a[i]} > ${a[j]} → ${a[j]}'s next greater is ${a[i]}. Pop.`, arrays: view(i, { [j]: 'hit', [i]: 'active' }), vars: { size: st.length } });
      }
      st.push(i);
      push({ msg: `Push ${a[i]} — waiting for something bigger.`, arrays: view(i), vars: { size: st.length } });
    }
    for (const j of st) ans[j] = -1;
    push({ msg: 'Still on the stack → nothing bigger to the right: −1.', arrays: view(a.length - 1), vars: { size: 0 } });
    return frames;
  },
};

const histogram: Algo = {
  id: 'histogram',
  title: 'Largest rectangle in a histogram',
  pattern: 'Monotonic stack',
  problem: 'largest-rectangle-in-histogram',
  blurb: 'Keep bars in increasing height. When a lower bar arrives, each popped bar is as tall as it gets — its width runs from the new top to i.',
  inputs: [{ key: 'h', label: 'heights', value: '2, 1, 5, 6, 2, 3' }],
  run(inp) {
    const h = nums(inp.h);
    const { frames, push } = recorder();
    const st: number[] = [];
    let best = 0;
    for (let i = 0; i <= h.length; i++) {
      const cur = i === h.length ? 0 : h[i];
      while (st.length && h[st.at(-1)!] > cur) {
        const top = st.pop()!;
        const left = st.length ? st.at(-1)! : -1;
        const width = i - left - 1;
        const area = h[top] * width;
        best = Math.max(best, area);
        const marks: Record<number, Mark> = {};
        for (let k = left + 1; k < i; k++) marks[k] = 'hit';
        push({ msg: `${i === h.length ? 'End (height 0)' : `Bar ${cur}`} < ${h[top]} → pop ${h[top]}: width = ${i} − ${left} − 1 = ${width}, area ${h[top]}×${width} = ${area}.`, arrays: [{ name: 'heights', values: h, pointers: i < h.length ? [{ name: 'i', index: i }] : [], marks }, { name: 'stack (heights)', values: st.map((j) => h[j]) }], vars: { area, best } });
      }
      if (i < h.length) {
        st.push(i);
        push({ msg: `Push ${h[i]}.`, arrays: [{ name: 'heights', values: h, pointers: [{ name: 'i', index: i }] }, { name: 'stack (heights)', values: st.map((j) => h[j]) }], vars: { area: '-', best } });
      }
    }
    push({ msg: `Largest rectangle: ${best}.`, arrays: [{ name: 'heights', values: h }], vars: { area: '-', best } });
    return frames;
  },
};

const rpn: Algo = {
  id: 'rpn',
  title: 'Evaluate reverse Polish notation',
  pattern: 'Stack',
  problem: 'evaluate-reverse-polish-notation',
  blurb: 'Numbers go on the stack; an operator pops two (right operand first!), applies, pushes the result.',
  inputs: [{ key: 'tokens', label: 'tokens', value: '4 13 5 / + 2 *' }],
  run(inp) {
    const toks = (inp.tokens || '').split(/[\s,]+/).filter(Boolean);
    const { frames, push } = recorder();
    const st: number[] = [];
    for (let i = 0; i < toks.length; i++) {
      const t = toks[i];
      if (['+', '-', '*', '/'].includes(t) && st.length >= 2) {
        const b = st.pop()!;
        const a = st.pop()!;
        const r = t === '+' ? a + b : t === '-' ? a - b : t === '*' ? a * b : Math.trunc(a / b);
        st.push(r);
        push({ msg: `'${t}': pop ${b} (right), pop ${a} (left) → ${a} ${t} ${b} = ${r}${t === '/' ? ' (truncate toward 0)' : ''}. Push.`, arrays: [{ name: 'tokens', values: toks, pointers: [{ name: 'i', index: i }] }, { name: 'stack', values: [...st], marks: { [st.length - 1]: 'hit' } }], vars: { top: r } });
      } else {
        st.push(Number(t));
        push({ msg: `Number ${t} → push.`, arrays: [{ name: 'tokens', values: toks, pointers: [{ name: 'i', index: i }] }, { name: 'stack', values: [...st], marks: { [st.length - 1]: 'active' } }], vars: { top: Number(t) } });
      }
    }
    push({ msg: `Result: ${st.at(-1)}.`, arrays: [{ name: 'tokens', values: toks }, { name: 'stack', values: [...st] }], vars: { top: st.at(-1) ?? 0 } });
    return frames;
  },
};

export const COURSE_ALGOS: Algo[] = [twoSumHash, prefixBuild, productExceptSelf, firstMissing, moveZeroes, slidingMax, trapWater, bsFirst, koko, rotatedMin, validParens, nextGreater, histogram, rpn];
