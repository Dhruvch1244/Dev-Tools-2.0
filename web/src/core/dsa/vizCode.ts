// Reference solutions for each visualizer, in the three languages the user practises in.
// A trailing `// @label` (or `# @label`) marks the line a frame with that `line` highlights;
// markers are stripped before display, so they never show up in the editor.

export type Lang = 'cpp' | 'java' | 'py';
type Snippets = Record<Lang, string>;

export const VIZ_CODE: Record<string, Snippets> = {
  'prefix-hash': {
    cpp: `int subarraySum(vector<int>& nums, int k) {
    unordered_map<int,int> seen{{0, 1}};   // @init
    int prefix = 0, count = 0;
    for (int x : nums) {
        prefix += x;                       // @add
        auto it = seen.find(prefix - k);   // @lookup
        if (it != seen.end()) count += it->second;
        seen[prefix]++;                    // @store
    }
    return count;                          // @done
}`,
    java: `int subarraySum(int[] nums, int k) {
    Map<Integer,Integer> seen = new HashMap<>();
    seen.put(0, 1);                                  // @init
    int prefix = 0, count = 0;
    for (int x : nums) {
        prefix += x;                                 // @add
        count += seen.getOrDefault(prefix - k, 0);   // @lookup
        seen.merge(prefix, 1, Integer::sum);         // @store
    }
    return count;                                    // @done
}`,
    py: `def subarraySum(nums, k):
    seen = {0: 1}                          # @init
    prefix = count = 0
    for x in nums:
        prefix += x                        # @add
        count += seen.get(prefix - k, 0)   # @lookup
        seen[prefix] = seen.get(prefix, 0) + 1   # @store
    return count                           # @done`,
  },
  'two-pointers': {
    cpp: `int maxArea(vector<int>& h) {
    int l = 0, r = h.size() - 1, best = 0;    // @init
    while (l < r) {
        best = max(best, min(h[l], h[r]) * (r - l));   // @area
        if (h[l] < h[r]) l++; else r--;       // @move
    }
    return best;                              // @done
}`,
    java: `int maxArea(int[] h) {
    int l = 0, r = h.length - 1, best = 0;    // @init
    while (l < r) {
        best = Math.max(best, Math.min(h[l], h[r]) * (r - l));   // @area
        if (h[l] < h[r]) l++; else r--;       // @move
    }
    return best;                              // @done
}`,
    py: `def maxArea(h):
    l, r, best = 0, len(h) - 1, 0             # @init
    while l < r:
        best = max(best, min(h[l], h[r]) * (r - l))   # @area
        if h[l] < h[r]: l += 1                # @move
        else: r -= 1
    return best                               # @done`,
  },
  'sliding-window': {
    cpp: `int lengthOfLongestSubstring(string s) {
    unordered_map<char,int> last;
    int l = 0, best = 0;
    for (int r = 0; r < (int)s.size(); r++) {
        if (last.count(s[r]) && last[s[r]] >= l)
            l = last[s[r]] + 1;               // @repeat
        last[s[r]] = r;
        best = max(best, r - l + 1);          // @expand
    }
    return best;                              // @done
}`,
    java: `int lengthOfLongestSubstring(String s) {
    Map<Character,Integer> last = new HashMap<>();
    int l = 0, best = 0;
    for (int r = 0; r < s.length(); r++) {
        char c = s.charAt(r);
        if (last.containsKey(c) && last.get(c) >= l)
            l = last.get(c) + 1;              // @repeat
        last.put(c, r);
        best = Math.max(best, r - l + 1);     // @expand
    }
    return best;                              // @done
}`,
    py: `def lengthOfLongestSubstring(s):
    last, l, best = {}, 0, 0
    for r, c in enumerate(s):
        if c in last and last[c] >= l:
            l = last[c] + 1                   # @repeat
        last[c] = r
        best = max(best, r - l + 1)           # @expand
    return best                               # @done`,
  },
  'binary-search': {
    cpp: `int lowerBound(vector<int>& a, int t) {
    int lo = 0, hi = a.size();          // @init
    while (lo < hi) {
        int mid = lo + (hi - lo) / 2;   // @mid
        if (a[mid] >= t) hi = mid;      // @left
        else lo = mid + 1;              // @right
    }
    return lo;                          // @done
}`,
    java: `int lowerBound(int[] a, int t) {
    int lo = 0, hi = a.length;          // @init
    while (lo < hi) {
        int mid = lo + (hi - lo) / 2;   // @mid
        if (a[mid] >= t) hi = mid;      // @left
        else lo = mid + 1;              // @right
    }
    return lo;                          // @done
}`,
    py: `def lower_bound(a, t):
    lo, hi = 0, len(a)                  # @init
    while lo < hi:
        mid = (lo + hi) // 2            # @mid
        if a[mid] >= t: hi = mid        # @left
        else: lo = mid + 1              # @right
    return lo                           # @done`,
  },
  'monotonic-stack': {
    cpp: `vector<int> dailyTemperatures(vector<int>& t) {
    vector<int> ans(t.size()), st;
    for (int i = 0; i < (int)t.size(); i++) {   // @loop
        while (!st.empty() && t[i] > t[st.back()]) {
            ans[st.back()] = i - st.back();      // @pop
            st.pop_back();
        }
        st.push_back(i);                         // @push
    }
    return ans;                                  // @done
}`,
    java: `int[] dailyTemperatures(int[] t) {
    int[] ans = new int[t.length];
    Deque<Integer> st = new ArrayDeque<>();
    for (int i = 0; i < t.length; i++) {         // @loop
        while (!st.isEmpty() && t[i] > t[st.peek()]) {
            int j = st.pop();
            ans[j] = i - j;                      // @pop
        }
        st.push(i);                              // @push
    }
    return ans;                                  // @done
}`,
    py: `def dailyTemperatures(t):
    ans, st = [0] * len(t), []
    for i, x in enumerate(t):                    # @loop
        while st and x > t[st[-1]]:
            j = st.pop(); ans[j] = i - j         # @pop
        st.append(i)                             # @push
    return ans                                   # @done`,
  },
  backtracking: {
    cpp: `void go(int i, vector<int>& a, vector<int>& path, vector<vector<int>>& res) {   // @enter
    if (i == (int)a.size()) { res.push_back(path); return; }   // @record
    path.push_back(a[i]);        // @take
    go(i + 1, a, path, res);
    path.pop_back();             // @undo
    go(i + 1, a, path, res);     // @skip
}
// go(0, nums, path, res);       // @done`,
    java: `void go(int i, int[] a, List<Integer> path, List<List<Integer>> res) {   // @enter
    if (i == a.length) { res.add(new ArrayList<>(path)); return; }   // @record
    path.add(a[i]);                  // @take
    go(i + 1, a, path, res);
    path.remove(path.size() - 1);    // @undo
    go(i + 1, a, path, res);         // @skip
}
// go(0, nums, new ArrayList<>(), res);   // @done`,
    py: `def subsets(a):
    res, path = [], []
    def go(i):                   # @enter
        if i == len(a): res.append(path[:]); return   # @record
        path.append(a[i])        # @take
        go(i + 1)
        path.pop()               # @undo
        go(i + 1)                # @skip
    go(0)
    return res                   # @done`,
  },
  'tree-bfs': {
    cpp: `vector<vector<int>> levelOrder(TreeNode* root) {
    vector<vector<int>> res;
    queue<TreeNode*> q; if (root) q.push(root);   // @init
    while (!q.empty()) {
        int n = q.size(); vector<int> lvl;         // @level
        while (n--) {
            auto u = q.front(); q.pop(); lvl.push_back(u->val);   // @visit
            if (u->left) q.push(u->left);
            if (u->right) q.push(u->right);
        }
        res.push_back(lvl);
    }
    return res;                                    // @done
}`,
    java: `List<List<Integer>> levelOrder(TreeNode root) {
    List<List<Integer>> res = new ArrayList<>();
    Deque<TreeNode> q = new ArrayDeque<>();
    if (root != null) q.add(root);                 // @init
    while (!q.isEmpty()) {
        int n = q.size(); List<Integer> lvl = new ArrayList<>();   // @level
        while (n-- > 0) {
            TreeNode u = q.poll(); lvl.add(u.val);  // @visit
            if (u.left != null) q.add(u.left);
            if (u.right != null) q.add(u.right);
        }
        res.add(lvl);
    }
    return res;                                    // @done
}`,
    py: `def levelOrder(root):
    res, q = [], deque([root] if root else [])     # @init
    while q:
        lvl = []                                   # @level
        for _ in range(len(q)):
            u = q.popleft(); lvl.append(u.val)     # @visit
            if u.left: q.append(u.left)
            if u.right: q.append(u.right)
        res.append(lvl)
    return res                                     # @done`,
  },
  heap: {
    cpp: `int findKthLargest(vector<int>& nums, int k) {
    priority_queue<int, vector<int>, greater<int>> h;   // min-heap
    for (int x : nums) {
        h.push(x);               // @push  (sift-up)       // @siftup
        if ((int)h.size() > k)
            h.pop();             // @pop   (sift-down)     // @siftdown
    }
    return h.top();              // @done
}`,
    java: `int findKthLargest(int[] nums, int k) {
    PriorityQueue<Integer> h = new PriorityQueue<>();   // min-heap
    for (int x : nums) {
        h.offer(x);              // @push  (sift-up)       // @siftup
        if (h.size() > k)
            h.poll();            // @pop   (sift-down)     // @siftdown
    }
    return h.peek();             // @done
}`,
    py: `def findKthLargest(nums, k):
    h = []
    for x in nums:
        heapq.heappush(h, x)     # @push  (sift-up)       # @siftup
        if len(h) > k:
            heapq.heappop(h)     # @pop   (sift-down)     # @siftdown
    return h[0]                  # @done`,
  },
  'grid-bfs': {
    cpp: `int orangesRotting(vector<vector<int>>& g) {
    int R = g.size(), C = g[0].size(), fresh = 0, minutes = 0;
    queue<pair<int,int>> q;
    for (int r = 0; r < R; r++) for (int c = 0; c < C; c++)
        if (g[r][c] == 2) q.push({r, c}); else if (g[r][c] == 1) fresh++;   // @init
    int d[5] = {0, 1, 0, -1, 0};
    while (!q.empty() && fresh) {
        for (int n = q.size(); n--; ) {
            auto [r, c] = q.front(); q.pop();
            for (int k = 0; k < 4; k++) {
                int nr = r + d[k], nc = c + d[k + 1];
                if (nr < 0 || nc < 0 || nr >= R || nc >= C || g[nr][nc] != 1) continue;
                g[nr][nc] = 2; fresh--; q.push({nr, nc});   // @spread
            }
        }
        minutes++;
    }
    return fresh ? -1 : minutes;      // @done
}`,
    java: `int orangesRotting(int[][] g) {
    int R = g.length, C = g[0].length, fresh = 0, minutes = 0;
    Deque<int[]> q = new ArrayDeque<>();
    for (int r = 0; r < R; r++) for (int c = 0; c < C; c++)
        if (g[r][c] == 2) q.add(new int[]{r, c}); else if (g[r][c] == 1) fresh++;   // @init
    int[] d = {0, 1, 0, -1, 0};
    while (!q.isEmpty() && fresh > 0) {
        for (int n = q.size(); n-- > 0; ) {
            int[] p = q.poll();
            for (int k = 0; k < 4; k++) {
                int nr = p[0] + d[k], nc = p[1] + d[k + 1];
                if (nr < 0 || nc < 0 || nr >= R || nc >= C || g[nr][nc] != 1) continue;
                g[nr][nc] = 2; fresh--; q.add(new int[]{nr, nc});   // @spread
            }
        }
        minutes++;
    }
    return fresh > 0 ? -1 : minutes;  // @done
}`,
    py: `def orangesRotting(g):
    R, C = len(g), len(g[0])
    q = deque((r, c) for r in range(R) for c in range(C) if g[r][c] == 2)
    fresh = sum(row.count(1) for row in g)                  # @init
    minutes = 0
    while q and fresh:
        for _ in range(len(q)):
            r, c = q.popleft()
            for nr, nc in ((r+1, c), (r-1, c), (r, c+1), (r, c-1)):
                if 0 <= nr < R and 0 <= nc < C and g[nr][nc] == 1:
                    g[nr][nc] = 2; fresh -= 1; q.append((nr, nc))   # @spread
        minutes += 1
    return -1 if fresh else minutes                          # @done`,
  },
  'topo-sort': {
    cpp: `vector<int> topo(int n, vector<vector<int>>& adj) {
    vector<int> indeg(n), order;
    for (auto& es : adj) for (int v : es) indeg[v]++;
    queue<int> q;
    for (int i = 0; i < n; i++) if (!indeg[i]) q.push(i);   // @init
    while (!q.empty()) {
        int u = q.front(); q.pop(); order.push_back(u);      // @pop
        for (int v : adj[u]) if (--indeg[v] == 0) q.push(v); // @relax
    }
    return order;   // size < n  ⇒  cycle                    // @done
}`,
    java: `List<Integer> topo(int n, List<List<Integer>> adj) {
    int[] indeg = new int[n];
    for (var es : adj) for (int v : es) indeg[v]++;
    Deque<Integer> q = new ArrayDeque<>();
    for (int i = 0; i < n; i++) if (indeg[i] == 0) q.add(i);   // @init
    List<Integer> order = new ArrayList<>();
    while (!q.isEmpty()) {
        int u = q.poll(); order.add(u);                        // @pop
        for (int v : adj.get(u)) if (--indeg[v] == 0) q.add(v);   // @relax
    }
    return order;   // size < n  ⇒  cycle                       // @done
}`,
    py: `def topo(n, adj):
    indeg = [0] * n
    for es in adj:
        for v in es: indeg[v] += 1
    q = deque(i for i in range(n) if indeg[i] == 0)   # @init
    order = []
    while q:
        u = q.popleft(); order.append(u)              # @pop
        for v in adj[u]:
            indeg[v] -= 1
            if indeg[v] == 0: q.append(v)             # @relax
    return order   # len < n  ⇒  cycle                # @done`,
  },
  dijkstra: {
    cpp: `vector<long long> dijkstra(int s, vector<vector<pair<int,int>>>& adj) {
    vector<long long> dist(adj.size(), LLONG_MAX);
    priority_queue<pair<long long,int>, vector<pair<long long,int>>, greater<>> pq;
    dist[s] = 0; pq.push({0, s});                         // @init
    while (!pq.empty()) {
        auto [d, u] = pq.top(); pq.pop();                 // @pop
        if (d > dist[u]) continue;                        // @stale
        for (auto [v, w] : adj[u])
            if (d + w < dist[v]) pq.push({dist[v] = d + w, v});   // @relax
    }
    return dist;                                          // @done
}`,
    java: `long[] dijkstra(int s, List<List<int[]>> adj) {
    long[] dist = new long[adj.size()];
    Arrays.fill(dist, Long.MAX_VALUE);
    PriorityQueue<long[]> pq = new PriorityQueue<>((a, b) -> Long.compare(a[0], b[0]));
    dist[s] = 0; pq.add(new long[]{0, s});                // @init
    while (!pq.isEmpty()) {
        long[] t = pq.poll(); long d = t[0]; int u = (int) t[1];   // @pop
        if (d > dist[u]) continue;                        // @stale
        for (int[] e : adj.get(u))
            if (d + e[1] < dist[e[0]]) pq.add(new long[]{dist[e[0]] = d + e[1], e[0]});   // @relax
    }
    return dist;                                          // @done
}`,
    py: `def dijkstra(s, adj):
    dist = [inf] * len(adj); dist[s] = 0
    pq = [(0, s)]                                         # @init
    while pq:
        d, u = heapq.heappop(pq)                          # @pop
        if d > dist[u]: continue                          # @stale
        for v, w in adj[u]:
            if d + w < dist[v]:
                dist[v] = d + w; heapq.heappush(pq, (dist[v], v))   # @relax
    return dist                                           # @done`,
  },
  'union-find': {
    cpp: `vector<int> parent, sz;
int find(int x) { return parent[x] == x ? x : parent[x] = find(parent[x]); }   // @find
vector<int> findRedundantConnection(vector<vector<int>>& edges) {
    int n = edges.size(); parent.resize(n + 1); sz.assign(n + 1, 1);
    iota(parent.begin(), parent.end(), 0);                     // @init
    for (auto& e : edges) {
        int a = find(e[0]), b = find(e[1]);
        if (a == b) return e;                                  // @cycle
        if (sz[a] < sz[b]) swap(a, b);
        parent[b] = a; sz[a] += sz[b];                         // @union
    }
    return {};                                                 // @done
}`,
    java: `int[] parent, sz;
int find(int x) { return parent[x] == x ? x : (parent[x] = find(parent[x])); }   // @find
int[] findRedundantConnection(int[][] edges) {
    int n = edges.length; parent = new int[n + 1]; sz = new int[n + 1];
    for (int i = 0; i <= n; i++) { parent[i] = i; sz[i] = 1; }   // @init
    for (int[] e : edges) {
        int a = find(e[0]), b = find(e[1]);
        if (a == b) return e;                                  // @cycle
        if (sz[a] < sz[b]) { int t = a; a = b; b = t; }
        parent[b] = a; sz[a] += sz[b];                         // @union
    }
    return new int[0];                                         // @done
}`,
    py: `def findRedundantConnection(edges):
    parent = list(range(len(edges) + 1)); size = [1] * len(parent)   # @init
    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]; x = parent[x]
        return x                                               # @find
    for u, v in edges:
        a, b = find(u), find(v)
        if a == b: return [u, v]                               # @cycle
        if size[a] < size[b]: a, b = b, a
        parent[b] = a; size[a] += size[b]                      # @union
    return []                                                  # @done`,
  },
  'coin-change': {
    cpp: `int coinChange(vector<int>& coins, int amount) {
    vector<int> dp(amount + 1, INT_MAX); dp[0] = 0;   // @init
    for (int a = 1; a <= amount; a++)
        for (int c : coins)
            if (c <= a && dp[a - c] != INT_MAX)
                dp[a] = min(dp[a], dp[a - c] + 1);   // @try
    return dp[amount] == INT_MAX ? -1 : dp[amount];  // @done
}`,
    java: `int coinChange(int[] coins, int amount) {
    int[] dp = new int[amount + 1];
    Arrays.fill(dp, Integer.MAX_VALUE); dp[0] = 0;   // @init
    for (int a = 1; a <= amount; a++)
        for (int c : coins)
            if (c <= a && dp[a - c] != Integer.MAX_VALUE)
                dp[a] = Math.min(dp[a], dp[a - c] + 1);   // @try
    return dp[amount] == Integer.MAX_VALUE ? -1 : dp[amount];   // @done
}`,
    py: `def coinChange(coins, amount):
    dp = [0] + [inf] * amount                        # @init
    for a in range(1, amount + 1):
        for c in coins:
            if c <= a:
                dp[a] = min(dp[a], dp[a - c] + 1)    # @try
    return -1 if dp[amount] == inf else dp[amount]   # @done`,
  },
  lcs: {
    cpp: `int longestCommonSubsequence(string a, string b) {
    int n = a.size(), m = b.size();
    vector<vector<int>> dp(n + 1, vector<int>(m + 1, 0));   // @init
    for (int i = 1; i <= n; i++)
        for (int j = 1; j <= m; j++)
            if (a[i-1] == b[j-1]) dp[i][j] = dp[i-1][j-1] + 1;     // @match
            else dp[i][j] = max(dp[i-1][j], dp[i][j-1]);          // @skip
    return dp[n][m];                                        // @done
}`,
    java: `int longestCommonSubsequence(String a, String b) {
    int n = a.length(), m = b.length();
    int[][] dp = new int[n + 1][m + 1];                     // @init
    for (int i = 1; i <= n; i++)
        for (int j = 1; j <= m; j++)
            if (a.charAt(i-1) == b.charAt(j-1)) dp[i][j] = dp[i-1][j-1] + 1;   // @match
            else dp[i][j] = Math.max(dp[i-1][j], dp[i][j-1]);                 // @skip
    return dp[n][m];                                        // @done
}`,
    py: `def longestCommonSubsequence(a, b):
    n, m = len(a), len(b)
    dp = [[0] * (m + 1) for _ in range(n + 1)]              # @init
    for i in range(1, n + 1):
        for j in range(1, m + 1):
            if a[i-1] == b[j-1]: dp[i][j] = dp[i-1][j-1] + 1        # @match
            else: dp[i][j] = max(dp[i-1][j], dp[i][j-1])           # @skip
    return dp[n][m]                                         # @done`,
  },
  kmp: {
    cpp: `vector<int> buildLps(const string& p) {
    vector<int> lps(p.size(), 0);   // @init
    int len = 0;
    for (int i = 1; i < (int)p.size(); ) {
        if (p[i] == p[len]) lps[i++] = ++len;   // @match
        else if (len) len = lps[len - 1];       // @fallback
        else lps[i++] = 0;                      // @zero
    }
    return lps;                                 // @done
}`,
    java: `int[] buildLps(String p) {
    int[] lps = new int[p.length()];   // @init
    int len = 0;
    for (int i = 1; i < p.length(); ) {
        if (p.charAt(i) == p.charAt(len)) lps[i++] = ++len;   // @match
        else if (len > 0) len = lps[len - 1];                 // @fallback
        else lps[i++] = 0;                                    // @zero
    }
    return lps;                                               // @done
}`,
    py: `def build_lps(p):
    lps, length, i = [0] * len(p), 0, 1   # @init
    while i < len(p):
        if p[i] == p[length]:
            length += 1; lps[i] = length; i += 1   # @match
        elif length:
            length = lps[length - 1]               # @fallback
        else:
            lps[i] = 0; i += 1                     # @zero
    return lps                                     # @done`,
  },
};

/** Strip `@label` markers and return the clean code plus label → 1-based line numbers. */
export function parseMarked(src: string) {
  const lines: Record<string, number> = {};
  const out = src.split('\n').map((line, i) => {
    let clean = line;
    for (const m of line.matchAll(/(?:\/\/|#)\s*@(\w+)/g)) lines[m[1]] ??= i + 1;
    clean = clean.replace(/\s*(?:\/\/|#)\s*@\w+(?:\s+\([^)]*\))?/g, '').replace(/\s+(?:\/\/|#)\s*$/, '');
    if (/^\s*(?:\/\/|#)\s*$/.test(clean)) clean = clean.replace(/(?:\/\/|#)\s*$/, '');
    return clean;
  });
  return { code: out.join('\n'), lines };
}

/** Starter for the playground: a real program the runner can execute, with viz calls. */
export const PLAYGROUND_STARTER: Record<Lang, string> = {
  cpp: `// viz:: helpers are injected — array, ptr, table, cell, var, step
int main() {
    vector<int> a = {5, 1, 4, 2, 8, 3};
    int n = a.size();
    viz::array("a", a);
    for (int i = 0; i < n; i++)
        for (int j = 0; j + 1 < n - i; j++) {
            viz::ptr("j", "a", j);
            viz::ptr("j+1", "a", j + 1);
            if (a[j] > a[j + 1]) {
                swap(a[j], a[j + 1]);
                viz::array("a", a);
                viz::step("swap " + to_string(a[j + 1]) + " and " + to_string(a[j]));
            } else viz::step("in order");
        }
    for (int x : a) cout << x << ' ';
}`,
  java: `// Viz helpers are available: Viz.array, ptr, table, cell, var, step
import java.util.*;

public class Main {
    public static void main(String[] args) {
        int[] a = {5, 1, 4, 2, 8, 3};
        Viz.array("a", a);
        for (int i = 0; i < a.length; i++)
            for (int j = 0; j + 1 < a.length - i; j++) {
                Viz.ptr("j", "a", j);
                Viz.ptr("j+1", "a", j + 1);
                if (a[j] > a[j + 1]) {
                    int t = a[j]; a[j] = a[j + 1]; a[j + 1] = t;
                    Viz.array("a", a);
                    Viz.step("swap " + a[j + 1] + " and " + a[j]);
                } else Viz.step("in order");
            }
        System.out.println(Arrays.toString(a));
    }
}`,
  py: `# viz is a builtin here: viz.array, ptr, table, cell, var, step
a = [5, 1, 4, 2, 8, 3]
viz.array("a", a)
for i in range(len(a)):
    for j in range(len(a) - 1 - i):
        viz.ptr("j", "a", j)
        viz.ptr("j+1", "a", j + 1)
        if a[j] > a[j + 1]:
            a[j], a[j + 1] = a[j + 1], a[j]
            viz.array("a", a)
            viz.step(f"swap {a[j+1]} and {a[j]}")
        else:
            viz.step("in order")
print(*a)`,
};
