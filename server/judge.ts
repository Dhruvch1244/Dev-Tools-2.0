// Local judge: wraps the user's LeetCode-style `Solution` (or design class) in a generated
// harness, runs every example in one process, and compares against the expected outputs.
//
// The harness never inserts lines into the user's file, so compiler/traceback line numbers match
// what's in the editor: C++ gets its prelude via `-include`, Python via sitecustomize builtins,
// Java via sibling files (the user file gets imports prepended on the *same* first line).
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { exec, limited, splitViz, withSlot, VIZ_CPP, VIZ_JAVA, VIZ_PY, type Lang } from './runner.ts';
import type { Meta, Question } from './leetcode.ts';

const CASE = '@@case ';

// ---------------------------------------------------------------------------------------------
// Type support
// ---------------------------------------------------------------------------------------------
const SCALARS = ['integer', 'long', 'double', 'boolean', 'string', 'character'];
const NODES = ['ListNode', 'TreeNode'];
function supported(t: string): boolean {
  if (SCALARS.includes(t) || NODES.includes(t)) return true;
  if (t.endsWith('[]')) return supported(t.slice(0, -2));
  const m = /^list<(.+)>$/i.exec(t);
  return m ? supported(m[1].toLowerCase() === 'string' ? 'string' : m[1]) : false;
}
const norm = (t: string) => t.replace(/list<String>/g, 'list<string>');

/**
 * LeetCode "manual" judges whose metadata doesn't describe the real signature. Detected from the
 * C++ snippet (the source of truth for parameter types), so each case is handled once for all
 * three languages.
 */
type Quirks = { unsupported?: string; nodeByVal: number[]; valueOut: boolean; codec: boolean };
const CUSTOM_NODE = new Set(['copyRandomList', 'cloneGraph', 'flatten', 'connect']);
export function quirks(q: Question): Quirks {
  const meta = q.meta;
  if (meta.name === 'detectCycle' || meta.name === 'hasCycle' || meta.name === 'getIntersectionNode') return { unsupported: 'the input builds a linked-list cycle/intersection the local judge can’t reproduce — submit on LeetCode', nodeByVal: [], valueOut: false, codec: false };
  if (meta.name && CUSTOM_NODE.has(meta.name)) return { unsupported: 'uses a custom Node class (random/neighbors/child pointers) — submit on LeetCode', nodeByVal: [], valueOut: false, codec: false };
  if (meta.name === 'Codec') return { nodeByVal: [], valueOut: false, codec: true };
  const nodeByVal: number[] = [];
  const sig = q.snippets.cpp && meta.name ? new RegExp(`${meta.name}\\s*\\(([^)]*)\\)`).exec(q.snippets.cpp)?.[1] : undefined;
  sig?.split(',').forEach((p, i) => p.includes('TreeNode') && meta.params?.[i]?.type === 'integer' && nodeByVal.push(i));
  return { nodeByVal, valueOut: nodeByVal.length > 0 && meta.return?.type === 'TreeNode', codec: false };
}

export function support(q: Question): { ok: boolean; reason?: string } {
  const meta = q.meta;
  const qk = quirks(q);
  if (qk.unsupported) return { ok: false, reason: qk.unsupported };
  if (meta.systemdesign) {
    const all = [...(meta.constructor?.params ?? []), ...(meta.methods ?? []).flatMap((m) => [...m.params, ...(m.return.type === 'void' ? [] : [{ name: 'r', type: m.return.type }])])];
    const bad = all.find((p) => !supported(norm(p.type)));
    return bad ? { ok: false, reason: `type ${bad.type} isn't supported by the local judge yet` } : { ok: true };
  }
  if (!meta.name || !meta.params) return { ok: false, reason: 'no function signature in LeetCode metadata' };
  const bad = [...meta.params, ...(meta.return?.type === 'void' ? [] : [meta.return ?? { name: 'r', type: 'void' }])].find((p) => !supported(norm(p.type)));
  return bad ? { ok: false, reason: `type ${bad.type} isn't supported by the local judge yet` } : { ok: true };
}

// ---------------------------------------------------------------------------------------------
// C++
// ---------------------------------------------------------------------------------------------
function cppType(t: string): string {
  t = norm(t);
  if (t.endsWith('[]')) return `vector<${cppType(t.slice(0, -2))}>`;
  const m = /^list<(.+)>$/.exec(t);
  if (m) return `vector<${cppType(m[1])}>`;
  return ({ integer: 'int', long: 'long long', double: 'double', boolean: 'bool', string: 'string', character: 'char', ListNode: 'ListNode*', TreeNode: 'TreeNode*' } as Record<string, string>)[t];
}

const CPP_PRELUDE = (code: string) => `#include <bits/stdc++.h>
using namespace std;
${/^\s*struct\s+ListNode\b/m.test(code) ? '' : 'struct ListNode { int val; ListNode *next; ListNode() : val(0), next(nullptr) {} ListNode(int x) : val(x), next(nullptr) {} ListNode(int x, ListNode *n) : val(x), next(n) {} };'}
${/^\s*struct\s+TreeNode\b/m.test(code) ? '' : 'struct TreeNode { int val; TreeNode *left, *right; TreeNode() : val(0), left(nullptr), right(nullptr) {} TreeNode(int x) : val(x), left(nullptr), right(nullptr) {} TreeNode(int x, TreeNode *l, TreeNode *r) : val(x), left(l), right(r) {} };'}
`;

const CPP_LIB = String.raw`
namespace jh {
struct J { int t = 0; std::string raw, s; std::vector<J> a; }; // t: 0 null, 1 num, 2 str, 3 arr, 4 bool
struct P {
  const std::string& s; size_t i = 0;
  explicit P(const std::string& x) : s(x) {}
  void ws() { while (i < s.size() && isspace((unsigned char)s[i])) i++; }
  J val() {
    ws(); J j; if (i >= s.size()) return j;
    char c = s[i];
    if (c == '[') { i++; j.t = 3; ws(); if (i < s.size() && s[i] == ']') { i++; return j; }
      while (i < s.size()) { j.a.push_back(val()); ws(); if (i < s.size() && s[i] == ',') { i++; continue; } i++; break; } return j; }
    if (c == '"') { i++; j.t = 2; while (i < s.size() && s[i] != '"') { if (s[i] == '\\') { i++; char e = s[i]; j.s += e == 'n' ? '\n' : e == 't' ? '\t' : e; } else j.s += s[i]; i++; } i++; return j; }
    if (s.compare(i, 4, "null") == 0) { i += 4; return j; }
    if (s.compare(i, 4, "true") == 0) { i += 4; j.t = 4; j.raw = "1"; return j; }
    if (s.compare(i, 5, "false") == 0) { i += 5; j.t = 4; j.raw = "0"; return j; }
    j.t = 1; size_t st = i;
    while (i < s.size() && (isdigit((unsigned char)s[i]) || strchr("+-.eE", s[i]))) i++;
    j.raw = s.substr(st, i - st); return j;
  }
};
inline J parse(const std::string& s) { P p(s); return p.val(); }
template <class T> struct C;
template <> struct C<int> { static int get(const J& j) { return (int)std::stoll(j.raw); } };
template <> struct C<long long> { static long long get(const J& j) { return std::stoll(j.raw); } };
template <> struct C<double> { static double get(const J& j) { return std::stod(j.raw); } };
template <> struct C<bool> { static bool get(const J& j) { return j.raw == "1"; } };
template <> struct C<std::string> { static std::string get(const J& j) { return j.s; } };
template <> struct C<char> { static char get(const J& j) { return j.s.empty() ? 0 : j.s[0]; } };
template <class T> struct C<std::vector<T>> { static std::vector<T> get(const J& j) { std::vector<T> v; for (auto& x : j.a) v.push_back(C<T>::get(x)); return v; } };
template <> struct C<ListNode*> { static ListNode* get(const J& j) { ListNode d; ListNode* t = &d; for (auto& x : j.a) { t->next = new ListNode((int)std::stoll(x.raw)); t = t->next; } return d.next; } };
template <> struct C<TreeNode*> { static TreeNode* get(const J& j) {
  if (j.a.empty() || j.a[0].t == 0) return nullptr;
  auto* root = new TreeNode((int)std::stoll(j.a[0].raw)); std::queue<TreeNode*> q; q.push(root); size_t i = 1;
  while (!q.empty() && i < j.a.size()) { auto* n = q.front(); q.pop();
    if (i < j.a.size() && j.a[i].t != 0) { n->left = new TreeNode((int)std::stoll(j.a[i].raw)); q.push(n->left); } i++;
    if (i < j.a.size() && j.a[i].t != 0) { n->right = new TreeNode((int)std::stoll(j.a[i].raw)); q.push(n->right); } i++; }
  return root; } };
inline std::string esc(const std::string& s) { std::string o = "\""; for (char c : s) { if (c == '"' || c == '\\') { o += '\\'; o += c; } else if (c == '\n') o += "\\n"; else o += c; } return o + "\""; }
inline std::string ser(int v) { return std::to_string(v); }
inline std::string ser(long v) { return std::to_string(v); }
inline std::string ser(long long v) { return std::to_string(v); }
inline std::string ser(unsigned v) { return std::to_string(v); }
inline std::string ser(unsigned long v) { return std::to_string(v); }
inline std::string ser(unsigned long long v) { return std::to_string(v); }
inline std::string ser(double v) { char b[64]; snprintf(b, 64, "%.5f", v); return b; }
inline std::string ser(bool v) { return v ? "true" : "false"; }
inline std::string ser(const std::string& s) { return esc(s); }
inline std::string ser(const char* s) { return esc(s); }
inline std::string ser(char c) { return esc(std::string(1, c)); }
inline std::string ser(ListNode* h) { std::string o = "["; bool f = true; int guard = 0; for (; h && guard < 100000; h = h->next, guard++) { if (!f) o += ","; f = false; o += std::to_string(h->val); } return o + "]"; }
inline std::string ser(TreeNode* r) {
  std::vector<std::string> v; std::queue<TreeNode*> q; q.push(r);
  while (!q.empty()) { auto* n = q.front(); q.pop(); if (!n) { v.push_back("null"); continue; } v.push_back(std::to_string(n->val)); q.push(n->left); q.push(n->right); }
  while (!v.empty() && v.back() == "null") v.pop_back();
  std::string o = "["; for (size_t i = 0; i < v.size(); i++) { if (i) o += ","; o += v[i]; } return o + "]"; }
inline std::string ser(const std::vector<bool>& v) { std::string o = "["; for (size_t i = 0; i < v.size(); i++) { if (i) o += ","; o += v[i] ? "true" : "false"; } return o + "]"; }
template <class T> std::string ser(const std::vector<T>& v) { std::string o = "["; for (size_t i = 0; i < v.size(); i++) { if (i) o += ","; o += ser(v[i]); } return o + "]"; }
inline TreeNode* findVal(TreeNode* r, int v) { if (!r) return nullptr; if (r->val == v) return r; auto* x = findVal(r->left, v); return x ? x : findVal(r->right, v); }
inline void out(const std::string& s) { std::cout << "\n${CASE}" << s << "\n" << std::flush; }
}  // namespace jh
`;

const cppGet = (t: string, expr: string) => `jh::C<${cppType(t)}>::get(${expr})`;

function cppMain(meta: Meta, qk: Quirks) {
  let body: string;
  let per: number;
  if (meta.systemdesign) {
    per = 2;
    const cls = meta.classname!;
    const ctor = (meta.constructor?.params ?? []).map((p, i) => cppGet(p.type, `a[${i}]`)).join(', ');
    const branches = (meta.methods ?? [])
      .map((m) => {
        const call = `obj->${m.name}(${m.params.map((p, i) => cppGet(p.type, `a[${i}]`)).join(', ')})`;
        return `else if (op == "${m.name}") { ${m.return.type === 'void' ? `${call}; o += "null";` : `o += jh::ser(${call});`} }`;
      })
      .join('\n        ');
    body = `auto ops = jh::C<vector<string>>::get(jh::parse(L[c]));
      auto args = jh::parse(L[c + 1]);
      ${cls}* obj = nullptr; string o = "[";
      for (size_t k = 0; k < ops.size(); k++) {
        if (k) o += ",";
        const auto& a = args.a[k].a; const string& op = ops[k];
        if (k == 0) { obj = new ${cls}(${ctor}); o += "null"; }
        ${branches}
        else o += "null";
      }
      jh::out(o + "]");`;
  } else {
    const ps = meta.params!;
    per = ps.length;
    const decls = ps
      .map((p, i) => (qk.nodeByVal.includes(i) ? `TreeNode* p${i} = jh::findVal(p0, ${cppGet('integer', `jh::parse(L[c + ${i}])`)});` : `auto p${i} = ${cppGet(p.type, `jh::parse(L[c + ${i}])`)};`))
      .join('\n      ');
    const call = `sol.${meta.name}(${ps.map((_, i) => `p${i}`).join(', ')})`;
    const ret = meta.return?.type ?? 'void';
    const emit = qk.codec
      ? `Codec a, b; jh::out(jh::ser(b.deserialize(a.serialize(p0))));`
      : qk.valueOut
        ? `auto r = ${call}; jh::out(r ? std::to_string(r->val) : "null");`
        : ret === 'void'
          ? meta.output
            ? `${call}; jh::out(jh::ser(p${meta.output.paramindex}));`
            : `${call}; jh::out("null");`
          : `jh::out(jh::ser(${call}));`;
    body = `${decls}
      ${qk.codec ? '' : 'Solution sol;'}
      ${emit}`;
  }
  return `
int main() {
  vector<string> L; string line;
  while (getline(cin, line)) { if (!line.empty() && line.back() == '\\r') line.pop_back(); if (line.find_first_not_of(" \\t") != string::npos) L.push_back(line); }
  for (size_t c = 0; c + ${per} <= L.size(); c += ${per}) {
    {
      ${body}
    }
  }
}
`;
}

// ---------------------------------------------------------------------------------------------
// Java — runtime type-directed conversion via reflection, so one helper covers every shape.
// ---------------------------------------------------------------------------------------------
function javaType(t: string): string {
  t = norm(t);
  if (t.endsWith('[]')) return `${javaType(t.slice(0, -2))}[]`;
  const m = /^list<(.+)>$/.exec(t);
  if (m) return `List<${boxed(javaType(m[1]))}>`;
  return ({ integer: 'int', long: 'long', double: 'double', boolean: 'boolean', string: 'String', character: 'char', ListNode: 'ListNode', TreeNode: 'TreeNode' } as Record<string, string>)[t];
}
const boxed = (t: string) => ({ int: 'Integer', long: 'Long', double: 'Double', boolean: 'Boolean', char: 'Character' } as Record<string, string>)[t] ?? t;
const javaGet = (t: string, expr: string) => `(${javaType(t)}) H.conv("${norm(t)}", ${expr})`;

const JAVA_H = String.raw`import java.util.*;
import java.lang.reflect.Array;

final class H {
  static final class J { int t; String raw = "", s = ""; List<J> a = new ArrayList<>(); }
  private static String src; private static int i;
  static J parse(String s) { src = s; i = 0; return val(); }
  private static void ws() { while (i < src.length() && Character.isWhitespace(src.charAt(i))) i++; }
  private static J val() {
    ws(); J j = new J(); if (i >= src.length()) return j;
    char c = src.charAt(i);
    if (c == '[') { i++; j.t = 3; ws(); if (i < src.length() && src.charAt(i) == ']') { i++; return j; }
      while (i < src.length()) { j.a.add(val()); ws(); if (i < src.length() && src.charAt(i) == ',') { i++; continue; } i++; break; } return j; }
    if (c == '"') { i++; j.t = 2; StringBuilder b = new StringBuilder();
      while (i < src.length() && src.charAt(i) != '"') { if (src.charAt(i) == '\\') { i++; char e = src.charAt(i); b.append(e == 'n' ? '\n' : e == 't' ? '\t' : e); } else b.append(src.charAt(i)); i++; }
      i++; j.s = b.toString(); return j; }
    if (src.startsWith("null", i)) { i += 4; return j; }
    if (src.startsWith("true", i)) { i += 4; j.t = 4; j.raw = "1"; return j; }
    if (src.startsWith("false", i)) { i += 5; j.t = 4; j.raw = "0"; return j; }
    j.t = 1; int st = i; while (i < src.length() && "+-.eE0123456789".indexOf(src.charAt(i)) >= 0) i++; j.raw = src.substring(st, i); return j;
  }
  static Class<?> cls(String t) {
    switch (t) { case "integer": return int.class; case "long": return long.class; case "double": return double.class; case "boolean": return boolean.class;
      case "character": return char.class; case "string": return String.class; case "ListNode": return ListNode.class; case "TreeNode": return TreeNode.class; }
    if (t.endsWith("[]")) return Array.newInstance(cls(t.substring(0, t.length() - 2)), 0).getClass();
    return List.class;
  }
  static Object conv(String t, J j) {
    switch (t) {
      case "integer": return (int) Long.parseLong(j.raw);
      case "long": return Long.parseLong(j.raw);
      case "double": return Double.parseDouble(j.raw);
      case "boolean": return j.raw.equals("1");
      case "string": return j.s;
      case "character": return j.s.isEmpty() ? '\0' : j.s.charAt(0);
      case "ListNode": { ListNode d = new ListNode(0), t2 = d; for (J x : j.a) { t2.next = new ListNode((int) Long.parseLong(x.raw)); t2 = t2.next; } return d.next; }
      case "TreeNode": {
        if (j.a.isEmpty() || j.a.get(0).t == 0) return null;
        TreeNode root = new TreeNode((int) Long.parseLong(j.a.get(0).raw)); Deque<TreeNode> q = new ArrayDeque<>(); q.add(root); int k = 1;
        while (!q.isEmpty() && k < j.a.size()) { TreeNode n = q.poll();
          if (k < j.a.size() && j.a.get(k).t != 0) { n.left = new TreeNode((int) Long.parseLong(j.a.get(k).raw)); q.add(n.left); } k++;
          if (k < j.a.size() && j.a.get(k).t != 0) { n.right = new TreeNode((int) Long.parseLong(j.a.get(k).raw)); q.add(n.right); } k++; }
        return root; }
    }
    if (t.endsWith("[]")) { String e = t.substring(0, t.length() - 2); Object arr = Array.newInstance(cls(e), j.a.size());
      for (int k = 0; k < j.a.size(); k++) Array.set(arr, k, conv(e, j.a.get(k))); return arr; }
    if (t.startsWith("list<")) { String e = t.substring(5, t.length() - 1); List<Object> l = new ArrayList<>(); for (J x : j.a) l.add(conv(e, x)); return l; }
    throw new IllegalArgumentException("unsupported type " + t);
  }
  static String esc(String s) { return "\"" + s.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n") + "\""; }
  static String ser(Object o) {
    if (o == null) return "null";
    if (o instanceof Double || o instanceof Float) return String.format(Locale.ROOT, "%.5f", ((Number) o).doubleValue());
    if (o instanceof Number || o instanceof Boolean) return o.toString();
    if (o instanceof String s) return esc(s);
    if (o instanceof Character ch) return esc(String.valueOf(ch));
    if (o instanceof ListNode h) { StringBuilder b = new StringBuilder("["); int g = 0; for (; h != null && g < 100000; h = h.next, g++) { if (g > 0) b.append(','); b.append(h.val); } return b.append(']').toString(); }
    if (o instanceof TreeNode r) { List<String> v = new ArrayList<>(); Deque<TreeNode> q = new LinkedList<>(); q.add(r);
      while (!q.isEmpty()) { TreeNode n = q.poll(); if (n == null) { v.add("null"); continue; } v.add(String.valueOf(n.val)); q.add(n.left); q.add(n.right); }
      while (!v.isEmpty() && v.get(v.size() - 1).equals("null")) v.remove(v.size() - 1); return "[" + String.join(",", v) + "]"; }
    if (o.getClass().isArray()) { StringBuilder b = new StringBuilder("["); int n = Array.getLength(o); for (int k = 0; k < n; k++) { if (k > 0) b.append(','); b.append(ser(Array.get(o, k))); } return b.append(']').toString(); }
    if (o instanceof Iterable<?> it) { StringBuilder b = new StringBuilder("["); boolean f = true; for (Object x : it) { if (!f) b.append(','); f = false; b.append(ser(x)); } return b.append(']').toString(); }
    return esc(o.toString());
  }
  static TreeNode findVal(TreeNode r, int v) { if (r == null) return null; if (r.val == v) return r; TreeNode x = findVal(r.left, v); return x != null ? x : findVal(r.right, v); }
  static void out(String s) { System.out.print("\n${CASE}" + s + "\n"); System.out.flush(); }
}
`;
const JAVA_LISTNODE = `public class ListNode { public int val; public ListNode next; public ListNode() {} public ListNode(int val) { this.val = val; } public ListNode(int val, ListNode next) { this.val = val; this.next = next; } }\n`;
const JAVA_TREENODE = `public class TreeNode { public int val; public TreeNode left, right; public TreeNode() {} public TreeNode(int val) { this.val = val; } public TreeNode(int val, TreeNode left, TreeNode right) { this.val = val; this.left = left; this.right = right; } }\n`;

function javaMain(meta: Meta, qk: Quirks) {
  let body: string;
  let per: number;
  if (meta.systemdesign) {
    per = 2;
    const cls = meta.classname!;
    const ctor = (meta.constructor?.params ?? []).map((p, i) => javaGet(p.type, `a.get(${i})`)).join(', ');
    const cases = (meta.methods ?? [])
      .map((m) => {
        const call = `obj.${m.name}(${m.params.map((p, i) => javaGet(p.type, `a.get(${i})`)).join(', ')})`;
        return `case "${m.name}": ${m.return.type === 'void' ? `${call}; o.append("null");` : `o.append(H.ser(${call}));`} break;`;
      })
      .join('\n            ');
    body = `@SuppressWarnings("unchecked") List<String> ops = (List<String>) H.conv("list<string>", H.parse(L.get(c)));
        H.J args = H.parse(L.get(c + 1));
        ${cls} obj = null; StringBuilder o = new StringBuilder("[");
        for (int k = 0; k < ops.size(); k++) {
          if (k > 0) o.append(",");
          List<H.J> a = args.a.get(k).a;
          if (k == 0) { obj = new ${cls}(${ctor}); o.append("null"); continue; }
          switch (ops.get(k)) {
            ${cases}
            default: o.append("null");
          }
        }
        H.out(o.append("]").toString());`;
  } else {
    const ps = meta.params!;
    per = ps.length;
    const decls = ps
      .map((p, i) => (qk.nodeByVal.includes(i) ? `TreeNode p${i} = H.findVal(p0, ${javaGet('integer', `H.parse(L.get(c + ${i}))`)});` : `${javaType(p.type)} p${i} = ${javaGet(p.type, `H.parse(L.get(c + ${i}))`)};`))
      .join('\n        ');
    const call = `new Solution().${meta.name}(${ps.map((_, i) => `p${i}`).join(', ')})`;
    const ret = meta.return?.type ?? 'void';
    // LeetCode prints an empty list/tree as [] — never null.
    const node = (t: string) => t === 'ListNode' || t === 'TreeNode';
    const serNode = (t: string, expr: string) => (node(t) ? `H.out(${expr} == null ? "[]" : H.ser(${expr}));` : `H.out(H.ser(${expr}));`);
    const outIdx = meta.output?.paramindex;
    const emit = qk.codec
      ? `TreeNode r = new Codec().deserialize(new Codec().serialize(p0)); ${serNode('TreeNode', 'r')}`
      : qk.valueOut
        ? `TreeNode r = ${call}; H.out(r == null ? "null" : String.valueOf(r.val));`
        : ret === 'void'
        ? outIdx !== undefined
          ? `${call}; ${serNode(ps[outIdx].type, `p${outIdx}`)}`
          : `${call}; H.out("null");`
        : node(ret)
          ? `Object r = ${call}; ${serNode(ret, 'r')}`
          : `H.out(H.ser(${call}));`;
    body = `${decls}
        ${emit}`;
  }
  return `import java.util.*;

public class Main {
  @SuppressWarnings({"unchecked", "rawtypes"})
  public static void main(String[] argv) throws Exception {
    java.io.BufferedReader in = new java.io.BufferedReader(new java.io.InputStreamReader(System.in));
    List<String> L = new ArrayList<>(); String line;
    while ((line = in.readLine()) != null) if (!line.isBlank()) L.add(line);
    for (int c = 0; c + ${per} <= L.size(); c += ${per}) {
      {
        ${body}
      }
    }
  }
}
`;
}

// ---------------------------------------------------------------------------------------------
// Python — dynamic, so only node types need converting.
// ---------------------------------------------------------------------------------------------
const PY_SITE = `${VIZ_PY}
import typing as _t, collections as _c, heapq as _hq, bisect as _bs, itertools as _it, functools as _ft, math as _m, string as _s

class ListNode:
    def __init__(self, val=0, next=None):
        self.val = val
        self.next = next

class TreeNode:
    def __init__(self, val=0, left=None, right=None):
        self.val = val
        self.left = left
        self.right = right

# LeetCode's Python environment has these in scope without imports.
for _n in ('List', 'Optional', 'Dict', 'Set', 'Tuple', 'Deque'):
    setattr(builtins, _n, getattr(_t, _n))
for _n in ('defaultdict', 'Counter', 'deque', 'OrderedDict'):
    setattr(builtins, _n, getattr(_c, _n))
for _n in ('heappush', 'heappop', 'heapify', 'heappushpop', 'nlargest', 'nsmallest'):
    setattr(builtins, _n, getattr(_hq, _n))
for _n in ('bisect_left', 'bisect_right', 'insort'):
    setattr(builtins, _n, getattr(_bs, _n))
builtins.ListNode, builtins.TreeNode = ListNode, TreeNode
builtins.heapq, builtins.bisect, builtins.itertools, builtins.functools, builtins.math, builtins.collections = _hq, _bs, _it, _ft, _m, _c
builtins.cache, builtins.lru_cache, builtins.reduce = _ft.cache, _ft.lru_cache, _ft.reduce
builtins.inf = float('inf')
`;

function pyMain(meta: Meta, qk: Quirks) {
  const common = `
import json as _json, sys as _sys

def _node(t, v):
    if t == 'ListNode':
        d = ListNode(); cur = d
        for x in v or []:
            cur.next = ListNode(x); cur = cur.next
        return d.next
    if t == 'TreeNode':
        if not v or v[0] is None: return None
        root = TreeNode(v[0]); q = [root]; i = 1; h = 0
        while h < len(q) and i < len(v):
            n = q[h]; h += 1
            if i < len(v) and v[i] is not None:
                n.left = TreeNode(v[i]); q.append(n.left)
            i += 1
            if i < len(v) and v[i] is not None:
                n.right = TreeNode(v[i]); q.append(n.right)
            i += 1
        return root
    if t == 'ListNode[]': return [_node('ListNode', x) for x in v]
    return v

def _ser(x, dbl=False):
    if x is None: return 'null'
    if isinstance(x, bool): return 'true' if x else 'false'
    if isinstance(x, float) or (dbl and isinstance(x, int)): return '%.5f' % x
    if isinstance(x, int): return str(x)
    if isinstance(x, str): return _json.dumps(x)
    if isinstance(x, ListNode):
        out = []
        while x is not None and len(out) < 100000:
            out.append(str(x.val)); x = x.next
        return '[' + ','.join(out) + ']'
    if isinstance(x, TreeNode):
        out, q, h = [], [x], 0
        while h < len(q):
            n = q[h]; h += 1
            if n is None: out.append('null'); continue
            out.append(str(n.val)); q.append(n.left); q.append(n.right)
        while out and out[-1] == 'null': out.pop()
        return '[' + ','.join(out) + ']'
    if isinstance(x, (list, tuple, set)): return '[' + ','.join(_ser(e, dbl) for e in x) + ']'
    return _json.dumps(x)

def _find(r, v):
    if r is None or r.val == v: return r
    return _find(r.left, v) or _find(r.right, v)

def _out(s):
    print('\\n${CASE}' + s, flush=True)

_L = [l for l in _sys.stdin.read().split('\\n') if l.strip()]
`;
  if (meta.systemdesign) {
    const dbl = JSON.stringify(Object.fromEntries((meta.methods ?? []).map((m) => [m.name, m.return.type.includes('double')])));
    return `${common}
_DBL = _json.loads('${dbl}')
for _c in range(0, len(_L) - 1, 2):
    _ops, _args = _json.loads(_L[_c]), _json.loads(_L[_c + 1])
    _obj, _o = None, []
    for _k, (_op, _a) in enumerate(zip(_ops, _args)):
        if _k == 0:
            _obj = ${meta.classname}(*_a); _o.append('null')
        else:
            _o.append(_ser(getattr(_obj, _op)(*_a), _DBL.get(_op, False)))
    _out('[' + ','.join(_o) + ']')
`;
  }
  const ps = meta.params!;
  const ret = meta.return?.type ?? 'void';
  const call = `Solution().${meta.name}(*_a)`;
  const node = (t: string) => t === 'ListNode' || t === 'TreeNode';
  const outIdx = meta.output?.paramindex;
  const top = (expr: string, t: string) => (node(t) ? `_out('[]' if (${expr}) is None else _ser(${expr}))` : `_out(_ser(${expr}, ${t.includes('double') ? 'True' : 'False'}))`);
  const emit = qk.codec
    ? `_r = Codec().deserialize(Codec().serialize(_a[0])); ${top('_r', 'TreeNode')}`
    : qk.valueOut
      ? `_r = ${call}; _out('null' if _r is None else str(_r.val))`
      : ret === 'void'
        ? outIdx !== undefined
          ? `${call}; ${top(`_a[${outIdx}]`, ps[outIdx].type)}`
          : `${call}; _out('null')`
        : `_r = ${call}; ${top('_r', ret)}`;
  return `${common}
_T = ${JSON.stringify(ps.map((p) => p.type))}
for _c in range(0, len(_L) - ${ps.length} + 1, ${ps.length}):
    _a = [_node(t, _json.loads(_L[_c + i])) for i, t in enumerate(_T)]
    for _i in ${JSON.stringify(qk.nodeByVal)}: _a[_i] = _find(_a[0], _a[_i])
    ${emit}
`;
}

// ---------------------------------------------------------------------------------------------
// Running & comparing
// ---------------------------------------------------------------------------------------------
export type CaseResult = { input: string[]; expected?: string; output?: string; pass?: boolean };
export type JudgeResult = {
  phase: 'compile' | 'run';
  ok: boolean;
  timedOut: boolean;
  exitCode: number | null;
  ms: number;
  results: CaseResult[];
  stdout: string;
  stderr: string;
  events: unknown[];
};

function parseLoose(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return s.trim();
  }
}
function canon(v: unknown): unknown {
  return Array.isArray(v) ? v.map(canon).sort((a, b) => (JSON.stringify(a) < JSON.stringify(b) ? -1 : 1)) : v;
}
function same(a: unknown, b: unknown): boolean {
  if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) <= 1e-5 * Math.max(1, Math.abs(b));
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => same(x, b[i]));
  return JSON.stringify(a) === JSON.stringify(b);
}
export function compare(expected: string, actual: string, ignoreOrder: boolean) {
  let e = parseLoose(expected);
  let a = parseLoose(actual);
  if (ignoreOrder) (e = canon(e)), (a = canon(a));
  return same(a, e);
}

export async function judge(q: Question, lang: Lang, code: string, opts: { input?: string; ignoreOrder?: boolean } = {}): Promise<JudgeResult> {
  const meta = q.meta;
  const qk = quirks(q);
  const per = meta.systemdesign ? 2 : (meta.params?.length ?? 1);
  const custom = opts.input?.trim();
  const lines = (custom ?? q.exampleLines.join('\n')).split('\n').filter((l) => l.trim());
  const cases: CaseResult[] = [];
  for (let i = 0; i + per <= lines.length; i += per) cases.push({ input: lines.slice(i, i + per), expected: custom ? undefined : q.expected[i / per] });

  return withSlot(async () => {
    const dir = await mkdtemp(join(tmpdir(), 'dt2-judge-'));
    try {
      let r: Awaited<ReturnType<typeof exec>>;
      const stdin = lines.join('\n') + '\n';
      if (lang === 'cpp') {
        await writeFile(join(dir, 'viz.h'), VIZ_CPP);
        await writeFile(join(dir, 'prelude.h'), CPP_PRELUDE(code));
        await writeFile(join(dir, 'main.cpp'), `${code}\n${CPP_LIB}\n${cppMain(meta, qk)}`);
        const c = await exec('g++', ['-std=c++20', '-O2', '-pipe', '-include', 'prelude.h', '-include', 'viz.h', 'main.cpp', '-o', 'main'], { cwd: dir, timeoutMs: 40_000 });
        if (c.code !== 0) return { phase: 'compile', ok: false, timedOut: c.timedOut, exitCode: c.code, ms: c.ms, results: cases, stdout: '', stderr: c.err, events: [] };
        const [cmd, args] = limited('./main', []);
        r = await exec(cmd, [...args], { cwd: dir, stdin, timeoutMs: 6_000 });
      } else if (lang === 'java') {
        // A public top-level class must live in a file of the same name (e.g. `public class Codec`).
        const userFile = `${/public\s+(?:final\s+)?class\s+(\w+)/.exec(code)?.[1] ?? 'Solution'}.java`;
        await writeFile(join(dir, userFile), `import java.util.*; import java.util.stream.*; import java.util.function.*; ${code}`);
        await writeFile(join(dir, 'H.java'), JAVA_H);
        await writeFile(join(dir, 'Main.java'), javaMain(meta, qk));
        await writeFile(join(dir, 'Viz.java'), VIZ_JAVA);
        const files = [userFile, 'H.java', 'Main.java', 'Viz.java'];
        if (!/\bclass\s+ListNode\b/.test(code)) (await writeFile(join(dir, 'ListNode.java'), JAVA_LISTNODE), files.push('ListNode.java'));
        if (!/\bclass\s+TreeNode\b/.test(code)) (await writeFile(join(dir, 'TreeNode.java'), JAVA_TREENODE), files.push('TreeNode.java'));
        const c = await exec('javac', ['-encoding', 'UTF-8', '-nowarn', ...files], { cwd: dir, timeoutMs: 40_000 });
        if (c.code !== 0) return { phase: 'compile', ok: false, timedOut: c.timedOut, exitCode: c.code, ms: c.ms, results: cases, stdout: '', stderr: c.err.replace(/^Note: .*\n?/gm, ''), events: [] };
        r = await exec('java', ['-Xmx256m', '-Xss64m', '-XX:+UseSerialGC', 'Main'], { cwd: dir, stdin, timeoutMs: 10_000 });
      } else {
        await writeFile(join(dir, 'sitecustomize.py'), PY_SITE);
        await writeFile(join(dir, 'main.py'), `${code}\n${pyMain(meta, qk)}`);
        const [cmd, args] = limited('python3', ['main.py']);
        r = await exec(cmd, [...args], { cwd: dir, stdin, timeoutMs: 8_000, env: { PYTHONPATH: dir, PYTHONIOENCODING: 'utf-8' } });
      }
      const outs: string[] = [];
      const rest: string[] = [];
      for (const l of r.out.split('\n')) (l.startsWith(CASE) ? outs.push(l.slice(CASE.length)) : rest.push(l));
      const results = cases.map((c, i) => {
        const output = outs[i];
        return { ...c, output, pass: output !== undefined && c.expected !== undefined ? compare(c.expected, output, !!opts.ignoreOrder) : undefined };
      });
      const { events, stderr } = splitViz(r.err);
      return {
        phase: 'run',
        ok: r.code === 0 && !r.timedOut,
        timedOut: r.timedOut,
        exitCode: r.code,
        ms: r.ms,
        results,
        stdout: rest.join('\n').trim(),
        stderr,
        events,
      };
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
}

