// Upcoming contests + profile stats from Codeforces, LeetCode and CodeChef.
//
// One cache, one in-flight promise per key (dsgn pillar #2): the page polls and several tabs
// may ask at once, but each upstream is hit at most once per TTL. A failing platform degrades
// to "unavailable" for that platform only — it never blanks the others.

export type Contest = { platform: 'codeforces' | 'leetcode' | 'codechef'; name: string; url: string; start: string; durationMin: number };

const TTL = 30 * 60_000;
const cache = new Map<string, { at: number; value: unknown }>();
const inflight = new Map<string, Promise<unknown>>();

async function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.value as T;
  if (inflight.has(key)) return inflight.get(key) as Promise<T>;
  const p = load()
    .then((value) => (cache.set(key, { at: Date.now(), value }), value))
    .finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

const getJson = async (url: string, init?: RequestInit) => {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(10_000), headers: { 'user-agent': 'dev-tools-2', ...init?.headers } });
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return res.json();
};
const leetcode = (query: string, variables = {}) =>
  getJson('https://leetcode.com/graphql', {
    method: 'POST',
    body: JSON.stringify({ query, variables }),
    headers: { 'content-type': 'application/json', referer: 'https://leetcode.com' },
  });

async function codeforces(): Promise<Contest[]> {
  const j = await getJson('https://codeforces.com/api/contest.list?gym=false');
  return j.result
    .filter((c: { phase: string }) => c.phase === 'BEFORE')
    .map((c: { id: number; name: string; startTimeSeconds: number; durationSeconds: number }) => ({
      platform: 'codeforces' as const,
      name: c.name,
      url: `https://codeforces.com/contests/${c.id}`,
      start: new Date(c.startTimeSeconds * 1000).toISOString(),
      durationMin: Math.round(c.durationSeconds / 60),
    }));
}

async function leetcodeContests(): Promise<Contest[]> {
  const j = await leetcode('{ upcomingContests { title titleSlug startTime duration } }');
  return j.data.upcomingContests.map((c: { title: string; titleSlug: string; startTime: number; duration: number }) => ({
    platform: 'leetcode' as const,
    name: c.title,
    url: `https://leetcode.com/contest/${c.titleSlug}`,
    start: new Date(c.startTime * 1000).toISOString(),
    durationMin: Math.round(c.duration / 60),
  }));
}

async function codechef(): Promise<Contest[]> {
  const j = await getJson('https://www.codechef.com/api/list/contests/all?sort_by=START&sorting_order=asc&offset=0&mode=all');
  const list = [...(j.present_contests ?? []), ...(j.future_contests ?? [])];
  return list
    .filter((c: { contest_start_date_iso: string }) => new Date(c.contest_start_date_iso).getTime() > Date.now())
    .map((c: { contest_code: string; contest_name: string; contest_start_date_iso: string; contest_duration: string }) => ({
      platform: 'codechef' as const,
      name: c.contest_name,
      url: `https://www.codechef.com/${c.contest_code}`,
      start: new Date(c.contest_start_date_iso).toISOString(),
      durationMin: Number(c.contest_duration) || 0,
    }));
}

export async function upcomingContests() {
  return cached('contests', async () => {
    const sources = { codeforces, leetcode: leetcodeContests, codechef };
    const results = await Promise.allSettled(Object.values(sources).map((f) => f()));
    const contests: Contest[] = [];
    const errors: Record<string, string> = {};
    Object.keys(sources).forEach((name, i) => {
      const r = results[i];
      if (r.status === 'fulfilled') contests.push(...r.value);
      else errors[name] = String(r.reason?.message ?? r.reason);
    });
    contests.sort((a, b) => a.start.localeCompare(b.start));
    return { contests, errors, fetchedAt: new Date().toISOString() };
  });
}

export async function profiles(handles: { codeforces?: string; leetcode?: string }) {
  const out: Record<string, unknown> = {};
  const jobs: Promise<void>[] = [];
  if (handles.codeforces) {
    const h = handles.codeforces;
    jobs.push(
      cached(`cf:${h}`, async () => {
        const [info, rating] = await Promise.all([getJson(`https://codeforces.com/api/user.info?handles=${encodeURIComponent(h)}`), getJson(`https://codeforces.com/api/user.rating?handle=${encodeURIComponent(h)}`)]);
        const u = info.result[0];
        return {
          rating: u.rating ?? null,
          maxRating: u.maxRating ?? null,
          rank: u.rank ?? 'unrated',
          history: rating.result.map((r: { contestName: string; newRating: number; ratingUpdateTimeSeconds: number; rank: number }) => ({
            name: r.contestName,
            rating: r.newRating,
            rank: r.rank,
            at: new Date(r.ratingUpdateTimeSeconds * 1000).toISOString(),
          })),
        };
      })
        .then((v) => void (out.codeforces = v))
        .catch((e) => void (out.codeforces = { error: String(e.message ?? e) })),
    );
  }
  if (handles.leetcode) {
    const h = handles.leetcode;
    jobs.push(
      cached(`lc:${h}`, async () => {
        const j = await leetcode(
          `query($u: String!) {
            matchedUser(username: $u) { submitStatsGlobal { acSubmissionNum { difficulty count } } }
            userContestRanking(username: $u) { rating globalRanking attendedContestsCount topPercentage }
            userContestRankingHistory(username: $u) { attended rating contest { title startTime } }
          }`,
          { u: h },
        );
        if (!j.data?.matchedUser) throw new Error('user not found');
        return {
          solved: Object.fromEntries(j.data.matchedUser.submitStatsGlobal.acSubmissionNum.map((x: { difficulty: string; count: number }) => [x.difficulty, x.count])),
          rating: j.data.userContestRanking?.rating ? Math.round(j.data.userContestRanking.rating) : null,
          globalRanking: j.data.userContestRanking?.globalRanking ?? null,
          topPercentage: j.data.userContestRanking?.topPercentage ?? null,
          attended: j.data.userContestRanking?.attendedContestsCount ?? 0,
          history: (j.data.userContestRankingHistory ?? [])
            .filter((x: { attended: boolean }) => x.attended)
            .map((x: { rating: number; contest: { title: string; startTime: number } }) => ({ name: x.contest.title, rating: Math.round(x.rating), at: new Date(x.contest.startTime * 1000).toISOString() })),
        };
      })
        .then((v) => void (out.leetcode = v))
        .catch((e) => void (out.leetcode = { error: String(e.message ?? e) })),
    );
  }
  await Promise.all(jobs);
  return out;
}
