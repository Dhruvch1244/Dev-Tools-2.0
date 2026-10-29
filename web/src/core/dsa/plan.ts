// The 13-week season. Pure data + date math; no React.
//
// Shape of a week: Mon–Sat practice (2 problems/day), Sunday = weekly test ("Qualifying").
// Mega tests ("Grand Prix") close each month (weeks 4, 8, 12) and the season finale closes week 13.
// Test problems are deliberately NOT in the practice lists — a test you've already solved
// measures memory, not skill.

export type Diff = 'E' | 'M' | 'H';
export type Problem = { id: string; title: string; diff: Diff; url: string; week: number };
export type Week = {
  n: number;
  gp: string;
  topic: string;
  month: 1 | 2 | 3 | 4;
  viz: string[];
  concepts: string;
  problems: Problem[];
  test: Problem[];
};
export type Mega = { id: string; title: string; afterWeek: number; covers: number[]; durationMin: number; problems: Problem[] };

const TITLE_OVERRIDES: Record<string, string> = {
  '3sum': '3Sum',
  '4sum': '4Sum',
  '01-matrix': '01 Matrix',
  'lru-cache': 'LRU Cache',
  'lfu-cache': 'LFU Cache',
  ipo: 'IPO',
  'implement-trie-prefix-tree': 'Implement Trie (Prefix Tree)',
  'insert-delete-getrandom-o1': 'Insert Delete GetRandom O(1)',
  'all-oone-data-structure': 'All O`one Data Structure',
  'find-k-th-smallest-pair-distance': 'Find K-th Smallest Pair Distance',
  'design-add-and-search-words-data-structure': 'Design Add and Search Words',
  'my-calendar-iii': 'My Calendar III',
  sqrtx: 'Sqrt(x)',
};
const titleOf = (slug: string) => TITLE_OVERRIDES[slug] ?? slug.split('-').map((w) => (/^(ii|iii|iv|k|bst)$/.test(w) ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1))).join(' ').replace(/ (Of|In|A|An|The|To|And|With|From|On|At|For|By)\b/g, (m) => m.toLowerCase());
const P = (week: number, list: string): Problem[] =>
  list
    .trim()
    .split(/\s+/)
    .map((tok) => {
      const [id, diff] = tok.split(':') as [string, Diff];
      return { id, title: titleOf(id), diff, url: `https://leetcode.com/problems/${id}/`, week };
    });

export const WEEKS: Week[] = [
  {
    n: 1,
    gp: 'Bahrain',
    topic: 'Arrays, Hashing & Prefix Sums',
    month: 1,
    viz: ['prefix-hash'],
    concepts: `
## The idea
Most "subarray" questions collapse to: **sum(l..r) = prefix[r+1] − prefix[l]**. If you need a subarray with property X, store what you've *seen* in a hash map and ask "have I seen the prefix that makes X true?" — one pass, O(n).

| Question shape | Store in the map | Look up |
|---|---|---|
| count subarrays with sum = k | count of each prefix sum | \`prefix − k\` |
| longest subarray with sum = k | first index of each prefix | \`prefix − k\` |
| sum divisible by k | count of \`prefix mod k\` | same remainder |
| equal 0s and 1s | map 0 → −1, then "sum = 0" | \`prefix\` |

### Traps
- Seed the map with **prefix 0 → count 1** (or index −1), or you miss subarrays starting at 0.
- In C++/Java, \`%\` of a negative is negative — normalise: \`((p % k) + k) % k\`.
- "Product except self" is prefix *and* suffix products — no division, O(1) extra space if you reuse the output.

### Complexity
| Approach | Time | Space |
|---|---|---|
| brute force all subarrays | O(n²) | O(1) |
| prefix + hash map | O(n) | O(n) |
| 2D prefix (submatrix sums) | O(n·m) build, O(1) query | O(n·m) |
`,
    problems: P(1, `product-of-array-except-self:M subarray-sum-equals-k:M longest-consecutive-sequence:M contiguous-array:M continuous-subarray-sum:M group-anagrams:M
      top-k-frequent-elements:M first-missing-positive:H majority-element-ii:M subarray-sums-divisible-by-k:M count-number-of-nice-subarrays:M range-sum-query-2d-immutable:M`),
    test: P(1, 'find-all-duplicates-in-an-array:M insert-delete-getrandom-o1:M number-of-submatrices-that-sum-to-target:H'),
  },
  {
    n: 2,
    gp: 'Saudi Arabian',
    topic: 'Two Pointers & Sliding Window',
    month: 1,
    viz: ['two-pointers', 'sliding-window'],
    concepts: `
## Two pointers
Works when moving one end **monotonically** improves or worsens the answer — usually a *sorted* array or a *greedy* argument (container with most water: the shorter wall can never do better, so move it).

## Sliding window
A window \`[l, r]\` that only ever moves right. Expand \`r\`; while the window is **invalid**, shrink \`l\`. Every index enters and leaves once ⇒ **O(n)**.

| Variant | Window state | Shrink while |
|---|---|---|
| longest substring w/o repeat | last index / counts | a char count > 1 |
| at most K distinct | count map | \`map.size > K\` |
| exactly K distinct | — | use **atMost(K) − atMost(K−1)** |
| min window covering t | need/have counts | window still valid (shrink to minimise) |
| fixed size k max | monotonic deque | front index < r − k + 1 |

### Traps
- "Exactly K" is almost never a direct window — use the atMost trick.
- Negative numbers break the "shrink when sum too big" logic → prefix sums + deque instead.
- 3Sum: sort, fix \`i\`, two-pointer the rest, **skip duplicates** at all three positions.
`,
    problems: P(2, `3sum:M container-with-most-water:M trapping-rain-water:H longest-substring-without-repeating-characters:M longest-repeating-character-replacement:M permutation-in-string:M
      minimum-window-substring:H sliding-window-maximum:H fruit-into-baskets:M max-consecutive-ones-iii:M subarrays-with-k-different-integers:H minimum-size-subarray-sum:M`),
    test: P(2, '4sum:M find-all-anagrams-in-a-string:M substring-with-concatenation-of-all-words:H'),
  },
  {
    n: 3,
    gp: 'Australian',
    topic: 'Binary Search & Search on Answer',
    month: 1,
    viz: ['binary-search'],
    concepts: `
## One template, no off-by-ones
Find the **first index where a monotonic predicate becomes true**:
\`\`\`
lo, hi = 0, n          # answer is in [lo, hi]
while lo < hi:
    mid = (lo + hi) // 2
    if ok(mid): hi = mid
    else:       lo = mid + 1
return lo
\`\`\`

## Search on the answer
If "can we do it with value X?" is monotonic in X, binary search X itself.

| Problem | X | ok(X) |
|---|---|---|
| Koko bananas | eating speed | hours(X) ≤ h |
| Ship packages | capacity | days(X) ≤ D |
| Split array largest sum | max part sum | parts(X) ≤ m |
| Magnetic balls | min distance | can place m balls |

### Rotated arrays
One half of \`[lo, mid]\` / \`[mid, hi]\` is always sorted — check if the target lies in the sorted half.

### Complexity
O(log n) per search; search-on-answer is **O(n · log(range))**.
`,
    problems: P(3, `search-in-rotated-sorted-array:M find-minimum-in-rotated-sorted-array:M find-first-and-last-position-of-element-in-sorted-array:M search-a-2d-matrix:M koko-eating-bananas:M capacity-to-ship-packages-within-d-days:M
      split-array-largest-sum:H median-of-two-sorted-arrays:H find-peak-element:M time-based-key-value-store:M minimum-number-of-days-to-make-m-bouquets:M kth-smallest-element-in-a-sorted-matrix:M`),
    test: P(3, 'magnetic-force-between-two-balls:M search-in-rotated-sorted-array-ii:M find-k-th-smallest-pair-distance:H'),
  },
  {
    n: 4,
    gp: 'Japanese',
    topic: 'Stacks & Monotonic Stack / Queue',
    month: 1,
    viz: ['monotonic-stack'],
    concepts: `
## Monotonic stack
Keep indices whose values are **increasing** (or decreasing). When a new value breaks the order, everything you pop has just found its **next smaller/greater element** — each index is pushed and popped once ⇒ O(n).

| You need | Stack order | Pop when |
|---|---|---|
| next greater element | decreasing | \`a[i] > a[top]\` |
| next smaller element | increasing | \`a[i] < a[top]\` |
| largest rectangle | increasing heights | height drops — popped bar's width = i − newTop − 1 |
| sum of subarray minimums | increasing | count left/right spans, contribution = a[i]·L·R |

### Monotonic deque
Sliding-window max/min, and "shortest subarray with sum ≥ K" (deque of prefix sums — works with negatives).

### Traps
- Duplicates in contribution problems: use **strict** on one side and **non-strict** on the other, or you double count.
- Circular arrays: iterate \`2n\` and index with \`i % n\`.
`,
    problems: P(4, `valid-parentheses:E min-stack:M evaluate-reverse-polish-notation:M daily-temperatures:M next-greater-element-ii:M online-stock-span:M
      largest-rectangle-in-histogram:H maximal-rectangle:H sum-of-subarray-minimums:M remove-k-digits:M basic-calculator:H asteroid-collision:M`),
    test: P(4, 'decode-string:M car-fleet:M shortest-subarray-with-sum-at-least-k:H'),
  },
  {
    n: 5,
    gp: 'Chinese',
    topic: 'Linked Lists & Data-Structure Design',
    month: 2,
    viz: [],
    concepts: `
## Pointer moves you should be able to write blind
- **Reverse**: \`prev = null; while cur: nxt = cur.next; cur.next = prev; prev = cur; cur = nxt\`
- **Middle / cycle**: slow 1 step, fast 2 steps. Cycle start: after meeting, reset one to head, step both by 1.
- **Dummy head**: removes every "is this the first node?" special case.

## Design problems = pick two structures that cover each other's weakness
| Design | Structures | Why |
|---|---|---|
| LRU cache | hash map + doubly linked list | O(1) lookup + O(1) move-to-front |
| LFU cache | key map + freq → DLL map + minFreq | O(1) evict least frequent, then least recent |
| GetRandom O(1) | array + value→index map | swap-with-last delete |
| All O\`one | DLL of count buckets | O(1) inc/dec/min/max |

### Traps
- Reverse-k-group: count k nodes *before* reversing, or the tail gets reversed too.
- Copy list with random pointer: interleave copies (A→A'→B→B') for O(1) space.
`,
    problems: P(5, `reverse-linked-list:E reverse-linked-list-ii:M linked-list-cycle-ii:M reorder-list:M remove-nth-node-from-end-of-list:M copy-list-with-random-pointer:M
      add-two-numbers:M lru-cache:M merge-k-sorted-lists:H reverse-nodes-in-k-group:H sort-list:M lfu-cache:H`),
    test: P(5, 'swap-nodes-in-pairs:M flatten-a-multilevel-doubly-linked-list:M all-oone-data-structure:H'),
  },
  {
    n: 6,
    gp: 'Miami',
    topic: 'Recursion & Backtracking',
    month: 2,
    viz: ['backtracking'],
    concepts: `
## The template
\`\`\`
def bt(state):
    if done(state): record(); return
    for choice in choices(state):
        if not valid(choice): continue      # prune EARLY
        apply(choice)
        bt(state)
        undo(choice)                        # the "back" in backtracking
\`\`\`

| Problem | Choice at each level | Prune |
|---|---|---|
| subsets | take / skip nums[i] | — |
| subsets II (dupes) | sort; skip \`nums[i] == nums[i-1]\` at same depth | duplicate branch |
| permutations | any unused element | used[] |
| combination sum | nums[i..] (reuse allowed → stay at i) | sum > target |
| N-Queens | column for row r | cols / diag \`r−c\` / anti-diag \`r+c\` sets |
| word search | 4 neighbours | mismatch / visited |

### Complexity
Subsets O(n·2ⁿ), permutations O(n·n!) — exponential is expected; pruning is what makes it pass.
`,
    problems: P(6, `subsets:M subsets-ii:M permutations:M combination-sum:M combination-sum-ii:M palindrome-partitioning:M
      word-search:M n-queens:H sudoku-solver:H letter-combinations-of-a-phone-number:M generate-parentheses:M expression-add-operators:H`),
    test: P(6, 'beautiful-arrangement:M matchsticks-to-square:M word-break-ii:H'),
  },
  {
    n: 7,
    gp: 'Emilia-Romagna',
    topic: 'Trees & BST',
    month: 2,
    viz: ['tree-bfs'],
    concepts: `
## Two ways to see every tree problem
1. **What does my subtree return to my parent?** (post-order DFS) — height, max path, "is balanced", diameter.
2. **What does my parent pass down?** (pre-order DFS) — bounds for BST validation, path so far, depth.

| Problem | Returns up | Passes down |
|---|---|---|
| diameter | height | — (update global with L+R) |
| max path sum | best single-branch gain (clamp at 0) | — |
| validate BST | — | (low, high) bounds |
| path sum III | — | running prefix sums (prefix-hash again!) |
| LCA | node if found in subtree | — |

### BFS
Level order with a queue; process \`len(queue)\` nodes per level. Width of tree: carry index \`2i\`, \`2i+1\` (normalise per level to avoid overflow).

### Traps
- Serialize/deserialize: write null markers or the shape is ambiguous.
- Inorder of a BST is **sorted** — kth smallest, recover BST, validate.
`,
    problems: P(7, `binary-tree-level-order-traversal:M binary-tree-right-side-view:M lowest-common-ancestor-of-a-binary-tree:M validate-binary-search-tree:M kth-smallest-element-in-a-bst:M construct-binary-tree-from-preorder-and-inorder-traversal:M
      binary-tree-maximum-path-sum:H serialize-and-deserialize-binary-tree:H diameter-of-binary-tree:E path-sum-iii:M all-nodes-distance-k-in-binary-tree:M binary-tree-zigzag-level-order-traversal:M`),
    test: P(7, 'count-good-nodes-in-binary-tree:M maximum-width-of-binary-tree:M vertical-order-traversal-of-a-binary-tree:H'),
  },
  {
    n: 8,
    gp: 'Monaco',
    topic: 'Heaps, Greedy & Intervals',
    month: 2,
    viz: ['heap'],
    concepts: `
## Heaps
| Need | Heap |
|---|---|
| k largest | **min**-heap of size k |
| running median | max-heap (low half) + min-heap (high half), sizes differ ≤ 1 |
| merge k sorted | min-heap of (value, list, index) |
| schedule by deadline/profit | sort by one key, heap by the other (IPO, refueling) |

## Greedy
Greedy is right when an **exchange argument** works: swapping any optimal solution's choice for the greedy choice never makes it worse. If you can't argue that in one sentence, suspect DP.

## Intervals
Sort by **start** to merge; sort by **end** to pick the max number of non-overlapping (activity selection).
| Problem | Sort by | Then |
|---|---|---|
| merge intervals | start | extend last end |
| non-overlapping (min removals) | end | keep if start ≥ lastEnd |
| arrows for balloons | end | same as above |
| meeting rooms / car pooling | events (+1/−1) | sweep line |
`,
    problems: P(8, `kth-largest-element-in-an-array:M find-median-from-data-stream:H task-scheduler:M merge-intervals:M insert-interval:M non-overlapping-intervals:M
      minimum-number-of-arrows-to-burst-balloons:M jump-game-ii:M gas-station:M ipo:H candy:H reorganize-string:M`),
    test: P(8, 'hand-of-straights:M car-pooling:M minimum-number-of-refueling-stops:H'),
  },
  {
    n: 9,
    gp: 'Canadian',
    topic: 'Graphs I — BFS, DFS & Topological Sort',
    month: 3,
    viz: ['grid-bfs', 'topo-sort'],
    concepts: `
## Pick the traversal by the question
| Question | Tool |
|---|---|
| shortest path, unweighted | **BFS** (first time you reach a node = shortest) |
| many sources at once (rotting oranges, 01-matrix) | **multi-source BFS** — push all sources first |
| connected components / flood fill | DFS or BFS or DSU |
| ordering with prerequisites | **topological sort** (Kahn: in-degree 0 queue) |
| cycle in directed graph | Kahn leaves nodes unprocessed, or DFS 3-colour |
| bipartite | BFS 2-colouring |

### Grid as a graph
Neighbours: \`for dr, dc in ((1,0),(-1,0),(0,1),(0,-1))\`. Mark visited **when you push**, not when you pop — otherwise the same cell enters the queue many times.

### State-space BFS
"Shortest path to get all keys": node = (r, c, keysBitmask). Visited is per state, not per cell.

### Complexity
O(V + E); grids O(R·C).
`,
    problems: P(9, `number-of-islands:M rotting-oranges:M clone-graph:M pacific-atlantic-water-flow:M course-schedule:M course-schedule-ii:M
      surrounded-regions:M word-ladder:H shortest-path-in-binary-matrix:M 01-matrix:M find-eventual-safe-states:M making-a-large-island:H`),
    test: P(9, 'is-graph-bipartite:M snakes-and-ladders:M shortest-path-to-get-all-keys:H'),
  },
  {
    n: 10,
    gp: 'Spanish',
    topic: 'Graphs II — Shortest Paths, MST & Union-Find',
    month: 3,
    viz: ['dijkstra', 'union-find'],
    concepts: `
## Shortest paths
| Graph | Algorithm | Time |
|---|---|---|
| unweighted | BFS | O(V+E) |
| 0/1 weights | 0-1 BFS (deque) | O(V+E) |
| non-negative weights | **Dijkstra** (min-heap) | O(E log V) |
| ≤ K edges / negative edges | Bellman-Ford (K rounds) | O(K·E) |
| all pairs, small V | Floyd–Warshall | O(V³) |

Dijkstra: skip a popped entry if \`d > dist[u]\` (stale). "Minimise the max edge on the path" (min effort, swim in water) is still Dijkstra with \`max\` instead of \`+\`.

## Union-Find (DSU)
\`find\` with path compression + \`union\` by size ⇒ near-O(1). Use it for dynamic connectivity, redundant edges, Kruskal's MST, and "group by equivalence" (accounts merge, equations).

## MST
Kruskal: sort edges, add if endpoints are in different components. Prim: heap from any node.

## Bridges (critical connections)
Tarjan: edge (u,v) is a bridge iff \`low[v] > tin[u]\`.
`,
    problems: P(10, `network-delay-time:M cheapest-flights-within-k-stops:M path-with-minimum-effort:M swim-in-rising-water:H min-cost-to-connect-all-points:M redundant-connection:M
      number-of-provinces:M accounts-merge:M number-of-operations-to-make-network-connected:M find-the-city-with-the-smallest-number-of-neighbors-at-a-threshold-distance:M critical-connections-in-a-network:H remove-max-number-of-edges-to-keep-graph-fully-traversable:H`),
    test: P(10, 'path-with-maximum-probability:M satisfiability-of-equality-equations:M minimum-cost-to-make-at-least-one-valid-path-in-a-grid:H'),
  },
  {
    n: 11,
    gp: 'Austrian',
    topic: 'Dynamic Programming I — 1D, Knapsack & LIS',
    month: 3,
    viz: ['coin-change'],
    concepts: `
## How to design any DP
1. **State** — what changes between subproblems? (\`i\`, remaining capacity, last choice…)
2. **Transition** — the choices at a state, as a formula.
3. **Base cases**, then **order** (which states must be computed first).
4. Optimise space only after it's correct.

| Family | State | Transition |
|---|---|---|
| house robber | i | \`max(dp[i-1], dp[i-2] + a[i])\` |
| 0/1 knapsack / subset sum | capacity (iterate **backwards**) | \`dp[c] |= dp[c - w]\` |
| unbounded knapsack / coin change | amount (iterate **forwards**) | \`dp[a] = min(dp[a], dp[a-coin] + 1)\` |
| count ways (coin change II) | coins outer loop, amount inner | \`dp[a] += dp[a-coin]\` (order ⇒ combinations) |
| LIS | tails array | binary search → **O(n log n)** |
| stock with states | (day, holding, cooldown) | small state machine |

### Traps
- Loop order in coin change II: coins outer = combinations, amount outer = permutations.
- Target sum reduces to subset sum: \`(sum + target) / 2\`.
`,
    problems: P(11, `house-robber-ii:M coin-change:M coin-change-ii:M partition-equal-subset-sum:M target-sum:M word-break:M
      decode-ways:M longest-increasing-subsequence:M russian-doll-envelopes:H maximum-product-subarray:M best-time-to-buy-and-sell-stock-with-cooldown:M last-stone-weight-ii:M`),
    test: P(11, 'perfect-squares:M number-of-longest-increasing-subsequence:M best-time-to-buy-and-sell-stock-iv:H'),
  },
  {
    n: 12,
    gp: 'British',
    topic: 'Dynamic Programming II — Grids, Strings, Intervals & Bitmask',
    month: 3,
    viz: ['lcs'],
    concepts: `
## Two-string DP: \`dp[i][j]\` = answer for prefixes a[:i], b[:j]
| Problem | if a[i-1] == b[j-1] | else |
|---|---|---|
| LCS | \`dp[i-1][j-1] + 1\` | \`max(dp[i-1][j], dp[i][j-1])\` |
| edit distance | \`dp[i-1][j-1]\` | \`1 + min(ins, del, replace)\` |
| distinct subsequences | \`dp[i-1][j-1] + dp[i-1][j]\` | \`dp[i-1][j]\` |

## Interval DP: \`dp[l][r]\`, iterate by **length**
Burst balloons: choose the **last** balloon \`k\` to burst in (l, r): \`dp[l][k] + dp[k][r] + a[l]·a[k]·a[r]\`. Thinking "last" instead of "first" is what makes subproblems independent.

## Bitmask DP
State includes a set as bits: \`dp[mask]\`. Feasible for n ≤ ~20 (2²⁰ ≈ 10⁶). Partition into k equal subsets, smallest sufficient team, TSP-style visiting all nodes.

### Complexity
Two-string O(n·m); interval O(n³); bitmask O(2ⁿ·n).
`,
    problems: P(12, `unique-paths-ii:M minimum-path-sum:M longest-common-subsequence:M edit-distance:M longest-palindromic-subsequence:M distinct-subsequences:H
      interleaving-string:M burst-balloons:H regular-expression-matching:H minimum-cost-tree-from-leaf-values:M partition-to-k-equal-sum-subsets:M maximal-square:M`),
    test: P(12, 'minimum-falling-path-sum:M wildcard-matching:H palindrome-partitioning-ii:H'),
  },
  {
    n: 13,
    gp: 'Abu Dhabi',
    topic: 'Tries, Segment Trees, Fenwick & String Algorithms',
    month: 4,
    viz: ['kmp'],
    concepts: `
## Tries
Prefix tree: each edge a character. Word search II = DFS on the board while walking the trie (prune when the prefix dies). Max XOR = binary trie, greedily take the opposite bit.

## Range queries with updates
| Need | Structure | Update | Query |
|---|---|---|---|
| prefix sums, point update | **Fenwick (BIT)** | O(log n) | O(log n) |
| any associative range op | **segment tree** | O(log n) | O(log n) |
| range add + range sum | segment tree + lazy | O(log n) | O(log n) |

"Count smaller after self" / "reverse pairs" / "count of range sum": coordinate-compress, then BIT — or merge-sort counting.

## String matching
- **KMP** \`lps[i]\` = longest proper prefix of \`s[:i+1]\` that's also a suffix. Matching never moves backwards in the text ⇒ O(n + m).
- Shortest palindrome = KMP on \`s + "#" + reverse(s)\`.
- **Rolling hash** (Rabin–Karp) + binary search on length: longest duplicate substring.
`,
    problems: P(13, `implement-trie-prefix-tree:M design-add-and-search-words-data-structure:M word-search-ii:H maximum-xor-of-two-numbers-in-an-array:M range-sum-query-mutable:M count-of-smaller-numbers-after-self:H
      reverse-pairs:H my-calendar-iii:H find-the-index-of-the-first-occurrence-in-a-string:E shortest-palindrome:H longest-duplicate-substring:H repeated-dna-sequences:M`),
    test: P(13, 'longest-happy-prefix:H palindrome-pairs:H count-of-range-sum:H'),
  },
];

export const MEGAS: Mega[] = [
  {
    id: 'mega-1',
    title: 'Grand Prix I — Arrays to Stacks',
    afterWeek: 4,
    covers: [1, 2, 3, 4],
    durationMin: 180,
    problems: P(0, `maximum-sum-circular-subarray:M longest-turbulent-subarray:M minimum-operations-to-reduce-x-to-zero:M find-the-duplicate-number:M
      number-of-subarrays-with-bounded-maximum:M kth-smallest-number-in-multiplication-table:H`),
  },
  {
    id: 'mega-2',
    title: 'Grand Prix II — Lists, Recursion, Trees, Heaps',
    afterWeek: 8,
    covers: [5, 6, 7, 8],
    durationMin: 180,
    problems: P(0, `design-browser-history:M restore-ip-addresses:M recover-binary-search-tree:M count-complete-tree-nodes:M
      maximum-performance-of-a-team:H smallest-range-covering-elements-from-k-lists:H`),
  },
  {
    id: 'mega-3',
    title: 'Grand Prix III — Graphs & DP',
    afterWeek: 12,
    covers: [9, 10, 11, 12],
    durationMin: 180,
    problems: P(0, `bus-routes:H longest-increasing-path-in-a-matrix:H frog-jump:H maximum-profit-in-job-scheduling:H minimum-difficulty-of-a-job-schedule:H cherry-pickup:H`),
  },
  {
    id: 'finale',
    title: 'Season Finale — Everything',
    afterWeek: 13,
    covers: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13],
    durationMin: 210,
    problems: P(0, `sliding-window-median:H maximum-frequency-stack:H trapping-rain-water-ii:H stream-of-characters:H minimum-cost-to-cut-a-stick:H parallel-courses-iii:H`),
  },
];

export const ALL_PRACTICE = WEEKS.flatMap((w) => w.problems);
/** Easy warm-ups the Academy hands out before each week's real set (not counted in season points). */
export const WARMUPS: Problem[] = [
  ...P(1, 'contains-duplicate:E two-sum:E valid-anagram:E running-sum-of-1d-array:E range-sum-query-immutable:E find-pivot-index:E'),
  ...P(3, 'binary-search:E search-insert-position:E first-bad-version:E sqrtx:E guess-number-higher-or-lower:E arranging-coins:E'),
  ...P(4, 'baseball-game:E backspace-string-compare:E implement-queue-using-stacks:E remove-all-adjacent-duplicates-in-string:E next-greater-element-i:E final-prices-with-a-special-discount-in-a-shop:E'),
  ...P(2, 'valid-palindrome:E two-sum-ii-input-array-is-sorted:M squares-of-a-sorted-array:E move-zeroes:E remove-duplicates-from-sorted-array:E merge-sorted-array:E maximum-average-subarray-i:E best-time-to-buy-and-sell-stock:E contains-duplicate-ii:E'),
];
export const findProblem = (id: string) => [...ALL_PRACTICE, ...WEEKS.flatMap((w) => w.test), ...MEGAS.flatMap((m) => m.problems), ...WARMUPS].find((p) => p.id === id);

/** Points like an F1 finish: harder = more. */
export const POINTS: Record<Diff, number> = { E: 3, M: 8, H: 15 };

// ---------- Season calendar math ----------
const dnum = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000);
};
const fromNum = (n: number) => new Date(n * 86_400_000).toISOString().slice(0, 10);

/** Default start: the Monday after the plan was created (2 Nov 2026). Stored in settings once chosen. */
export const DEFAULT_START = '2026-11-02';

export function weekDates(start: string, n: number) {
  const s = dnum(start) + (n - 1) * 7;
  return { start: fromNum(s), end: fromNum(s + 6), testDay: fromNum(s + 6) };
}

/** Which week the date falls in (1-based); 0 before the season, 14 after. */
export function currentWeek(start: string, date: string) {
  const diff = dnum(date) - dnum(start);
  if (diff < 0) return 0;
  return Math.min(WEEKS.length + 1, Math.floor(diff / 7) + 1);
}

/** Practice problems scheduled on a given day (2 per day Mon–Sat, in plan order). */
export function problemsForDay(start: string, date: string) {
  const diff = dnum(date) - dnum(start);
  if (diff < 0) return [];
  const w = WEEKS[Math.floor(diff / 7)];
  const dow = diff % 7;
  if (!w || dow === 6) return [];
  return w.problems.slice(dow * 2, dow * 2 + 2);
}

export const megaDate = (start: string, m: Mega) => weekDates(start, m.afterWeek).testDay;
