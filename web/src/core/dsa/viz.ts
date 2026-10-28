// Algorithm visualizers as pure frame generators (no React / DOM). Each `run` replays the
// algorithm on the user's input and records a snapshot per meaningful step. Rendering, timing
// and playback live in the UI layer; this file can be tested headless.

export type Mark = 'active' | 'done' | 'hit' | 'queued' | 'dim' | 'wall' | 'swap';
export type Cell = number | string | null;
export type Ptr = { name: string; index: number };
export type ArrayState = { name: string; values: Cell[]; pointers?: Ptr[]; window?: [number, number]; marks?: Record<number, Mark> };
export type TableState = { name: string; rows: Cell[][]; rowLabels?: string[]; colLabels?: string[]; marks?: Record<string, Mark> };
export type GNode = { id: string; x: number; y: number; label?: string };
export type GEdge = { a: string; b: string; w?: number; directed?: boolean };
export type GraphState = { nodes: GNode[]; edges: GEdge[]; nodeMarks?: Record<string, Mark>; edgeMarks?: Record<string, Mark>; badges?: Record<string, string> };
export type TreeState = { nodes: { id: string; label: string; parent: string | null; side?: 'L' | 'R' }[]; marks?: Record<string, Mark> };
export type Frame = { line?: string; msg: string; arrays?: ArrayState[]; tables?: TableState[]; graph?: GraphState; tree?: TreeState; vars?: Record<string, Cell | boolean> };

export type Algo = {
  id: string;
  title: string;
  pattern: string;
  problem: string;
  blurb: string;
  inputs: { key: string; label: string; value: string }[];
  run: (inp: Record<string, string>) => Frame[];
};

const nums = (s: string) => s.split(/[\s,]+/).filter(Boolean).map(Number).filter((n) => !Number.isNaN(n));
const clone = <T,>(x: T): T => structuredClone(x);
const LIMIT = 600; // frame cap so a huge input can't freeze the tab

function recorder() {
  const frames: Frame[] = [];
  return { frames, push: (f: Frame) => frames.length < LIMIT && frames.push(clone(f)) };
}

const circle = (ids: string[], r = 38): GNode[] =>
  ids.map((id, i) => {
    const a = (i / ids.length) * Math.PI * 2 - Math.PI / 2;
    return { id, label: id, x: 50 + r * Math.cos(a), y: 50 + r * Math.sin(a) };
  });

/** "A-B:4, B->C" → edges; `->` makes it directed. */
function parseEdges(s: string) {
  const edges: GEdge[] = [];
  for (const tok of s.split(/[,\n]+/).map((t) => t.trim()).filter(Boolean)) {
    const m = /^(\w+)\s*(->|-)\s*(\w+)(?::\s*(-?\d+(?:\.\d+)?))?$/.exec(tok);
    if (m) edges.push({ a: m[1], b: m[3], directed: m[2] === '->', w: m[4] !== undefined ? Number(m[4]) : undefined });
  }
  return edges;
}
const nodeIds = (edges: GEdge[]) => [...new Set(edges.flatMap((e) => [e.a, e.b]))].sort((a, b) => (isNaN(+a) || isNaN(+b) ? a.localeCompare(b) : +a - +b));
const ek = (a: string, b: string) => `${a}|${b}`;

// ---------------------------------------------------------------------------------------------

const prefixHash: Algo = {
  id: 'prefix-hash',
  title: 'Prefix sum + hash map',
  pattern: 'Prefix sums',
  problem: 'subarray-sum-equals-k',
  blurb: 'Count subarrays summing to k in one pass: at each index, how many earlier prefixes equal prefix − k?',
  inputs: [
    { key: 'nums', label: 'nums', value: '1, 2, 3, -2, 2, 1, 3' },
    { key: 'k', label: 'k', value: '3' },
  ],
  run(inp) {
    const a = nums(inp.nums);
    const k = Number(inp.k) || 0;
    const { frames, push } = recorder();
    const seen = new Map<number, number>([[0, 1]]);
    const mapArr = () => ({ name: 'seen (prefix → count)', values: [...seen].map(([p, c]) => `${p}→${c}`) });
    let prefix = 0;
    let count = 0;
    push({ line: 'init', msg: 'Seed the map with prefix 0 seen once — that covers subarrays starting at index 0.', arrays: [{ name: 'nums', values: a }, mapArr()], vars: { prefix, count, k } });
    for (let i = 0; i < a.length; i++) {
      prefix += a[i];
      push({ line: 'add', msg: `Add nums[${i}] = ${a[i]} → prefix = ${prefix}.`, arrays: [{ name: 'nums', values: a, pointers: [{ name: 'i', index: i }], window: [0, i] }, mapArr()], vars: { prefix, count, k } });
      const hit = seen.get(prefix - k) ?? 0;
      count += hit;
      const keys = [...seen.keys()];
      push({
        line: 'lookup',
        msg: hit ? `prefix − k = ${prefix - k} seen ${hit}× → ${hit} subarray(s) end here. count = ${count}.` : `prefix − k = ${prefix - k} not seen — no subarray ends here.`,
        arrays: [{ name: 'nums', values: a, pointers: [{ name: 'i', index: i }] }, { ...mapArr(), marks: hit ? { [keys.indexOf(prefix - k)]: 'hit' } : {} }],
        vars: { prefix, count, k },
      });
      seen.set(prefix, (seen.get(prefix) ?? 0) + 1);
      push({ line: 'store', msg: `Record prefix ${prefix}.`, arrays: [{ name: 'nums', values: a, pointers: [{ name: 'i', index: i }] }, { ...mapArr(), marks: { [[...seen.keys()].indexOf(prefix)]: 'active' } }], vars: { prefix, count, k } });
    }
    push({ line: 'done', msg: `Answer: ${count} subarrays sum to ${k}.`, arrays: [{ name: 'nums', values: a }, mapArr()], vars: { prefix, count, k } });
    return frames;
  },
};

const twoPointers: Algo = {
  id: 'two-pointers',
  title: 'Two pointers — container with most water',
  pattern: 'Two pointers',
  problem: 'container-with-most-water',
  blurb: 'Start wide; always move the shorter wall inward — keeping it can never give a bigger area.',
  inputs: [{ key: 'h', label: 'heights', value: '1, 8, 6, 2, 5, 4, 8, 3, 7' }],
  run(inp) {
    const h = nums(inp.h);
    const { frames, push } = recorder();
    let l = 0;
    let r = h.length - 1;
    let best = 0;
    push({ line: 'init', msg: 'Pointers at both ends — the widest container.', arrays: [{ name: 'height', values: h, pointers: [{ name: 'L', index: l }, { name: 'R', index: r }], window: [l, r] }], vars: { best } });
    while (l < r) {
      const area = Math.min(h[l], h[r]) * (r - l);
      const better = area > best;
      best = Math.max(best, area);
      push({ line: 'area', msg: `min(${h[l]}, ${h[r]}) × ${r - l} = ${area}${better ? ' — new best!' : ''}`, arrays: [{ name: 'height', values: h, pointers: [{ name: 'L', index: l }, { name: 'R', index: r }], window: [l, r], marks: better ? { [l]: 'hit', [r]: 'hit' } : {} }], vars: { area, best } });
      const moveL = h[l] < h[r];
      if (moveL) l++;
      else r--;
      push({ line: 'move', msg: `Move ${moveL ? 'L' : 'R'} inward — it is the shorter wall, so keeping it can't help.`, arrays: [{ name: 'height', values: h, pointers: [{ name: 'L', index: l }, { name: 'R', index: r }], window: [l, r] }], vars: { best } });
    }
    push({ line: 'done', msg: `Max water: ${best}.`, arrays: [{ name: 'height', values: h }], vars: { best } });
    return frames;
  },
};

const slidingWindow: Algo = {
  id: 'sliding-window',
  title: 'Sliding window — longest substring without repeats',
  pattern: 'Sliding window',
  problem: 'longest-substring-without-repeating-characters',
  blurb: 'Grow the window right; when a character repeats, jump the left edge past its previous position.',
  inputs: [{ key: 's', label: 's', value: 'abcabcbb' }],
  run(inp) {
    const s = [...(inp.s || '')];
    const { frames, push } = recorder();
    const last = new Map<string, number>();
    let l = 0;
    let best = 0;
    let bestRange: [number, number] = [0, -1];
    for (let r = 0; r < s.length; r++) {
      const c = s[r];
      if (last.has(c) && last.get(c)! >= l) {
        push({ line: 'repeat', msg: `'${c}' already in window at ${last.get(c)} → move L to ${last.get(c)! + 1}.`, arrays: [{ name: 's', values: s, pointers: [{ name: 'L', index: l }, { name: 'R', index: r }], window: [l, r], marks: { [last.get(c)!]: 'swap', [r]: 'swap' } }], vars: { best } });
        l = last.get(c)! + 1;
      }
      last.set(c, r);
      if (r - l + 1 > best) (best = r - l + 1), (bestRange = [l, r]);
      push({ line: 'expand', msg: `Window "${s.slice(l, r + 1).join('')}" (length ${r - l + 1}). best = ${best}.`, arrays: [{ name: 's', values: s, pointers: [{ name: 'L', index: l }, { name: 'R', index: r }], window: [l, r] }, { name: 'last seen', values: [...last].map(([k, v]) => `${k}:${v}`) }], vars: { best } });
    }
    const marks: Record<number, Mark> = {};
    for (let i = bestRange[0]; i <= bestRange[1]; i++) marks[i] = 'hit';
    push({ line: 'done', msg: `Longest: "${s.slice(bestRange[0], bestRange[1] + 1).join('')}" = ${best}.`, arrays: [{ name: 's', values: s, marks }], vars: { best } });
    return frames;
  },
};

const binarySearch: Algo = {
  id: 'binary-search',
  title: 'Binary search — first index ≥ target',
  pattern: 'Binary search',
  problem: 'find-first-and-last-position-of-element-in-sorted-array',
  blurb: 'Keep the answer inside [lo, hi). Each step discards half — the dimmed cells are proven not to contain it.',
  inputs: [
    { key: 'a', label: 'sorted nums', value: '1, 3, 3, 5, 7, 7, 7, 9, 12, 15, 18' },
    { key: 't', label: 'target', value: '7' },
  ],
  run(inp) {
    const a = nums(inp.a);
    const t = Number(inp.t);
    const { frames, push } = recorder();
    let lo = 0;
    let hi = a.length;
    const dim = () => Object.fromEntries(a.map((_, i) => [i, i < lo || i >= hi ? 'dim' : undefined]).filter(([, v]) => v)) as Record<number, Mark>;
    push({ line: 'init', msg: `Search space [0, ${hi}).`, arrays: [{ name: 'nums', values: a, pointers: [{ name: 'lo', index: lo }, { name: 'hi', index: hi }] }], vars: { target: t } });
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      push({ line: 'mid', msg: `mid = ${mid}, nums[mid] = ${a[mid]}.`, arrays: [{ name: 'nums', values: a, pointers: [{ name: 'lo', index: lo }, { name: 'mid', index: mid }, { name: 'hi', index: hi }], marks: { ...dim(), [mid]: 'active' } }], vars: { target: t } });
      if (a[mid] >= t) {
        hi = mid;
        push({ line: 'left', msg: `${a[mid]} ≥ ${t} → answer is at mid or left: hi = ${mid}.`, arrays: [{ name: 'nums', values: a, pointers: [{ name: 'lo', index: lo }, { name: 'hi', index: hi }], marks: dim() }], vars: { target: t } });
      } else {
        lo = mid + 1;
        push({ line: 'right', msg: `${a[mid]} < ${t} → discard left half: lo = ${lo}.`, arrays: [{ name: 'nums', values: a, pointers: [{ name: 'lo', index: lo }, { name: 'hi', index: hi }], marks: dim() }], vars: { target: t } });
      }
    }
    push({ line: 'done', msg: lo < a.length && a[lo] === t ? `First ${t} at index ${lo}.` : `Not found — insertion point ${lo}.`, arrays: [{ name: 'nums', values: a, pointers: [{ name: 'ans', index: lo }], marks: { ...dim(), [lo]: 'hit' } }], vars: { target: t, answer: lo } });
    return frames;
  },
};

const monoStack: Algo = {
  id: 'monotonic-stack',
  title: 'Monotonic stack — daily temperatures',
  pattern: 'Monotonic stack',
  problem: 'daily-temperatures',
  blurb: 'The stack holds days still waiting for a warmer one. A warmer day pops — and answers — everyone colder.',
  inputs: [{ key: 't', label: 'temps', value: '73, 74, 75, 71, 69, 72, 76, 73' }],
  run(inp) {
    const t = nums(inp.t);
    const { frames, push } = recorder();
    const ans: Cell[] = t.map(() => 0);
    const st: number[] = [];
    const view = (i: number, marks: Record<number, Mark> = {}): ArrayState[] => [
      { name: 'temps', values: t, pointers: [{ name: 'i', index: i }], marks },
      { name: 'stack (indices)', values: st.map((x) => `${x}:${t[x]}`) },
      { name: 'answer', values: ans },
    ];
    for (let i = 0; i < t.length; i++) {
      push({ line: 'loop', msg: `Day ${i}: ${t[i]}°.`, arrays: view(i) });
      while (st.length && t[i] > t[st.at(-1)!]) {
        const j = st.pop()!;
        ans[j] = i - j;
        push({ line: 'pop', msg: `${t[i]} > ${t[j]} → day ${j} waits ${i - j} day(s).`, arrays: view(i, { [j]: 'hit', [i]: 'active' }) });
      }
      st.push(i);
      push({ line: 'push', msg: `Push day ${i} — waiting for something warmer than ${t[i]}.`, arrays: view(i) });
    }
    push({ line: 'done', msg: 'Days left on the stack never get warmer → 0.', arrays: view(t.length - 1) });
    return frames;
  },
};

const backtracking: Algo = {
  id: 'backtracking',
  title: 'Backtracking — all subsets',
  pattern: 'Backtracking',
  problem: 'subsets',
  blurb: 'Every level decides one element: take it or skip it. Leaves are the 2ⁿ subsets.',
  inputs: [{ key: 'nums', label: 'nums', value: '1, 2, 3' }],
  run(inp) {
    const a = nums(inp.nums).slice(0, 4);
    const { frames, push } = recorder();
    const tree: TreeState = { nodes: [{ id: 'r', label: '{}', parent: null }], marks: {} };
    const results: string[] = [];
    const path: number[] = [];
    const go = (i: number, id: string) => {
      tree.marks![id] = 'active';
      push({ line: 'enter', msg: `At depth ${i}, path = [${path.join(', ')}].`, tree, arrays: [{ name: 'path', values: [...path] }, { name: 'results', values: [...results] }] });
      if (i === a.length) {
        results.push(`{${path.join(',')}}`);
        tree.marks![id] = 'hit';
        push({ line: 'record', msg: `Leaf → record {${path.join(', ')}}.`, tree, arrays: [{ name: 'path', values: [...path] }, { name: 'results', values: [...results] }] });
        return;
      }
      path.push(a[i]);
      const take = `${id}T`;
      tree.nodes.push({ id: take, label: `+${a[i]}`, parent: id, side: 'L' });
      push({ line: 'take', msg: `Take ${a[i]}.`, tree, arrays: [{ name: 'path', values: [...path] }, { name: 'results', values: [...results] }] });
      go(i + 1, take);
      tree.marks![take] = 'done';
      path.pop();
      push({ line: 'undo', msg: `Undo: remove ${a[i]} (back-track).`, tree, arrays: [{ name: 'path', values: [...path] }, { name: 'results', values: [...results] }] });
      const skip = `${id}S`;
      tree.nodes.push({ id: skip, label: `−${a[i]}`, parent: id, side: 'R' });
      push({ line: 'skip', msg: `Skip ${a[i]}.`, tree, arrays: [{ name: 'path', values: [...path] }, { name: 'results', values: [...results] }] });
      go(i + 1, skip);
      tree.marks![skip] = 'done';
    };
    go(0, 'r');
    push({ line: 'done', msg: `${results.length} subsets.`, tree, arrays: [{ name: 'results', values: results }] });
    return frames;
  },
};

/** Level-order array ("3,9,20,null,null,15,7") → tree nodes. */
function buildTree(s: string) {
  const vals = s.split(/[\s,]+/).filter(Boolean);
  const nodes: TreeState['nodes'] = [];
  if (!vals.length || vals[0] === 'null') return nodes;
  nodes.push({ id: '0', label: vals[0], parent: null });
  const q = ['0'];
  let i = 1;
  while (q.length && i < vals.length) {
    const p = q.shift()!;
    for (const side of ['L', 'R'] as const) {
      if (i < vals.length && vals[i] !== 'null') {
        const id = String(i);
        nodes.push({ id, label: vals[i], parent: p, side });
        q.push(id);
      }
      i++;
    }
  }
  return nodes;
}

const treeBfs: Algo = {
  id: 'tree-bfs',
  title: 'Tree BFS — level order',
  pattern: 'Trees · BFS',
  problem: 'binary-tree-level-order-traversal',
  blurb: 'Process exactly len(queue) nodes per round — that boundary is what separates the levels.',
  inputs: [{ key: 't', label: 'tree (level order)', value: '3, 9, 20, 4, 5, 15, 7, null, null, 8' }],
  run(inp) {
    const nodes = buildTree(inp.t);
    const { frames, push } = recorder();
    const marks: Record<string, Mark> = {};
    const kids = (id: string) => ['L', 'R'].map((s) => nodes.find((n) => n.parent === id && n.side === s)).filter(Boolean) as typeof nodes;
    const label = (id: string) => nodes.find((n) => n.id === id)!.label;
    const levels: string[] = [];
    const q = nodes.length ? [nodes[0].id] : [];
    if (q.length) marks[q[0]] = 'queued';
    push({ line: 'init', msg: 'Queue the root.', tree: { nodes, marks }, arrays: [{ name: 'queue', values: q.map(label) }, { name: 'levels', values: [] }] });
    while (q.length) {
      const size = q.length;
      const level: string[] = [];
      push({ line: 'level', msg: `New level: ${size} node(s) in the queue.`, tree: { nodes, marks }, arrays: [{ name: 'queue', values: q.map(label) }, { name: 'levels', values: [...levels] }] });
      for (let k = 0; k < size; k++) {
        const id = q.shift()!;
        marks[id] = 'active';
        level.push(label(id));
        for (const c of kids(id)) (q.push(c.id), (marks[c.id] = 'queued'));
        push({ line: 'visit', msg: `Visit ${label(id)}; enqueue its children.`, tree: { nodes, marks }, arrays: [{ name: 'queue', values: q.map(label) }, { name: 'current level', values: [...level] }, { name: 'levels', values: [...levels] }] });
        marks[id] = 'done';
      }
      levels.push(`[${level.join(',')}]`);
    }
    push({ line: 'done', msg: `Levels: ${levels.join(' ')}`, tree: { nodes, marks }, arrays: [{ name: 'levels', values: levels }] });
    return frames;
  },
};

const heap: Algo = {
  id: 'heap',
  title: 'Min-heap of size k — kth largest',
  pattern: 'Heaps',
  problem: 'kth-largest-element-in-an-array',
  blurb: 'Keep the k largest seen so far in a min-heap; its root is the kth largest. Watch sift-up / sift-down.',
  inputs: [
    { key: 'nums', label: 'nums', value: '3, 2, 1, 5, 6, 4, 8, 7' },
    { key: 'k', label: 'k', value: '4' },
  ],
  run(inp) {
    const a = nums(inp.nums);
    const k = Math.max(1, Number(inp.k) || 1);
    const { frames, push } = recorder();
    const h: number[] = [];
    const tree = (marks: Record<string, Mark> = {}): TreeState => ({
      nodes: h.map((v, i) => ({ id: String(i), label: String(v), parent: i ? String((i - 1) >> 1) : null, side: i % 2 ? 'L' : 'R' })),
      marks,
    });
    const snap = (line: string, msg: string, i: number, marks: Record<string, Mark> = {}) =>
      push({ line, msg, tree: tree(marks), arrays: [{ name: 'nums', values: a, pointers: i >= 0 ? [{ name: 'i', index: i }] : [] }, { name: 'heap array', values: [...h] }], vars: { k, 'kth largest': h.length === k ? h[0] : null } });
    const up = (i: number, at: number) => {
      while (i > 0 && h[(i - 1) >> 1] > h[i]) {
        const p = (i - 1) >> 1;
        snap('siftup', `${h[i]} < parent ${h[p]} → swap up.`, at, { [i]: 'swap', [p]: 'swap' });
        [h[i], h[p]] = [h[p], h[i]];
        i = p;
      }
    };
    const down = (i: number, at: number) => {
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < h.length && h[l] < h[m]) m = l;
        if (r < h.length && h[r] < h[m]) m = r;
        if (m === i) return;
        snap('siftdown', `${h[i]} > child ${h[m]} → swap down.`, at, { [i]: 'swap', [m]: 'swap' });
        [h[i], h[m]] = [h[m], h[i]];
        i = m;
      }
    };
    a.forEach((x, i) => {
      h.push(x);
      snap('push', `Push ${x}.`, i, { [h.length - 1]: 'active' });
      up(h.length - 1, i);
      if (h.length > k) {
        snap('pop', `Heap has ${h.length} > k → pop the smallest (${h[0]}).`, i, { 0: 'hit' });
        h[0] = h.pop()!;
        down(0, i);
      }
    });
    snap('done', `Root = ${h[0]} is the ${k}th largest.`, -1, { 0: 'hit' });
    return frames;
  },
};

function parseGrid(s: string) {
  return s
    .split(/[;\n]+/)
    .map((r) => r.split(/[\s,]+/).filter(Boolean).map(Number))
    .filter((r) => r.length);
}

const gridBfs: Algo = {
  id: 'grid-bfs',
  title: 'Multi-source BFS — rotting oranges',
  pattern: 'Graphs · BFS',
  problem: 'rotting-oranges',
  blurb: 'Every rotten orange starts in the queue at minute 0. Each BFS layer is one minute.',
  inputs: [{ key: 'g', label: 'grid (rows ; separated) 2=rotten 1=fresh 0=empty', value: '2,1,1,0,1; 1,1,0,1,1; 0,1,1,1,0; 1,1,0,1,2' }],
  run(inp) {
    const g = parseGrid(inp.g);
    const { frames, push } = recorder();
    const R = g.length;
    const C = g[0]?.length ?? 0;
    const marks: Record<string, Mark> = {};
    let q: [number, number][] = [];
    let fresh = 0;
    g.forEach((row, r) =>
      row.forEach((v, c) => {
        if (v === 2) (q.push([r, c]), (marks[`${r},${c}`] = 'hit'));
        if (v === 1) fresh++;
        if (v === 0) marks[`${r},${c}`] = 'wall';
      }),
    );
    const show = (rows: Cell[][]) => [{ name: 'grid', rows, marks: { ...marks } }];
    const view = () => g.map((row) => row.map((v) => (v === 2 ? '🦠' : v === 1 ? '🍊' : '')));
    let minute = 0;
    push({ line: 'init', msg: `${q.length} rotten source(s), ${fresh} fresh.`, tables: show(view()), vars: { minute, fresh } });
    while (q.length && fresh) {
      const next: [number, number][] = [];
      for (const [r, c] of q) {
        for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nr = r + dr;
          const nc = c + dc;
          if (nr < 0 || nc < 0 || nr >= R || nc >= C || g[nr][nc] !== 1) continue;
          g[nr][nc] = 2;
          fresh--;
          next.push([nr, nc]);
          marks[`${nr},${nc}`] = 'active';
        }
      }
      minute++;
      push({ line: 'spread', msg: `Minute ${minute}: ${next.length} orange(s) rot.`, tables: show(view()), vars: { minute, fresh } });
      for (const [r, c] of next) marks[`${r},${c}`] = 'hit';
      q = next;
    }
    push({ line: 'done', msg: fresh ? `${fresh} fresh orange(s) can never be reached → -1.` : `All rotten after ${minute} minute(s).`, tables: show(view()), vars: { minute, fresh, answer: fresh ? -1 : minute } });
    return frames;
  },
};

const topo: Algo = {
  id: 'topo-sort',
  title: "Topological sort — Kahn's algorithm",
  pattern: 'Graphs · Topo sort',
  problem: 'course-schedule-ii',
  blurb: 'Repeatedly take a node with no remaining prerequisites (in-degree 0). Leftover nodes ⇒ cycle.',
  inputs: [{ key: 'e', label: 'edges (a->b means a before b)', value: '5->2, 5->0, 4->0, 4->1, 2->3, 3->1, 0->6, 6->3' }],
  run(inp) {
    const edges = parseEdges(inp.e).map((e) => ({ ...e, directed: true }));
    const ids = nodeIds(edges);
    // layered layout by longest path from sources
    const indeg = Object.fromEntries(ids.map((i) => [i, 0]));
    edges.forEach((e) => indeg[e.b]++);
    const layer: Record<string, number> = {};
    const tmp = { ...indeg };
    let frontier = ids.filter((i) => tmp[i] === 0);
    let d = 0;
    while (frontier.length) {
      const nxt: string[] = [];
      for (const u of frontier) {
        layer[u] = d;
        for (const e of edges.filter((x) => x.a === u)) if (--tmp[e.b] === 0) nxt.push(e.b);
      }
      frontier = nxt;
      d++;
    }
    const depth = Math.max(1, d);
    const byLayer: Record<number, string[]> = {};
    ids.forEach((i) => (byLayer[layer[i] ?? depth] ??= []).push(i));
    const nodes: GNode[] = ids.map((id) => {
      const L = layer[id] ?? depth;
      const row = byLayer[L];
      return { id, label: id, x: 8 + (84 * L) / Math.max(1, depth - 1 || 1), y: ((row.indexOf(id) + 1) / (row.length + 1)) * 100 };
    });

    const { frames, push } = recorder();
    const deg = { ...indeg };
    const nodeMarks: Record<string, Mark> = {};
    const edgeMarks: Record<string, Mark> = {};
    const q = ids.filter((i) => deg[i] === 0);
    q.forEach((i) => (nodeMarks[i] = 'queued'));
    const order: string[] = [];
    const snap = (line: string, msg: string) =>
      push({ line, msg, graph: { nodes, edges, nodeMarks, edgeMarks, badges: Object.fromEntries(ids.map((i) => [i, `in ${deg[i]}`])) }, arrays: [{ name: 'queue', values: [...q] }, { name: 'order', values: [...order] }] });
    snap('init', `In-degree 0 → start queue: [${q.join(', ')}].`);
    while (q.length) {
      const u = q.shift()!;
      order.push(u);
      nodeMarks[u] = 'active';
      snap('pop', `Take ${u}.`);
      for (const e of edges.filter((x) => x.a === u)) {
        edgeMarks[ek(e.a, e.b)] = 'done';
        if (--deg[e.b] === 0) (q.push(e.b), (nodeMarks[e.b] = 'queued'));
        snap('relax', `Remove edge ${u}→${e.b}; in-degree of ${e.b} is now ${deg[e.b]}${deg[e.b] === 0 ? ' → enqueue' : ''}.`);
      }
      nodeMarks[u] = 'done';
    }
    snap('done', order.length === ids.length ? `Order: ${order.join(' → ')}` : `Cycle! Only ${order.length}/${ids.length} nodes ordered.`);
    return frames;
  },
};

const dijkstra: Algo = {
  id: 'dijkstra',
  title: "Dijkstra's shortest paths",
  pattern: 'Graphs · Shortest path',
  problem: 'network-delay-time',
  blurb: 'Pop the closest unsettled node from a min-heap; relax its edges. Stale heap entries are skipped.',
  inputs: [
    { key: 'e', label: 'edges (a-b:w)', value: 'A-B:4, A-C:2, B-C:5, B-D:10, C-E:3, E-D:4, D-F:11, E-F:9' },
    { key: 's', label: 'source', value: 'A' },
  ],
  run(inp) {
    const edges = parseEdges(inp.e);
    const ids = nodeIds(edges);
    const nodes = circle(ids);
    const src = ids.includes(inp.s) ? inp.s : ids[0];
    const adj = (u: string) => edges.flatMap((e) => (e.a === u ? [[e.b, e.w ?? 1, e] as const] : !e.directed && e.b === u ? [[e.a, e.w ?? 1, e] as const] : []));
    const dist: Record<string, number> = Object.fromEntries(ids.map((i) => [i, Infinity]));
    const prev: Record<string, string> = {};
    dist[src] = 0;
    const pq: [number, string][] = [[0, src]];
    const nodeMarks: Record<string, Mark> = { [src]: 'queued' };
    const edgeMarks: Record<string, Mark> = {};
    const { frames, push } = recorder();
    const fmt = (d: number) => (d === Infinity ? '∞' : String(d));
    const snap = (line: string, msg: string, extra: Record<string, Mark> = {}) =>
      push({
        line,
        msg,
        graph: { nodes, edges, nodeMarks, edgeMarks: { ...edgeMarks, ...extra }, badges: Object.fromEntries(ids.map((i) => [i, fmt(dist[i])])) },
        arrays: [{ name: 'min-heap (dist, node)', values: [...pq].sort((a, b) => a[0] - b[0]).map(([d, n]) => `${d},${n}`) }],
        tables: [{ name: 'dist', rows: [ids.map((i) => fmt(dist[i]))], colLabels: ids }],
      });
    snap('init', `dist[${src}] = 0, everything else ∞.`);
    const done = new Set<string>();
    while (pq.length) {
      pq.sort((a, b) => a[0] - b[0]);
      const [d, u] = pq.shift()!;
      if (d > dist[u]) {
        snap('stale', `(${d}, ${u}) is stale — already settled with ${dist[u]}. Skip.`);
        continue;
      }
      done.add(u);
      nodeMarks[u] = 'active';
      if (prev[u]) edgeMarks[ek(prev[u], u)] = edgeMarks[ek(u, prev[u])] = 'hit';
      snap('pop', `Settle ${u} at distance ${d}.`);
      for (const [v, w] of adj(u)) {
        if (done.has(v)) continue;
        const nd = d + w;
        const better = nd < dist[v];
        if (better) {
          dist[v] = nd;
          prev[v] = u;
          pq.push([nd, v]);
          nodeMarks[v] = 'queued';
        }
        const m: Mark = better ? 'active' : 'dim';
        snap('relax', better ? `${u}→${v}: ${d} + ${w} = ${nd} < old → update.` : `${u}→${v}: ${d} + ${w} = ${nd} is no better.`, { [ek(u, v)]: m, [ek(v, u)]: m });
      }
      nodeMarks[u] = 'done';
    }
    snap('done', `Shortest distances from ${src}: ${ids.map((i) => `${i}=${fmt(dist[i])}`).join(', ')}. Purple edges form the shortest-path tree.`);
    return frames;
  },
};

const unionFind: Algo = {
  id: 'union-find',
  title: 'Union-Find — redundant connection',
  pattern: 'Graphs · DSU',
  problem: 'redundant-connection',
  blurb: 'Add edges one by one. If both ends already share a root, this edge closes a cycle.',
  inputs: [{ key: 'e', label: 'edges', value: '1-2, 2-3, 4-5, 3-4, 1-5, 5-6' }],
  run(inp) {
    const edges = parseEdges(inp.e);
    const ids = nodeIds(edges);
    const nodes = circle(ids);
    const parent: Record<string, string> = Object.fromEntries(ids.map((i) => [i, i]));
    const size: Record<string, number> = Object.fromEntries(ids.map((i) => [i, 1]));
    const find = (x: string): string => (parent[x] === x ? x : (parent[x] = find(parent[x])));
    const edgeMarks: Record<string, Mark> = {};
    const nodeMarks: Record<string, Mark> = {};
    const shown: GEdge[] = [];
    const { frames, push } = recorder();
    const snap = (line: string, msg: string) =>
      push({ line, msg, graph: { nodes, edges: [...shown], nodeMarks: { ...nodeMarks }, edgeMarks: { ...edgeMarks }, badges: Object.fromEntries(ids.map((i) => [i, `→${parent[i]}`])) }, tables: [{ name: 'parent', rows: [ids.map((i) => parent[i])], colLabels: ids }] });
    snap('init', 'Every node is its own root.');
    let redundant: GEdge | null = null;
    for (const e of edges) {
      shown.push(e);
      const ra = find(e.a);
      const rb = find(e.b);
      for (const k of Object.keys(nodeMarks)) delete nodeMarks[k];
      nodeMarks[e.a] = nodeMarks[e.b] = 'active';
      snap('find', `Edge ${e.a}–${e.b}: find(${e.a}) = ${ra}, find(${e.b}) = ${rb}.`);
      if (ra === rb) {
        edgeMarks[ek(e.a, e.b)] = 'swap';
        redundant ??= e;
        snap('cycle', `Same root ${ra} → ${e.a}–${e.b} is redundant (closes a cycle).`);
        continue;
      }
      const [big, small] = size[ra] >= size[rb] ? [ra, rb] : [rb, ra];
      parent[small] = big;
      size[big] += size[small];
      edgeMarks[ek(e.a, e.b)] = 'done';
      snap('union', `Union by size: root ${small} → ${big}.`);
    }
    snap('done', redundant ? `First redundant edge: ${redundant.a}–${redundant.b}.` : 'No cycle — the edges form a forest.');
    return frames;
  },
};

const coinChange: Algo = {
  id: 'coin-change',
  title: 'DP — coin change (min coins)',
  pattern: 'Dynamic programming',
  problem: 'coin-change',
  blurb: 'dp[a] = fewest coins for amount a = 1 + min over coins of dp[a − coin]. Watch where each value comes from.',
  inputs: [
    { key: 'coins', label: 'coins', value: '1, 3, 4' },
    { key: 'amt', label: 'amount', value: '10' },
  ],
  run(inp) {
    const coins = nums(inp.coins).filter((c) => c > 0);
    const amt = Math.min(40, Math.max(0, Number(inp.amt) || 0));
    const INF = Infinity;
    const dp: number[] = Array(amt + 1).fill(INF);
    dp[0] = 0;
    const { frames, push } = recorder();
    const view = (i: number, marks: Record<number, Mark> = {}) => [{ name: 'dp', values: dp.map((v) => (v === INF ? '∞' : v)), pointers: i >= 0 ? [{ name: 'a', index: i }] : [], marks }];
    push({ line: 'init', msg: 'dp[0] = 0 (zero coins make zero). Everything else ∞.', arrays: view(0), vars: { coins: coins.join(',') } });
    for (let a = 1; a <= amt; a++) {
      for (const c of coins) {
        if (c > a) continue;
        const cand = dp[a - c] + 1;
        const better = cand < dp[a];
        if (better) dp[a] = cand;
        push({ line: 'try', msg: `a=${a}, coin ${c}: dp[${a - c}] + 1 = ${cand === INF ? '∞' : cand}${better ? ' → better' : ''}.`, arrays: view(a, { [a - c]: 'queued', [a]: better ? 'hit' : 'active' }), vars: { coin: c } });
      }
    }
    push({ line: 'done', msg: dp[amt] === INF ? 'Amount unreachable → -1.' : `Fewest coins for ${amt}: ${dp[amt]}.`, arrays: view(amt, { [amt]: 'hit' }) });
    return frames;
  },
};

const lcs: Algo = {
  id: 'lcs',
  title: 'DP table — longest common subsequence',
  pattern: 'Dynamic programming · 2D',
  problem: 'longest-common-subsequence',
  blurb: 'dp[i][j] for prefixes. Match → diagonal + 1; otherwise best of up / left. Highlighted cells are the dependencies.',
  inputs: [
    { key: 'a', label: 'text1', value: 'abcbdab' },
    { key: 'b', label: 'text2', value: 'bdcaba' },
  ],
  run(inp) {
    const a = (inp.a || '').slice(0, 10);
    const b = (inp.b || '').slice(0, 10);
    const n = a.length;
    const m = b.length;
    const dp: Cell[][] = Array.from({ length: n + 1 }, (_, i) => Array.from({ length: m + 1 }, (_, j) => (i === 0 || j === 0 ? 0 : null)));
    const { frames, push } = recorder();
    const T = (marks: Record<string, Mark>) => [{ name: 'dp', rows: dp, rowLabels: ['∅', ...a], colLabels: ['∅', ...b], marks }];
    push({ line: 'init', msg: 'Row 0 and column 0 are 0 — an empty prefix has no common subsequence.', tables: T({}) });
    for (let i = 1; i <= n; i++)
      for (let j = 1; j <= m; j++) {
        if (a[i - 1] === b[j - 1]) {
          dp[i][j] = (dp[i - 1][j - 1] as number) + 1;
          push({ line: 'match', msg: `'${a[i - 1]}' = '${b[j - 1]}' → diagonal + 1 = ${dp[i][j]}.`, tables: T({ [`${i},${j}`]: 'hit', [`${i - 1},${j - 1}`]: 'queued' }) });
        } else {
          dp[i][j] = Math.max(dp[i - 1][j] as number, dp[i][j - 1] as number);
          push({ line: 'skip', msg: `'${a[i - 1]}' ≠ '${b[j - 1]}' → max(up ${dp[i - 1][j]}, left ${dp[i][j - 1]}) = ${dp[i][j]}.`, tables: T({ [`${i},${j}`]: 'active', [`${i - 1},${j}`]: 'queued', [`${i},${j - 1}`]: 'queued' }) });
        }
      }
    // trace back
    const path: Record<string, Mark> = {};
    let i = n;
    let j = m;
    let s = '';
    while (i && j) {
      if (a[i - 1] === b[j - 1]) ((s = a[i - 1] + s), (path[`${i},${j}`] = 'hit'), i--, j--);
      else if ((dp[i - 1][j] as number) >= (dp[i][j - 1] as number)) ((path[`${i},${j}`] = 'dim'), i--);
      else ((path[`${i},${j}`] = 'dim'), j--);
    }
    push({ line: 'done', msg: `LCS length ${dp[n][m]}: "${s}" (purple = matched characters on the trace-back).`, tables: T(path) });
    return frames;
  },
};

const kmp: Algo = {
  id: 'kmp',
  title: 'KMP — prefix function (lps)',
  pattern: 'Strings',
  problem: 'find-the-index-of-the-first-occurrence-in-a-string',
  blurb: 'lps[i] = longest proper prefix of p[0..i] that is also a suffix. On mismatch, fall back to lps[len−1] instead of restarting.',
  inputs: [{ key: 'p', label: 'pattern', value: 'aabaaabaab' }],
  run(inp) {
    const p = [...(inp.p || '').slice(0, 20)];
    const lps: Cell[] = p.map(() => null);
    lps[0] = 0;
    const { frames, push } = recorder();
    let len = 0;
    let i = 1;
    const view = (marks: Record<number, Mark> = {}) => [
      { name: 'pattern', values: p, pointers: [{ name: 'len', index: len }, { name: 'i', index: i }], marks },
      { name: 'lps', values: [...lps] },
    ];
    push({ line: 'init', msg: 'lps[0] = 0 by definition.', arrays: view(), vars: { len, i } });
    while (i < p.length) {
      if (p[i] === p[len]) {
        len++;
        lps[i] = len;
        push({ line: 'match', msg: `p[${i}] = p[${len - 1}] = '${p[i]}' → lps[${i}] = ${len}.`, arrays: view({ [i]: 'hit', [len - 1]: 'hit' }), vars: { len, i } });
        i++;
      } else if (len) {
        const old = len;
        len = lps[len - 1] as number;
        push({ line: 'fallback', msg: `Mismatch '${p[i]}' ≠ '${p[old]}' → fall back len = lps[${old - 1}] = ${len}.`, arrays: view({ [i]: 'swap', [old]: 'swap' }), vars: { len, i } });
      } else {
        lps[i] = 0;
        push({ line: 'zero', msg: `Mismatch with len 0 → lps[${i}] = 0.`, arrays: view({ [i]: 'active' }), vars: { len, i } });
        i++;
      }
    }
    push({ line: 'done', msg: `lps = [${lps.join(', ')}]`, arrays: view(), vars: { len, i } });
    return frames;
  },
};

export const ALGOS: Algo[] = [prefixHash, twoPointers, slidingWindow, binarySearch, monoStack, backtracking, treeBfs, heap, gridBfs, topo, dijkstra, unionFind, coinChange, lcs, kmp];
export const algoById = (id: string) => ALGOS.find((a) => a.id === id);

// ---------------------------------------------------------------------------------------------
// Folding the runner's `viz` events (from the user's own C++/Java/Python) into frames.
// ---------------------------------------------------------------------------------------------
type VizEvent =
  | { op: 'array'; name: string; value: Cell[] }
  | { op: 'ptr'; name: string; target: string; index: number }
  | { op: 'table'; name: string; value: Cell[][] }
  | { op: 'cell'; name: string; r: number; c: number }
  | { op: 'var'; name: string; value: Cell | boolean }
  | { op: 'step'; msg: string };

/**
 * State accumulates across events. A `step` call cuts a frame; programs that never call
 * `step` get one frame per event, so tracing still works without ceremony.
 */
export function framesFromEvents(events: unknown[]): Frame[] {
  const evs = events as VizEvent[];
  const usesStep = evs.some((e) => e.op === 'step');
  const arrays = new Map<string, Cell[]>();
  const ptrs = new Map<string, Ptr[]>();
  const tables = new Map<string, Cell[][]>();
  const cells = new Map<string, Record<string, Mark>>();
  const vars: Record<string, Cell | boolean> = {};
  const frames: Frame[] = [];
  const cut = (msg: string) => {
    if (frames.length >= 3000) return;
    frames.push(
      clone({
        msg,
        arrays: [...arrays].map(([name, values]) => ({ name, values, pointers: ptrs.get(name) ?? [] })),
        tables: [...tables].map(([name, rows]) => ({ name, rows, marks: cells.get(name) ?? {} })),
        vars,
      }),
    );
    cells.clear();
  };
  for (const e of evs) {
    switch (e.op) {
      case 'array':
        arrays.set(e.name, e.value);
        break;
      case 'ptr': {
        const list = (ptrs.get(e.target) ?? []).filter((p) => p.name !== e.name);
        list.push({ name: e.name, index: e.index });
        ptrs.set(e.target, list);
        break;
      }
      case 'table':
        tables.set(e.name, e.value);
        break;
      case 'cell':
        cells.set(e.name, { ...(cells.get(e.name) ?? {}), [`${e.r},${e.c}`]: 'active' });
        break;
      case 'var':
        vars[e.name] = e.value;
        break;
      case 'step':
        cut(e.msg);
        continue;
    }
    if (!usesStep) cut(`${e.op} ${'name' in e ? e.name : ''}`);
  }
  if (usesStep && (arrays.size || tables.size)) cut('end');
  return frames;
}
