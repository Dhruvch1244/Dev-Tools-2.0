// Mark season problems solved when the user gets them Accepted on LeetCode (on/after the season start). Uses the public
// recentAcSubmissionList query (no login) — it returns the last ~20 ACs, so polling every 30 min
// never misses a normal day's work.
import { db } from './db.ts';
import { ALL_PRACTICE, MEGAS, WEEKS } from '../web/src/core/dsa/plan.ts';

const PLAN = new Set([...ALL_PRACTICE, ...WEEKS.flatMap((w) => w.test), ...MEGAS.flatMap((m) => m.problems)].map((p) => p.id));

export async function syncLeetCode(): Promise<{ checked: number; marked: string[] } | null> {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'handles'").get() as { value: string } | undefined;
  const user = row ? JSON.parse(row.value).leetcode : undefined;
  if (!user) return null;
  const res = await fetch('https://leetcode.com/graphql', {
    method: 'POST',
    headers: { 'content-type': 'application/json', referer: 'https://leetcode.com', 'user-agent': 'dev-tools-2' },
    body: JSON.stringify({ query: 'query r($u: String!) { recentAcSubmissionList(username: $u, limit: 20) { titleSlug timestamp } }', variables: { u: user } }),
    signal: AbortSignal.timeout(15_000),
  });
  const list: { titleSlug: string; timestamp: string }[] = (await res.json()).data?.recentAcSubmissionList ?? [];
  // Only accepts from the season onwards count — an old solve from months ago isn't this season's work.
  const startRow = db.prepare("SELECT value FROM settings WHERE key = 'dsaStart'").get() as { value: string } | undefined;
  const since = startRow ? Date.parse(`${JSON.parse(startRow.value)}T00:00:00`) : 0;
  const marked: string[] = [];
  for (const s of list) {
    if (!PLAN.has(s.titleSlug) || Number(s.timestamp) * 1000 < since) continue;
    const cur = db.prepare('SELECT status FROM dsa_progress WHERE problem = ?').get(s.titleSlug) as { status: string } | undefined;
    if (cur?.status === 'solved' || cur?.status === 'revisit') continue;
    const at = new Date(Number(s.timestamp) * 1000);
    const revisit = new Date(at.getTime() + 5 * 86_400_000).toISOString().slice(0, 10); // medium confidence until rated
    db.prepare(
      `INSERT INTO dsa_progress (problem, status, solved_at, revisit_at, updated_at) VALUES (?, 'solved', ?, ?, ?)
       ON CONFLICT (problem) DO UPDATE SET status = 'solved', solved_at = coalesce(solved_at, excluded.solved_at), revisit_at = coalesce(revisit_at, excluded.revisit_at), updated_at = excluded.updated_at`,
    ).run(s.titleSlug, at.toISOString(), revisit, new Date().toISOString());
    marked.push(s.titleSlug);
  }
  return { checked: list.length, marked };
}
