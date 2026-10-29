// Problem statements from LeetCode's public GraphQL, cached in SQLite forever (statements don't
// change in ways that matter), so a problem opened once works offline afterwards.
import { db } from './db.ts';

db.exec(`CREATE TABLE IF NOT EXISTS lc_questions (slug TEXT PRIMARY KEY, data TEXT NOT NULL, fetched_at TEXT NOT NULL);`);

export type ParamMeta = { name: string; type: string };
export type Meta = {
  name?: string;
  params?: ParamMeta[];
  return?: { type: string };
  output?: { paramindex: number };
  systemdesign?: boolean;
  classname?: string;
  constructor?: { params: ParamMeta[] };
  methods?: { name: string; params: ParamMeta[]; return: { type: string } }[];
};
export type Question = {
  slug: string;
  id: string;
  title: string;
  difficulty: string;
  html: string;
  tags: string[];
  hints: string[];
  snippets: { cpp?: string; java?: string; py?: string };
  meta: Meta;
  /** Raw example input lines, one per parameter (design problems: 2 lines per case). */
  exampleLines: string[];
  /** Expected outputs scraped from the statement's examples, in order. */
  expected: string[];
};

const QUERY = `query q($s: String!) { question(titleSlug: $s) {
  questionFrontendId title content difficulty isPaidOnly metaData exampleTestcases hints
  topicTags { name } codeSnippets { langSlug code } } }`;

function decode(s: string) {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&le;/g, '≤')
    .replace(/&ge;/g, '≥')
    .replace(/&amp;/g, '&');
}

/** "Output: [0,1]" lines from the examples, in order. */
export function scrapeExpected(html: string) {
  const text = decode(html.replace(/<[^>]+>/g, ''));
  return [...text.matchAll(/Output:?\s*([^\n]+)/g)].map((m) => m[1].trim());
}

const inflight = new Map<string, Promise<Question>>();

export async function getQuestion(slug: string): Promise<Question> {
  const row = db.prepare('SELECT data FROM lc_questions WHERE slug = ?').get(slug) as { data: string } | undefined;
  if (row) return JSON.parse(row.data);
  if (inflight.has(slug)) return inflight.get(slug)!;
  const p = (async () => {
    const res = await fetch('https://leetcode.com/graphql', {
      method: 'POST',
      headers: { 'content-type': 'application/json', referer: `https://leetcode.com/problems/${slug}/`, 'user-agent': 'dev-tools-2' },
      body: JSON.stringify({ query: QUERY, variables: { s: slug } }),
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) throw new Error(`LeetCode responded ${res.status}`);
    const q = (await res.json()).data?.question;
    if (!q) throw new Error('Problem not found on LeetCode');
    if (q.isPaidOnly || !q.content) throw new Error('This is a LeetCode Premium problem — the statement is not public');
    const snip = (lang: string) => q.codeSnippets?.find((c: { langSlug: string }) => c.langSlug === lang)?.code;
    const out: Question = {
      slug,
      id: q.questionFrontendId,
      title: q.title,
      difficulty: q.difficulty,
      html: q.content,
      tags: (q.topicTags ?? []).map((t: { name: string }) => t.name),
      hints: q.hints ?? [],
      snippets: { cpp: snip('cpp'), java: snip('java'), py: snip('python3') },
      meta: JSON.parse(q.metaData || '{}'),
      exampleLines: String(q.exampleTestcases ?? '').split('\n').filter((l) => l.trim()),
      expected: scrapeExpected(q.content),
    };
    db.prepare('INSERT OR REPLACE INTO lc_questions (slug, data, fetched_at) VALUES (?, ?, ?)').run(slug, JSON.stringify(out), new Date().toISOString());
    return out;
  })().finally(() => inflight.delete(slug));
  inflight.set(slug, p);
  return p;
}
