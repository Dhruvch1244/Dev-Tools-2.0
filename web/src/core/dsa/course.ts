// The Academy: each season week as a short course — lessons, step-through sims, and games
// (quizzes, predict-the-step, spot-the-bug, match, order-the-lines, fill-the-blank, speed rounds),
// then warm-up problems before the week's real set. Code in lessons is Python (short, reads like
// pseudocode); the ideas carry straight over to C++/Java. Pure data: no React.

export type Card =
  | { kind: 'learn'; title: string; body: string; viz?: { algo: string; inputs?: Record<string, string> } }
  | { kind: 'sim'; title: string; intro: string; algo: string; inputs?: Record<string, string> }
  | { kind: 'predict'; title: string; algo: string; inputs?: Record<string, string>; var: string; questions?: number }
  | { kind: 'mcq'; q: string; code?: string; choices: string[]; answer: number; why: string }
  | { kind: 'bug'; title: string; code: string; bug: number; why: string; fix: string }
  | { kind: 'match'; title: string; pairs: [string, string][] }
  | { kind: 'order'; title: string; lines: string[]; why: string }
  | { kind: 'blank'; title: string; code: string; choices: string[]; answer: number; why: string }
  | { kind: 'speed'; title: string; seconds: number; items: { q: string; choices: string[]; answer: number }[] }
  | { kind: 'problem'; id: string; title: string; diff: 'E' | 'M' | 'H'; why: string };

export type Module = { id: string; title: string; corner: string; blurb: string; boss?: boolean; cards: Card[] };
export type Course = { week: number; title: string; tagline: string; modules: Module[] };

/** Cards that are scored (everything you answer). */
export const isGraded = (c: Card) => ['predict', 'mcq', 'bug', 'match', 'order', 'blank', 'speed'].includes(c.kind);

const BIG_O = ['O(1)', 'O(log n)', 'O(n)', 'O(n log n)', 'O(n²)', 'O(n³)'];

// =============================================================================================
// Week 1 — Arrays, Hashing & Prefix Sums
// =============================================================================================
const W1: Course = {
  week: 1,
  title: 'Arrays, Hashing & Prefix Sums',
  tagline: 'Turn O(n²) subarray brute force into one O(n) pass.',
  modules: [
    {
      id: 'w1-bigo',
      title: 'Formation lap: how fast is fast enough?',
      corner: 'T1',
      blurb: 'Read the constraints, know the budget, rule out the brute force before you write it.',
      cards: [
        {
          kind: 'learn',
          title: 'The 10⁸ rule',
          body: `A judge runs roughly **10⁸ simple operations per second**. So the constraint on *n* tells you which complexity you're allowed:

| n up to | You can afford | Typical shape |
|---|---|---|
| 10–20 | O(2ⁿ), O(n!) | try every subset / permutation |
| 500 | O(n³) | three nested loops |
| 2 000–5 000 | O(n²) | every pair |
| 10⁵–10⁶ | **O(n log n) or O(n)** | sort + scan, hash map, two pointers |

**Arrays** give O(1) index access and O(1) amortised append — but inserting/removing in the middle shifts everything: O(n). Searching an unsorted array is O(n).

Week 1's whole game: problems with n ≈ 10⁵ where the obvious "check every subarray" is O(n²) or O(n³) — and the fix is a hash map and/or prefix sums.`,
        },
        {
          kind: 'speed',
          title: 'Speed round: name the complexity',
          seconds: 60,
          items: [
            { q: 'Read nums[i]', choices: BIG_O, answer: 0 },
            { q: 'Check every pair (i, j)', choices: BIG_O, answer: 4 },
            { q: 'Sort the array', choices: BIG_O, answer: 3 },
            { q: 'Look up a key in a hash map (average)', choices: BIG_O, answer: 0 },
            { q: 'Insert at the front of an array', choices: BIG_O, answer: 2 },
            { q: 'One pass over nums with a hash map', choices: BIG_O, answer: 2 },
            { q: 'Binary search a sorted array', choices: BIG_O, answer: 1 },
            { q: 'Every subarray, re-summing each from scratch', choices: BIG_O, answer: 5 },
          ],
        },
        {
          kind: 'mcq',
          q: 'n = 10⁵. Which approach finishes in about a second?',
          choices: ['Check every pair — O(n²)', 'Sort, then one scan — O(n log n)', 'Every subset — O(2ⁿ)', 'Three nested loops — O(n³)'],
          answer: 1,
          why: 'n log n ≈ 10⁵ × 17 ≈ 1.7 × 10⁶ operations. Every pair is 10¹⁰ — about 100 seconds.',
        },
        {
          kind: 'mcq',
          q: 'The constraints say n ≤ 2000. What is the slowest complexity that is still safe?',
          choices: ['O(n)', 'O(n log n)', 'O(n²)', 'O(2ⁿ)'],
          answer: 2,
          why: '2000² = 4 × 10⁶ — comfortably fast. Constraints this small are often a hint that O(n²) is intended.',
        },
      ],
    },
    {
      id: 'w1-hash',
      title: 'Hashing: the pit board',
      corner: 'T2',
      blurb: 'Remember what you have seen so you never search for it again.',
      cards: [
        {
          kind: 'learn',
          title: 'Three jobs for a hash map',
          body: `A hash map (Python \`dict\`, C++ \`unordered_map\`, Java \`HashMap\`) inserts and looks up in **O(1) on average**. A hash set is the same without values.

| Job | Store | Example |
|---|---|---|
| **Seen before?** | set of values | Contains Duplicate |
| **Where was it?** | value → index | Two Sum |
| **How many?** | value → count | Top K Frequent, Majority Element II |
| **Group by key** | key → list | Group Anagrams (key = sorted word) |

The trick is always the same: while scanning, ask the map a question about the **past**, then record the current element for the **future**.`,
          viz: { algo: 'two-sum-hash' },
        },
        { kind: 'sim', title: 'Two Sum, one pass', intro: 'Step through: for each x we look up target − x, then store x. Watch the map fill.', algo: 'two-sum-hash' },
        { kind: 'predict', title: 'Predict the next step', algo: 'two-sum-hash', inputs: { nums: '2, 11, 7, 5, 4, 15', t: '9' }, var: 'need', questions: 3 },
        {
          kind: 'bug',
          title: 'This Two Sum sometimes pairs a number with itself. Tap the buggy line.',
          code: `def twoSum(nums, target):
    seen = {}
    for i, x in enumerate(nums):
        seen[x] = i
        if target - x in seen:
            return [seen[target - x], i]`,
          bug: 3,
          why: 'Storing x before checking lets x match itself: nums = [3, 5], target = 6 returns [0, 0].',
          fix: 'Check `target - x in seen` first, then store `seen[x] = i`.',
        },
        {
          kind: 'mcq',
          q: 'Group Anagrams: which key puts "eat", "tea" and "ate" in the same group — and nothing else with them?',
          choices: ['The word length', 'The first letter', 'The letters sorted ("aet")', 'The sum of the character codes'],
          answer: 2,
          why: 'Anagrams share the same sorted letters. A sum collides ("ad" and "bc" both sum the same). A 26-letter count tuple also works and is O(L) instead of O(L log L).',
        },
        {
          kind: 'match',
          title: 'Match the problem to what you store',
          pairs: [
            ['Contains Duplicate', 'a set of values seen'],
            ['Two Sum', 'value → index'],
            ['Top K Frequent Elements', 'value → count'],
            ['Group Anagrams', 'sorted word → list of words'],
          ],
        },
        {
          kind: 'mcq',
          q: 'Longest Consecutive Sequence in O(n): put everything in a set, then only start counting up from x when…',
          choices: ['x is the smallest number overall', 'x − 1 is not in the set', 'x + 1 is not in the set', 'x is even'],
          answer: 1,
          why: 'If x − 1 exists, x is in the middle of a run that is counted from its start. Each number is then visited at most twice → O(n).',
        },
        { kind: 'problem', id: 'contains-duplicate', title: 'Contains Duplicate', diff: 'E', why: 'The "seen before?" job in five lines.' },
        { kind: 'problem', id: 'two-sum', title: 'Two Sum', diff: 'E', why: 'The value → index map you just traced.' },
        { kind: 'problem', id: 'valid-anagram', title: 'Valid Anagram', diff: 'E', why: 'Counting with a map (or a 26-slot array).' },
      ],
    },
    {
      id: 'w1-prefix',
      title: 'Prefix sums: the timing loop',
      corner: 'T3',
      blurb: 'Precompute once, answer any range sum with one subtraction.',
      cards: [
        {
          kind: 'learn',
          title: 'Sector times add up',
          body: `Like lap time = sum of sector times, **prefix[i] = sum of the first i numbers**:

\`\`\`python
prefix = [0] * (n + 1)
for i in range(n):
    prefix[i + 1] = prefix[i] + nums[i]
\`\`\`

Then **sum(nums[l..r]) = prefix[r + 1] − prefix[l]** in O(1).

Why the extra leading 0? It is "the sum of nothing", so ranges that start at index 0 need no special case.

Example — nums = [3, 1, 4, 1, 5] → prefix = [0, 3, 4, 8, 9, 14]. sum(1..3) = prefix[4] − prefix[1] = 9 − 3 = **6** (1 + 4 + 1).`,
          viz: { algo: 'prefix-build' },
        },
        { kind: 'sim', title: 'Build it, then query it', intro: 'Watch prefix fill left to right, then answer sum(1..4) with one subtraction.', algo: 'prefix-build' },
        { kind: 'predict', title: 'Keep the running total', algo: 'prefix-build', inputs: { nums: '2, 7, 1, 8, 2, 8', l: '2', r: '4' }, var: 'running', questions: 3 },
        {
          kind: 'mcq',
          q: 'nums = [2, −1, 3, 5, 2] and prefix = [0, 2, 1, 4, 9, 11]. What is sum(nums[1..3])?',
          choices: ['9', '7', '6', '8'],
          answer: 1,
          why: 'prefix[4] − prefix[1] = 9 − 2 = 7 (−1 + 3 + 5).',
        },
        {
          kind: 'blank',
          title: 'Complete the range-sum formula',
          code: `def range_sum(prefix, l, r):   # inclusive l..r
    return prefix[____] - prefix[l]`,
          choices: ['r', 'r + 1', 'r - 1', 'l + 1'],
          answer: 1,
          why: 'prefix[k] covers the first k numbers (indices 0..k−1), so indices 0..r is prefix[r + 1].',
        },
        {
          kind: 'mcq',
          q: '2D prefix P (padded by one row and column). Sum of the rectangle (r1,c1)–(r2,c2) = P[r2+1][c2+1] − P[r1][c2+1] − P[r2+1][c1] + …',
          choices: ['P[r1][c1]', 'P[r2][c2]', 'P[r1+1][c1+1]', 'nothing — that is it'],
          answer: 0,
          why: 'Inclusion–exclusion: the top-left block was subtracted twice, so add P[r1][c1] back once.',
        },
        { kind: 'problem', id: 'running-sum-of-1d-array', title: 'Running Sum of 1d Array', diff: 'E', why: 'Literally building prefix.' },
        { kind: 'problem', id: 'range-sum-query-immutable', title: 'Range Sum Query – Immutable', diff: 'E', why: 'Build once, answer every query in O(1).' },
        { kind: 'problem', id: 'find-pivot-index', title: 'Find Pivot Index', diff: 'E', why: 'Left sum vs right sum from one total.' },
      ],
    },
    {
      id: 'w1-subarray',
      title: 'Prefix + hash: Subarray Sum Equals K',
      corner: 'T4',
      blurb: 'The week’s core move: count subarrays in one pass.',
      cards: [
        {
          kind: 'learn',
          title: 'Ask the past',
          body: `A subarray l..r sums to k exactly when **prefix[r+1] − prefix[l] = k**, i.e. **prefix[l] = prefix[r+1] − k**.

So sweep once keeping a running \`prefix\`, and a map **prefix value → how many times seen**. At each step:

1. \`prefix += x\`
2. \`count += seen[prefix − k]\` — every earlier prefix equal to prefix − k starts a valid subarray ending here
3. \`seen[prefix] += 1\`

Seed the map with **{0: 1}** — the empty prefix — or you miss subarrays that start at index 0.

Why not a sliding window? **Negative numbers.** A window relies on "growing makes the sum bigger"; with negatives that's false.`,
          viz: { algo: 'prefix-hash' },
        },
        { kind: 'sim', title: 'Count subarrays summing to 3', intro: 'Each step: add to prefix, look up prefix − k, record prefix. Green cells in the map are hits.', algo: 'prefix-hash' },
        { kind: 'predict', title: 'What is count now?', algo: 'prefix-hash', inputs: { nums: '1, 1, 1, 2, -1, 1', k: '2' }, var: 'count', questions: 4 },
        {
          kind: 'order',
          title: 'Put the solution in order',
          lines: ['count, prefix, seen = 0, 0, {0: 1}', 'for x in nums:', '    prefix += x', '    count += seen.get(prefix - k, 0)', '    seen[prefix] = seen.get(prefix, 0) + 1', 'return count'],
          why: 'Look up before you store: with k = 0, storing first would match each prefix with itself and count empty subarrays.',
        },
        {
          kind: 'bug',
          title: 'nums = [3], k = 3 returns 0. Tap the buggy line.',
          code: `def subarraySum(nums, k):
    count, prefix = 0, 0
    seen = {}
    for x in nums:
        prefix += x
        count += seen.get(prefix - k, 0)
        seen[prefix] = seen.get(prefix, 0) + 1
    return count`,
          bug: 2,
          why: 'Without the empty prefix, a subarray that starts at index 0 has nothing to match: prefix − k = 0 was never "seen".',
          fix: '`seen = {0: 1}`',
        },
        {
          kind: 'mcq',
          q: 'Why does a sliding window fail on Subarray Sum Equals K?',
          choices: ['It is O(n²)', 'Negative numbers mean shrinking the window can increase the sum', 'Windows only work on strings', 'k can be zero'],
          answer: 1,
          why: 'A window needs monotonic behaviour: grow → sum up, shrink → sum down. Negatives break that, so prefix + hash is the tool.',
        },
      ],
    },
    {
      id: 'w1-variants',
      title: 'Variants: same engine, different fuel',
      corner: 'T5',
      blurb: 'Remainders, first indices and relabelling — one idea, six problems.',
      cards: [
        {
          kind: 'learn',
          title: 'Change what you store, not the loop',
          body: `| Problem | Transform | Map stores | Look up |
|---|---|---|---|
| count sum = k | — | prefix → count | prefix − k |
| **longest** sum = k | — | prefix → **first** index | prefix − k |
| divisible by k | prefix **mod k** | remainder → count | same remainder |
| equal 0s and 1s | 0 → **−1** | prefix → first index | same prefix (sum 0) |
| nice subarrays (k odds) | odd → 1, even → 0 | prefix → count | prefix − k |
| multiple of k, length ≥ 2 | prefix mod k | remainder → first index | same remainder, i − j ≥ 2 |

**Negative remainders:** in C++/Java, \`-7 % 3 == -1\`. Normalise with \`((p % k) + k) % k\`. (Python already returns 2.)`,
        },
        {
          kind: 'match',
          title: 'Match the problem to its transform',
          pairs: [
            ['Contiguous Array (equal 0s and 1s)', 'turn 0 into −1, look for sum 0'],
            ['Subarray Sums Divisible by K', 'count each prefix mod k'],
            ['Count Number of Nice Subarrays', 'odd → 1, even → 0, then sum = k'],
            ['Continuous Subarray Sum', 'first index of each remainder, length ≥ 2'],
          ],
        },
        {
          kind: 'mcq',
          q: 'In C++ or Java, what is (−7) % 3?',
          choices: ['2', '−1', '1', '−2'],
          answer: 1,
          why: 'C++/Java truncate toward zero, so the remainder takes the sign of the dividend. Use ((p % k) + k) % k to get 2.',
        },
        {
          kind: 'mcq',
          q: 'Longest subarray with sum k: for each prefix value, should the map keep its first or its last index?',
          choices: ['First index', 'Last index', 'Either', 'Both, averaged'],
          answer: 0,
          why: 'The subarray is (j, i]. To make i − j as big as possible you want the earliest j — so never overwrite an existing entry.',
        },
        {
          kind: 'blank',
          title: 'Contiguous Array — seed the map',
          code: `first = {0: ____}   # prefix value -> first index
prefix = best = 0
for i, x in enumerate(nums):
    prefix += 1 if x == 1 else -1
    if prefix in first:
        best = max(best, i - first[prefix])
    else:
        first[prefix] = i`,
          choices: ['0', '-1', '1', 'None'],
          answer: 1,
          why: 'The empty prefix sits just before index 0, so its index is −1: a balanced run from 0..i has length i − (−1) = i + 1.',
        },
        { kind: 'problem', id: 'contiguous-array', title: 'Contiguous Array', diff: 'M', why: 'Relabel, then find the earliest matching prefix.' },
        { kind: 'problem', id: 'subarray-sums-divisible-by-k', title: 'Subarray Sums Divisible by K', diff: 'M', why: 'Remainders — and the negative mod trap.' },
      ],
    },
    {
      id: 'w1-tricks',
      title: 'Tricks: both directions & index-as-hash',
      corner: 'T6',
      blurb: 'Product except self without division, and First Missing Positive in O(1) space.',
      cards: [
        {
          kind: 'learn',
          title: 'Left × right',
          body: `**Product of Array Except Self**: answer[i] = (product of everything left of i) × (product of everything right of i).

Pass 1 (left → right) writes the left product into \`answer\`. Pass 2 (right → left) multiplies a running \`right\` product in. No division (zeros would break it), O(n) time, O(1) extra space besides the output.`,
          viz: { algo: 'product-except-self' },
        },
        { kind: 'sim', title: 'Two passes', intro: 'Pass 1 fills the left products; pass 2 folds in the right products.', algo: 'product-except-self' },
        { kind: 'predict', title: 'Track the running products', algo: 'product-except-self', inputs: { nums: '2, 3, 1, 4' }, var: 'right', questions: 3 },
        {
          kind: 'learn',
          title: 'The array is its own hash map',
          body: `**First Missing Positive** wants O(n) time and O(1) space. Key fact: with n numbers, the answer is in **1..n+1**.

So use the indices as buckets: keep swapping each value v (1 ≤ v ≤ n) into index v − 1 until it is home. Then the first index i with nums[i] ≠ i + 1 gives the answer i + 1 (or n + 1 if all are home). Every swap puts one value home for good → O(n) total.`,
          viz: { algo: 'first-missing-positive' },
        },
        { kind: 'sim', title: 'Cyclic placement', intro: 'Watch values hop to their home index; out-of-range values are left alone.', algo: 'first-missing-positive' },
        {
          kind: 'mcq',
          q: 'Why is the answer to First Missing Positive always between 1 and n + 1?',
          choices: ['Because the array is sorted', 'n numbers can fill at most the slots 1..n, so something in 1..n+1 is missing', 'Because negatives are ignored', 'It is not — it can be any positive number'],
          answer: 1,
          why: 'Pigeonhole: n values cover at most n of the values 1..n+1, so at least one of them is missing.',
        },
        {
          kind: 'mcq',
          q: 'Product Except Self: why not compute the total product and divide by nums[i]?',
          choices: ['Division is slow', 'A zero in the array breaks it (and the problem forbids division)', 'It would be O(n²)', 'Integers overflow only with division'],
          answer: 1,
          why: 'With one zero every other answer is 0 and you would divide by zero for that index; with two zeros everything is 0. Left × right handles all of it.',
        },
      ],
    },
    {
      id: 'w1-boss',
      title: 'Qualifying: Week 1',
      corner: 'Q',
      blurb: 'Mixed, timed — prove the week stuck before the Sunday test.',
      boss: true,
      cards: [
        {
          kind: 'speed',
          title: 'Q1 — pick the tool',
          seconds: 75,
          items: [
            { q: 'Count subarrays with sum = k (negatives allowed)', choices: ['Sliding window', 'Prefix sum + hash map', 'Sort + two pointers', 'Binary search'], answer: 1 },
            { q: 'Is there a duplicate?', choices: ['Hash set', 'Prefix sum', 'Deque', 'Heap'], answer: 0 },
            { q: 'Many range-sum queries on a fixed array', choices: ['Re-sum each query', 'Prefix sums', 'Hash set', 'Two pointers'], answer: 1 },
            { q: 'Equal number of 0s and 1s, longest', choices: ['0 → −1, first index of each prefix', 'Count 1s with a set', 'Sliding window on 0s', 'Sort'], answer: 0 },
            { q: 'Smallest missing positive in O(1) space', choices: ['Sort it', 'Hash set', 'Cyclic placement (index as hash)', 'Prefix sums'], answer: 2 },
            { q: 'Group words that are anagrams', choices: ['Map: sorted word → list', 'Two pointers', 'Prefix sum of lengths', 'Heap of words'], answer: 0 },
          ],
        },
        {
          kind: 'mcq',
          q: 'Subarray Sums Divisible by K, nums = [4, 5, 0, −2, −3, 1], k = 5. The remainders of the prefixes (with the empty prefix 0) are 0, 4, 4, 4, 2, 4, 0. How many subarrays?',
          choices: ['5', '6', '7', '8'],
          answer: 2,
          why: 'Pairs of equal remainders: 0 appears 2× → 1 pair; 4 appears 4× → 6 pairs; 2 once → 0. Total 7.',
        },
        { kind: 'predict', title: 'Final sector: count', algo: 'prefix-hash', inputs: { nums: '3, 4, 7, 2, -3, 1, 4, 2', k: '7' }, var: 'count', questions: 3 },
        {
          kind: 'mcq',
          q: 'Range Sum Query 2D: building the padded prefix matrix for an m × n grid costs…',
          choices: ['O(m + n)', 'O(m·n) once, then O(1) per query', 'O(m·n) per query', 'O(log(m·n))'],
          answer: 1,
          why: 'Each cell is computed once from three neighbours; afterwards each rectangle is four lookups.',
        },
      ],
    },
  ],
};

// =============================================================================================
// Week 2 — Two Pointers & Sliding Window
// =============================================================================================
const W2: Course = {
  week: 2,
  title: 'Two Pointers & Sliding Window',
  tagline: 'Every index enters once and leaves once — O(n) where brute force is O(n²).',
  modules: [
    {
      id: 'w2-ends',
      title: 'Two pointers from both ends',
      corner: 'T1',
      blurb: 'Sorted input + a greedy argument = throw away one candidate per step.',
      cards: [
        {
          kind: 'learn',
          title: 'Eliminate, don’t search',
          body: `On a **sorted** array, find a pair summing to target: \`l = 0\`, \`r = n − 1\`.

- sum < target → **l += 1** (nums[l] is too small even with the biggest partner, so it pairs with nothing)
- sum > target → **r −= 1** (nums[r] is too big even with the smallest partner)
- equal → found

Each step discards one element forever → **O(n)**. The same "the losing side can never win" argument powers **Container With Most Water**: the area is capped by the shorter wall, so moving the taller one can never help — move the shorter.`,
          viz: { algo: 'two-pointers' },
        },
        { kind: 'sim', title: 'Container With Most Water', intro: 'Start wide. Each step moves the shorter wall inward.', algo: 'two-pointers' },
        { kind: 'predict', title: 'Area of the next container', algo: 'two-pointers', inputs: { h: '2, 7, 4, 1, 6, 3, 5' }, var: 'area', questions: 3 },
        {
          kind: 'mcq',
          q: 'Container: heights 3 (left) and 8 (right), 6 apart. Why move the left pointer?',
          choices: ['It is on the left', 'Area is limited by the shorter wall (3); keeping it, any narrower container is ≤ 3 × width', 'To keep the code symmetric', 'Moving right would be O(n²)'],
          answer: 1,
          why: 'With 3 as one wall, every narrower container holds at most 3 × (smaller width) < 18. So 3 is done — drop it.',
        },
        {
          kind: 'mcq',
          q: 'Valid Palindrome with two pointers: what do you do when s[l] is not a letter or digit?',
          choices: ['Return False', 'Skip it: l += 1 and check again', 'Swap it with s[r]', 'Restart from l = 0'],
          answer: 1,
          why: 'Non-alphanumerics are ignored, so move past them; compare lowercase letters only.',
        },
        { kind: 'problem', id: 'valid-palindrome', title: 'Valid Palindrome', diff: 'E', why: 'Two pointers inward with a skip.' },
        { kind: 'problem', id: 'two-sum-ii-input-array-is-sorted', title: 'Two Sum II – Input Array Is Sorted', diff: 'M', why: 'Exactly the elimination argument above.' },
        { kind: 'problem', id: 'squares-of-a-sorted-array', title: 'Squares of a Sorted Array', diff: 'E', why: 'Biggest square sits at one of the ends.' },
      ],
    },
    {
      id: 'w2-rw',
      title: 'Read / write pointers',
      corner: 'T2',
      blurb: 'Both pointers move the same way: one scans, one writes. In place, O(1) space.',
      cards: [
        {
          kind: 'learn',
          title: 'Fast scans, slow writes',
          body: `\`write\` is where the next element you keep goes; \`read\` scans everything.

\`\`\`python
write = 0
for read in range(len(nums)):
    if keep(nums[read]):
        nums[write] = nums[read]   # or swap, to keep the rest
        write += 1
\`\`\`

Everything left of \`write\` is the answer so far. Used for **Move Zeroes**, **Remove Duplicates from Sorted Array**, **Remove Element**, and merging from the back in **Merge Sorted Array**.`,
          viz: { algo: 'move-zeroes' },
        },
        { kind: 'sim', title: 'Move Zeroes', intro: 'R scans; each non-zero swaps down to W.', algo: 'move-zeroes' },
        { kind: 'predict', title: 'Where is write?', algo: 'move-zeroes', inputs: { nums: '4, 0, 0, 2, 0, 7, 1' }, var: 'write', questions: 3 },
        {
          kind: 'blank',
          title: 'Remove Duplicates from Sorted Array',
          code: `write = 1
for read in range(1, len(nums)):
    if nums[read] != nums[____]:
        nums[write] = nums[read]
        write += 1
return write`,
          choices: ['write - 1', 'write', 'read + 1', '0'],
          answer: 0,
          why: 'nums[write − 1] is the last value kept; a new value is anything different from it.',
        },
        {
          kind: 'mcq',
          q: 'Merge Sorted Array (nums1 has space at the end). Why fill from the back?',
          choices: ['It is faster to iterate backwards', 'The empty slots are at the back, so you never overwrite an unread nums1 value', 'To keep it stable', 'Front-filling is O(n²) memory'],
          answer: 1,
          why: 'Writing the largest values into the free tail never clobbers anything still to be read.',
        },
        { kind: 'problem', id: 'move-zeroes', title: 'Move Zeroes', diff: 'E', why: 'The sim you just ran.' },
        { kind: 'problem', id: 'remove-duplicates-from-sorted-array', title: 'Remove Duplicates from Sorted Array', diff: 'E', why: 'Read/write with "different from last kept".' },
        { kind: 'problem', id: 'merge-sorted-array', title: 'Merge Sorted Array', diff: 'E', why: 'Three pointers, writing from the back.' },
      ],
    },
    {
      id: 'w2-3sum',
      title: '3Sum: sort, fix, squeeze',
      corner: 'T3',
      blurb: 'Reduce k-sum to two pointers — and skip duplicates at every level.',
      cards: [
        {
          kind: 'learn',
          title: 'Fix one, two-pointer the rest',
          body: `1. **Sort** (O(n log n)).
2. For each i: if \`i > 0 and nums[i] == nums[i − 1]\` → skip (same first number = same triplets). If nums[i] > 0 → break (all remaining are positive).
3. Two pointers on i+1..n−1 looking for −nums[i]. On a hit, record it, move both, and **skip equal values on the left** so the next pair is new.

Total **O(n²)**. 4Sum adds one more fixed loop → O(n³).`,
        },
        {
          kind: 'bug',
          title: 'This 3Sum misses [−1, −1, 2] in [−1, 0, 1, 2, −1, −4]. Tap the buggy line.',
          code: `nums.sort()
res = []
for i in range(len(nums) - 2):
    if i + 1 < len(nums) and nums[i] == nums[i + 1]: continue
    l, r = i + 1, len(nums) - 1
    while l < r:
        s = nums[i] + nums[l] + nums[r]
        if s < 0: l += 1
        elif s > 0: r -= 1
        else:
            res.append([nums[i], nums[l], nums[r]])
            l += 1; r -= 1
            while l < r and nums[l] == nums[l - 1]: l += 1
return res`,
          bug: 3,
          why: 'Comparing with the *next* value skips the first −1, so the triplet that uses both −1s is never tried.',
          fix: '`if i > 0 and nums[i] == nums[i - 1]: continue` — skip a value only after it has had its turn.',
        },
        {
          kind: 'mcq',
          q: 'Time complexity of sort + fix + two pointers for 3Sum?',
          choices: ['O(n log n)', 'O(n²)', 'O(n³)', 'O(n² log n)'],
          answer: 1,
          why: 'n choices of i × an O(n) squeeze; the sort is dominated.',
        },
        {
          kind: 'mcq',
          q: 'After recording a triplet, why move both l and r?',
          choices: ['To save time only', 'With nums[i] fixed, keeping nums[l] means nums[r] must stay the same value — that is a duplicate', 'Because l must always equal r', 'It is not needed'],
          answer: 1,
          why: 'For a fixed i and l-value the needed r-value is determined, so the only new triplets need both to change.',
        },
        { kind: 'problem', id: '3sum', title: '3Sum', diff: 'M', why: 'You solved it already — re-solve from memory with the duplicate skips.' },
      ],
    },
    {
      id: 'w2-window',
      title: 'Sliding window: expand & shrink',
      corner: 'T4',
      blurb: 'Grow right, shrink left while invalid. Each index in once, out once.',
      cards: [
        {
          kind: 'learn',
          title: 'The template',
          body: `\`\`\`python
l = 0
for r in range(len(s)):
    add(s[r])
    while invalid():
        remove(s[l]); l += 1
    best = max(best, r - l + 1)
\`\`\`

The inner \`while\` looks like O(n²), but **l only ever moves right** — across the whole run it advances at most n times. Total **O(n)**.

Works when "valid" is **monotonic**: if a window is valid, every smaller window inside it is too (no repeats, at most K distinct, sum ≤ target with non-negatives). For *shortest* windows, record the answer **inside** the shrink loop while still valid.`,
          viz: { algo: 'sliding-window' },
        },
        { kind: 'sim', title: 'Longest substring without repeats', intro: 'R grows the window; a repeat jumps L past the earlier copy.', algo: 'sliding-window' },
        { kind: 'predict', title: 'Best length so far', algo: 'sliding-window', inputs: { s: 'pwwkewabca' }, var: 'best', questions: 3 },
        {
          kind: 'order',
          title: 'Order: Minimum Size Subarray Sum (shortest with sum ≥ target)',
          lines: ['l = total = 0; best = inf', 'for r, x in enumerate(nums):', '    total += x', '    while total >= target:', '        best = min(best, r - l + 1)', '        total -= nums[l]; l += 1', 'return 0 if best == inf else best'],
          why: 'For a shortest window, record while it is still valid, then shrink.',
        },
        {
          kind: 'mcq',
          q: 'The window loop has a while inside a for. Why is it still O(n)?',
          choices: ['The while runs at most once', 'l only moves forward: over the whole run it advances ≤ n times', 'Because strings are short', 'It is actually O(n²)'],
          answer: 1,
          why: 'Amortised: total work = n moves of r + at most n moves of l.',
        },
        { kind: 'problem', id: 'maximum-average-subarray-i', title: 'Maximum Average Subarray I', diff: 'E', why: 'Fixed-size window: add the new, drop the old.' },
        { kind: 'problem', id: 'best-time-to-buy-and-sell-stock', title: 'Best Time to Buy and Sell Stock', diff: 'E', why: 'Track the lowest price on the left as you sweep.' },
        { kind: 'problem', id: 'contains-duplicate-ii', title: 'Contains Duplicate II', diff: 'E', why: 'A window of size k with a set.' },
      ],
    },
    {
      id: 'w2-counts',
      title: 'Windows with counts',
      corner: 'T5',
      blurb: 'Fixed windows, "replace k", and covering a target string.',
      cards: [
        {
          kind: 'learn',
          title: 'What makes a window invalid?',
          body: `| Problem | Window state | Invalid when |
|---|---|---|
| Permutation in String | counts, **fixed size len(s1)** | — (slide; compare counts) |
| Longest Repeating Character Replacement | counts + **maxFreq** | (r − l + 1) − maxFreq > k |
| Max Consecutive Ones III | zeros in window | zeros > k |
| Fruit Into Baskets | type → count | distinct types > 2 |
| Minimum Window Substring | need / have counts | (shrink *while valid* to minimise) |

**maxFreq trick:** in Character Replacement you never need to decrease maxFreq when shrinking — a stale, too-high value only stops the window from growing past its best, it never produces a wrong larger answer.`,
        },
        {
          kind: 'match',
          title: 'Match the problem to its shrink rule',
          pairs: [
            ['Longest Substring Without Repeating', 'some character count > 1'],
            ['Max Consecutive Ones III', 'zeros in window > k'],
            ['Fruit Into Baskets', 'more than 2 distinct types'],
            ['Longest Repeating Character Replacement', 'window − maxFreq > k'],
          ],
        },
        {
          kind: 'mcq',
          q: 'Permutation in String (does s2 contain a permutation of s1?). What window size do you slide?',
          choices: ['Any size', 'len(s1)', 'len(s2)', '26'],
          answer: 1,
          why: 'A permutation of s1 has exactly len(s1) characters, so slide a fixed window of that size and compare 26-letter counts.',
        },
        {
          kind: 'mcq',
          q: 'Minimum Window Substring: when do you record the answer?',
          choices: ['When r reaches the end', 'Inside the shrink loop, while the window still covers t', 'Before expanding', 'Only when l == r'],
          answer: 1,
          why: 'You want the smallest valid window: each time it is valid, record it, then shrink to try for smaller.',
        },
        { kind: 'problem', id: 'permutation-in-string', title: 'Permutation in String', diff: 'M', why: 'Fixed window + counts.' },
        { kind: 'problem', id: 'longest-repeating-character-replacement', title: 'Longest Repeating Character Replacement', diff: 'M', why: 'The maxFreq trick.' },
      ],
    },
    {
      id: 'w2-exact',
      title: 'Exactly K = atMost(K) − atMost(K − 1)',
      corner: 'T6',
      blurb: 'When a window can’t count “exactly”, subtract two windows that can.',
      cards: [
        {
          kind: 'learn',
          title: 'Count with "at most", subtract',
          body: `"At most K distinct" is window-friendly: for each r, **every** start from l..r is valid, so add **r − l + 1**.

"Exactly K" isn't: for a fixed r, several starts might give exactly K, and one window can't count them all. But

> **exactly(K) = atMost(K) − atMost(K − 1)**

Example: nums = [1, 2, 1, 2, 3], K = 2 → atMost(2) = 12, atMost(1) = 5 → **7** subarrays with exactly 2 distinct.

The same subtraction solves **Count Number of Nice Subarrays** (exactly k odd numbers) and **Binary Subarrays With Sum**.`,
        },
        {
          kind: 'mcq',
          q: 'atMost(3) = 20 and atMost(2) = 14 for some array. How many subarrays have exactly 3 distinct values?',
          choices: ['34', '6', '14', '20'],
          answer: 1,
          why: '20 − 14 = 6: subarrays with ≤ 3 distinct minus those with ≤ 2 leaves exactly 3.',
        },
        {
          kind: 'blank',
          title: 'Inside atMost(k): how many new subarrays end at r?',
          code: `def at_most(nums, k):
    count = {}; l = res = 0
    for r, x in enumerate(nums):
        count[x] = count.get(x, 0) + 1
        while len(count) > k:
            count[nums[l]] -= 1
            if count[nums[l]] == 0: del count[nums[l]]
            l += 1
        res += ____
    return res`,
          choices: ['1', 'r - l + 1', 'len(count)', 'r - l'],
          answer: 1,
          why: 'Every start l..r gives a valid subarray ending at r — that is r − l + 1 of them.',
        },
        {
          kind: 'mcq',
          q: 'Which Week 1 problem is also exactly(k) = atMost(k) − atMost(k − 1)?',
          choices: ['Count Number of Nice Subarrays', 'Two Sum', 'Product of Array Except Self', 'Group Anagrams'],
          answer: 0,
          why: 'Exactly k odd numbers = at most k odds − at most k − 1 odds (or prefix + hash on odd counts — both work).',
        },
        { kind: 'problem', id: 'subarrays-with-k-different-integers', title: 'Subarrays with K Different Integers', diff: 'H', why: 'The Hard that this trick turns into two easy windows.' },
      ],
    },
    {
      id: 'w2-deque',
      title: 'Monotonic deque & rain water',
      corner: 'T7',
      blurb: 'Keep only candidates that can still win; settle the side that is already decided.',
      cards: [
        {
          kind: 'learn',
          title: 'Sliding Window Maximum',
          body: `Keep a deque of **indices** whose values **decrease** from front to back.

- New value x: pop from the back while the back value ≤ x (they can never be a max again while x is in the window).
- Pop the front if its index has left the window.
- The front is the window's max.

Every index is pushed and popped at most once → **O(n)** (a heap would be O(n log n)).`,
          viz: { algo: 'sliding-max' },
        },
        { kind: 'sim', title: 'Deque in action', intro: 'Watch smaller values get evicted from the back; the front is always the max.', algo: 'sliding-max' },
        {
          kind: 'learn',
          title: 'Trapping Rain Water with two pointers',
          body: `Water above bar i = **min(maxLeft, maxRight) − height[i]**.

With pointers at both ends: if \`height[l] < height[r]\`, the right side already has a wall at least as tall as height[l]… so the water at l is decided by **leftMax** alone. Settle l and move it. Otherwise settle r with rightMax. O(n) time, O(1) space.`,
          viz: { algo: 'trap-water' },
        },
        { kind: 'predict', title: 'How much water so far?', algo: 'trap-water', inputs: { h: '4, 2, 0, 3, 2, 5' }, var: 'water', questions: 3 },
        {
          kind: 'mcq',
          q: 'Trapping Rain Water: height[l] = 2 < height[r] = 5 and leftMax = 4. How much water sits above l?',
          choices: ['0', '2', '3', '5 − 2 = 3'],
          answer: 1,
          why: 'The right side has a wall ≥ 5 > leftMax, so the bound is leftMax: 4 − 2 = 2.',
        },
        { kind: 'problem', id: 'trapping-rain-water', title: 'Trapping Rain Water', diff: 'H', why: 'In this week’s set — now with the two-pointer proof.' },
      ],
    },
    {
      id: 'w2-boss',
      title: 'Qualifying: Week 2',
      corner: 'Q',
      blurb: 'Mixed, timed — window or pointers, decide fast.',
      boss: true,
      cards: [
        {
          kind: 'speed',
          title: 'Q1 — pick the tool',
          seconds: 75,
          items: [
            { q: 'Pair with sum = target in a SORTED array', choices: ['Hash map', 'Two pointers from both ends', 'Sliding window', 'Deque'], answer: 1 },
            { q: 'Longest substring with at most 2 distinct chars', choices: ['Sliding window + counts', 'Two pointers from ends', 'Prefix sums', 'Sort'], answer: 0 },
            { q: 'Subarrays with EXACTLY k distinct', choices: ['One window', 'atMost(k) − atMost(k−1)', 'Binary search', 'Heap'], answer: 1 },
            { q: 'Max of every window of size k', choices: ['Re-scan each window', 'Monotonic deque', 'Prefix sums', 'Two pointers from ends'], answer: 1 },
            { q: 'Shortest subarray with sum ≥ target (all positive)', choices: ['Sliding window, record while valid', 'Prefix + hash map', 'Sort first', 'Deque'], answer: 0 },
            { q: 'Remove duplicates in place from a sorted array', choices: ['Read/write pointers', 'Hash set + new array', 'Deque', 'Binary search'], answer: 0 },
          ],
        },
        { kind: 'predict', title: 'Final sector: window', algo: 'sliding-max', inputs: { nums: '9, 10, 9, -7, -4, -8, 2, -6', k: '5' }, var: 'front', questions: 3 },
        {
          kind: 'mcq',
          q: 'Subarray sum = k with NEGATIVE numbers allowed. Window or not?',
          choices: ['Sliding window', 'Prefix sum + hash map', 'Two pointers', 'Monotonic deque'],
          answer: 1,
          why: 'Negatives break the window’s monotonic "shrink to reduce the sum" rule — Week 1’s prefix + hash handles it.',
        },
        {
          kind: 'mcq',
          q: '4Sum time complexity with sort + two fixed loops + two pointers?',
          choices: ['O(n²)', 'O(n³)', 'O(n⁴)', 'O(n² log n)'],
          answer: 1,
          why: 'Two nested fixed indices (n²) × an O(n) squeeze.',
        },
      ],
    },
  ],
};

export const COURSES: Course[] = [W1, W2];
export const courseFor = (week: number) => COURSES.find((c) => c.week === week);
export const moduleById = (id: string) => COURSES.flatMap((c) => c.modules.map((m) => ({ course: c, module: m }))).find((x) => x.module.id === id);

/** Stars from mistakes on graded cards: none = 3, a couple = 2, more = 1. */
export const starsFor = (mistakes: number, graded: number) => (graded === 0 ? 3 : mistakes === 0 ? 3 : mistakes <= Math.max(2, Math.round(graded * 0.25)) ? 2 : 1);

/** Modules unlock in order: the next one opens when the previous has any stars. */
export function unlocked(course: Course, stars: Record<string, number>) {
  const out = new Set<string>();
  for (const m of course.modules) {
    out.add(m.id);
    if (!stars[m.id]) break;
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Predict-the-step questions, generated from a sim's frames so the answer is right by construction.
// ---------------------------------------------------------------------------------------------
type FrameLike = { vars?: Record<string, unknown> };
export type PredictQ = { at: number; answer: number; choices: number[] };

/** Small seeded PRNG so a lesson asks the same questions each time you open it. */
export function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}
export function shuffled<T>(xs: T[], seed: number) {
  const r = rng(seed);
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Up to `n` questions "after the next step, what is <var>?", at frames where the next frame changes
 * it to a number, spread across the run. Choices: the answer, the current value, and near misses.
 */
export function predictQuestions(frames: FrameLike[], v: string, n = 3, seed = 7): PredictQ[] {
  const at: number[] = [];
  for (let f = 0; f < frames.length - 1; f++) {
    const now = frames[f].vars?.[v];
    const next = frames[f + 1].vars?.[v];
    if (typeof next === 'number' && next !== now) at.push(f);
  }
  const pick = at.length <= n ? at : Array.from({ length: n }, (_, i) => at[Math.floor(((i + 0.5) * at.length) / n)]);
  return pick.map((f, i) => {
    const answer = frames[f + 1].vars![v] as number;
    const cur = frames[f].vars?.[v];
    const pool = [typeof cur === 'number' ? cur : answer + 2, answer + 1, answer - 1, answer + 2, answer - 2, answer * 2, answer + 3];
    const wrong = [...new Set(pool.filter((x) => x !== answer && Number.isFinite(x)))].slice(0, 3);
    return { at: f, answer, choices: shuffled([answer, ...wrong], seed + i * 31) };
  });
}
