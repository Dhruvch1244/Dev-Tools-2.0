// Mastery per round and mock-interview problem picking. Pure, no React.
import { ALL_PRACTICE, WEEKS, type Problem } from './plan';

type Prog = { problem: string; status: string; confidence: number | null; minutes: number | null };
type Test = { kind: string; ref: string; score: number | null; finished_at: string | null };

/**
 * 0–1 per round: 60% solved fraction, 25% average confidence (unrated solves count as medium),
 * 15% best qualifying score relative to the max available. A round with nothing done scores 0.
 */
export function mastery(progress: Prog[], tests: Test[]) {
  const by = new Map(progress.map((p) => [p.problem, p]));
  return WEEKS.map((w) => {
    const solved = w.problems.filter((p) => ['solved', 'revisit'].includes(by.get(p.id)?.status ?? ''));
    const conf = solved.length ? solved.reduce((a, p) => a + (by.get(p.id)?.confidence ?? 2), 0) / solved.length / 3 : 0;
    const maxTest = w.test.reduce((a, p) => a + ({ E: 3, M: 8, H: 15 }[p.diff] * 1.25), 0);
    const best = Math.max(0, ...tests.filter((t) => t.kind === 'weekly' && t.ref === String(w.n) && t.finished_at).map((t) => t.score ?? 0));
    const value = 0.6 * (solved.length / w.problems.length) + 0.25 * conf + 0.15 * Math.min(1, best / maxTest);
    const revisits = w.problems.filter((p) => by.get(p.id)?.status === 'revisit').length;
    return { week: w, value, solved: solved.length, revisits };
  });
}

/** An unseen problem for a mock interview, biased toward the weakest started rounds. */
export function pickMock(progress: Prog[], tests: Test[], currentWeek: number): Problem | null {
  const seen = new Set(progress.filter((p) => p.status !== 'todo').map((p) => p.problem));
  const reach = Math.max(1, Math.min(WEEKS.length, currentWeek || 1));
  const m = mastery(progress, tests).filter((x) => x.week.n <= reach);
  const weights = m.map((x) => 1.2 - x.value); // weaker rounds are likelier
  const pool = (n: number) => ALL_PRACTICE.filter((p) => p.week === n && !seen.has(p.id) && p.diff !== 'E');
  for (let attempt = 0; attempt < 20; attempt++) {
    let r = Math.random() * weights.reduce((a, b) => a + b, 0);
    const i = weights.findIndex((w) => (r -= w) <= 0);
    const options = pool(m[Math.max(0, i)].week.n);
    if (options.length) return options[Math.floor(Math.random() * options.length)];
  }
  const any = ALL_PRACTICE.filter((p) => !seen.has(p.id) && p.week <= reach);
  return any[Math.floor(Math.random() * any.length)] ?? null;
}
