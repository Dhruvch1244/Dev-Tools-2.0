import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { motion } from 'motion/react';
import { useQuery } from '@tanstack/react-query';
import { Bell, GraduationCap, CalendarClock, ChevronRight, Cpu, Flag, Flame, Play, RefreshCw, Timer, Trophy, Zap } from 'lucide-react';
import { api, useList, useResource, useSettings } from '../../lib/api';
import { useDsa, useSeason, nextRevisit } from '../../lib/dsa';
import { addDays, daysBetween, parseDate, today } from '../../lib/format';
import { ALL_PRACTICE, MEGAS, POINTS, WEEKS, currentWeek, findProblem, megaDate, problemsForDay, weekDates } from '../../core/dsa/plan';
import { mastery, pickMock } from '../../core/dsa/mastery';
import type { DsaTest, Task } from '../../lib/types';
import { useToast } from '../../components/toast';
import { AnimatedNumber, Button, Card, Input, Page, PageHeader, ProgressRing, Rise, SectionTitle, cx } from '../../components/ui';
import { Telemetry } from '../../components/f1';
import { PLATFORM, ProblemRow, countdown } from './shared';
import { FocusCard } from '../../components/FocusMode';

type ContestResp = { contests: { platform: string; name: string; url: string; start: string; durationMin: number }[]; errors: Record<string, string> };
type ProfileResp = {
  codeforces?: { rating: number | null; maxRating: number | null; rank: string; history: { rating: number; at: string; name: string }[]; error?: string };
  leetcode?: { rating: number | null; topPercentage: number | null; attended: number; solved: Record<string, number>; history: { rating: number; at: string; name: string }[]; error?: string };
};

function useNow(ms = 30_000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

function Sparkline({ values, color }: { values: number[]; color: string }) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * 100},${30 - ((v - min) / Math.max(1, max - min)) * 26 - 2}`).join(' ');
  return (
    <svg viewBox="0 0 100 30" className="h-10 w-full" preserveAspectRatio="none" aria-hidden>
      <motion.polyline points={pts} fill="none" stroke={color} strokeWidth={2} vectorEffect="non-scaling-stroke" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.2, ease: 'easeOut' }} />
    </svg>
  );
}

/** 13-spoke radar of mastery per round; the weakest started rounds are called out. */
function Radar({ data }: { data: ReturnType<typeof mastery> }) {
  const n = data.length;
  const pt = (i: number, r: number) => {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    return [50 + Math.cos(a) * r * 38, 50 + Math.sin(a) * r * 38] as const;
  };
  const poly = data.map((d, i) => pt(i, Math.max(0.03, d.value)).join(',')).join(' ');
  const started = data.filter((d) => d.solved > 0);
  const weakest = [...started].sort((a, b) => a.value - b.value).slice(0, 3);
  return (
    <Card>
      <SectionTitle>Weakness radar</SectionTitle>
      <div className="grid items-center gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <svg viewBox="0 0 100 100" className="mx-auto w-full max-w-[300px]" role="img" aria-label="Mastery by round">
          {[0.25, 0.5, 0.75, 1].map((r) => (
            <polygon key={r} points={data.map((_, i) => pt(i, r).join(',')).join(' ')} fill="none" stroke="var(--line)" strokeWidth={0.4} />
          ))}
          {data.map((d, i) => {
            const [x, y] = pt(i, 1.17);
            const [sx, sy] = pt(i, 1);
            return (
              <g key={d.week.n}>
                <line x1={50} y1={50} x2={sx} y2={sy} stroke="var(--line)" strokeWidth={0.3} />
                <text x={x} y={y + 1.2} textAnchor="middle" fontSize={3.4} fontWeight={800} className="fill-ink-3">
                  R{d.week.n}
                </text>
              </g>
            );
          })}
          <motion.polygon points={poly} fill="rgb(225 6 0 / .22)" stroke="var(--accent)" strokeWidth={0.9} initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 90, damping: 14 }} style={{ transformOrigin: '50px 50px' }} />
        </svg>
        <div className="space-y-2 text-sm">
          {weakest.length === 0 ? (
            <p className="text-ink-3">Solve a few problems and the radar fills in — each spoke is a round, scored from solves, confidence and qualifying results.</p>
          ) : (
            <>
              <p className="text-micro font-black uppercase tracking-[0.2em] text-ink-3">Needs work</p>
              {weakest.map((d) => (
                <Link key={d.week.n} to={`/dsa/week/${d.week.n}`} className="flex items-center gap-2 rounded-md bg-bg px-3 py-2 hover:bg-surface-2">
                  <span className="font-mono text-xs font-bold text-ink-3">R{d.week.n}</span>
                  <span className="min-w-0 flex-1 truncate font-semibold">{d.week.topic}</span>
                  <span className="font-mono text-xs text-accent-2">{Math.round(d.value * 100)}%</span>
                </Link>
              ))}
            </>
          )}
        </div>
      </div>
    </Card>
  );
}

function Contests() {
  const now = useNow();
  const { data, isLoading, refetch, isFetching } = useQuery({ queryKey: ['contests'], queryFn: () => api<ContestResp>('/contests'), staleTime: 10 * 60_000 });
  const { create } = useResource<Task>('tasks');
  const toast = useToast();
  const list = (data?.contests ?? []).filter((c) => Date.parse(c.start) > now).slice(0, 9);
  const remind = async (c: ContestResp['contests'][0]) => {
    const d = new Date(Date.parse(c.start) - 15 * 60_000);
    const due = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    await create({ title: `🏁 ${c.name}`, notes: c.url, due, priority: 2, done: 0 });
    toast({ message: 'Reminder set 15 min before start' });
  };
  return (
    <Card>
      <SectionTitle
        action={
          <button onClick={() => refetch()} className="text-ink-3 hover:text-ink" aria-label="Refresh contests">
            <RefreshCw className={cx('size-4', isFetching && 'animate-spin')} />
          </button>
        }
      >
        <span className="flex items-center gap-2">
          <CalendarClock className="size-4 text-accent" /> Online races
        </span>
      </SectionTitle>
      {isLoading && <p className="py-6 text-center text-sm text-ink-3">Fetching Codeforces · LeetCode · CodeChef…</p>}
      <ul className="space-y-1.5">
        {list.map((c, i) => {
          const pf = PLATFORM[c.platform];
          const soon = Date.parse(c.start) - now < 24 * 3600_000;
          return (
            <motion.li key={c.url + c.start} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }} className="group flex items-center gap-3 rounded-md bg-bg px-3 py-2">
              <span className="slant w-9 text-center text-micro font-black text-black" style={{ background: pf.color }}>
                {pf.label}
              </span>
              <a href={c.url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate text-sm font-semibold hover:text-accent-2">
                {c.name}
              </a>
              <span className="hidden text-xs text-ink-3 sm:inline">{new Date(c.start).toLocaleString(undefined, { weekday: 'short', hour: '2-digit', minute: '2-digit' })}</span>
              <span className={cx('w-16 text-right font-mono text-xs font-bold', soon ? 'text-accent-2' : 'text-ink-2')}>{countdown(c.start, now)}</span>
              <button onClick={() => void remind(c)} className="text-ink-3 hover:text-ink" aria-label={`Remind me about ${c.name}`} title="Add a reminder task">
                <Bell className="size-4" />
              </button>
            </motion.li>
          );
        })}
      </ul>
      {data && Object.keys(data.errors).length > 0 && <p className="mt-2 text-tiny text-warn">Unavailable right now: {Object.keys(data.errors).join(', ')}</p>}
    </Card>
  );
}

function LeetCodePull() {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  return (
    <div className="-mt-2 mb-4 flex items-center gap-2 text-xs text-ink-3">
      <Button
        size="sm"
        variant="ghost"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            const r = await api<{ checked: number; marked: string[] }>('/dsa/sync-leetcode', { method: 'POST' });
            toast({ message: r.marked.length ? `Marked ${r.marked.length} solved from LeetCode` : `Up to date (checked ${r.checked} recent ACs)` });
          } catch (e) {
            toast({ message: (e as Error).message });
          } finally {
            setBusy(false);
          }
        }}
      >
        <RefreshCw className={cx('size-3.5', busy && 'animate-spin')} /> Pull my LeetCode solves
      </Button>
      Season problems you get Accepted on LeetCode are marked solved here automatically every 30 min.
    </div>
  );
}

function Ratings() {
  const { settings, save } = useSettings();
  const h = settings.handles ?? {};
  const [cf, setCf] = useState(h.codeforces ?? '');
  const [lc, setLc] = useState(h.leetcode ?? '');
  useEffect(() => (setCf(h.codeforces ?? ''), setLc(h.leetcode ?? '')), [h.codeforces, h.leetcode]);
  const { data, isFetching } = useQuery({
    queryKey: ['profiles', h.codeforces, h.leetcode],
    queryFn: () => api<ProfileResp>(`/profiles?cf=${encodeURIComponent(h.codeforces ?? '')}&lc=${encodeURIComponent(h.leetcode ?? '')}`),
    enabled: !!(h.codeforces || h.leetcode),
    staleTime: 10 * 60_000,
  });
  return (
    <Card>
      <SectionTitle>
        <span className="flex items-center gap-2">
          <Zap className="size-4 text-yellow" /> Driver ratings
        </span>
      </SectionTitle>
      <form
        className="mb-4 flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          save({ handles: { ...h, codeforces: cf.trim() || undefined, leetcode: lc.trim() || undefined } });
        }}
      >
        <Input autoCorrect="off" autoCapitalize="off" spellCheck={false} placeholder="Codeforces handle" value={cf} onChange={(e) => setCf(e.target.value)} className="min-w-0 flex-1" />
        <Input autoCorrect="off" autoCapitalize="off" spellCheck={false} placeholder="LeetCode username" value={lc} onChange={(e) => setLc(e.target.value)} className="min-w-0 flex-1" />
        <Button type="submit" variant="soft">
          Sync
        </Button>
      </form>
      {h.leetcode && <LeetCodePull />}
      {isFetching && <p className="text-xs text-ink-3">Syncing…</p>}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {data?.codeforces && (
          <div className="rounded-md border-l-[3px] border-[#4fb3ff] bg-bg p-3">
            <p className="text-micro font-black uppercase tracking-[0.2em] text-ink-3">Codeforces</p>
            {data.codeforces.error ? (
              <p className="text-sm text-warn">{data.codeforces.error}</p>
            ) : (
              <>
                <p className="text-3xl font-black italic">{data.codeforces.rating ?? '—'}</p>
                <p className="text-xs capitalize text-ink-3">
                  {data.codeforces.rank} · max {data.codeforces.maxRating ?? '—'}
                </p>
                <Sparkline values={data.codeforces.history.map((x) => x.rating)} color="#4fb3ff" />
              </>
            )}
          </div>
        )}
        {data?.leetcode && (
          <div className="rounded-md border-l-[3px] border-[#ffa116] bg-bg p-3">
            <p className="text-micro font-black uppercase tracking-[0.2em] text-ink-3">LeetCode</p>
            {data.leetcode.error ? (
              <p className="text-sm text-warn">{data.leetcode.error}</p>
            ) : (
              <>
                <p className="text-3xl font-black italic">{data.leetcode.rating ?? '—'}</p>
                <p className="text-xs text-ink-3">
                  {data.leetcode.solved.All ?? 0} solved (E {data.leetcode.solved.Easy ?? 0} · M {data.leetcode.solved.Medium ?? 0} · H {data.leetcode.solved.Hard ?? 0})
                  {data.leetcode.topPercentage ? ` · top ${data.leetcode.topPercentage}%` : ''}
                </p>
                <Sparkline values={data.leetcode.history.map((x) => x.rating)} color="#ffa116" />
              </>
            )}
          </div>
        )}
      </div>
      {!h.codeforces && !h.leetcode && <p className="text-xs text-ink-3">Add your handles to pull ratings and contest history.</p>}
    </Card>
  );
}

export function DsaHq() {
  const { start, setStart } = useSeason();
  const { list, get, save } = useDsa();
  const { data: tests = [] } = useList<DsaTest>('dsa_tests');
  const t = today();
  const wk = currentWeek(start, t);
  const week = WEEKS[Math.min(Math.max(wk, 1), WEEKS.length) - 1];
  const solved = list.filter((p) => p.status === 'solved' || p.status === 'revisit');
  const solvedPractice = ALL_PRACTICE.filter((p) => solved.some((s) => s.problem === p.id));
  const points = solvedPractice.reduce((a, p) => a + POINTS[p.diff], 0) + tests.reduce((a, x) => a + (x.score ?? 0), 0);
  const todays = problemsForDay(start, t);
  const due = list.filter((p) => p.revisit_at && p.revisit_at <= t && p.status !== 'todo');
  // Streak: consecutive days (ending today/yesterday) with at least one solve.
  const streak = useMemo(() => {
    const days = new Set(list.map((p) => p.solved_at?.slice(0, 10)).filter(Boolean));
    let d = days.has(t) ? t : addDays(t, -1);
    let n = 0;
    while (days.has(d)) (n++, (d = addDays(d, -1)));
    return n;
  }, [list, t]);
  const diffCount = (d: 'E' | 'M' | 'H') => solvedPractice.filter((p) => p.diff === d).length;
  const testFor = (kind: string, ref: string) => tests.find((x) => x.kind === kind && x.ref === ref && x.finished_at);
  const radar = useMemo(() => mastery(list, tests), [list, tests]);
  const navigate = useNavigate();
  const toast = useToast();
  const startMock = async () => {
    const p = pickMock(list, tests, wk);
    if (!p) return toast({ message: 'No unseen problems left to draw from — impressive.' });
    // The interview room starts the clock once you pick a length.
    navigate(`/dsa/interview/${p.id}`);
  };

  return (
    <Page>
      <PageHeader
        eyebrow="Mind · Season 26/27"
        title={
          <>
            DSA <span className="text-gradient">Championship</span>
          </>
        }
        action={
          <div className="flex gap-2">
            <Link to="/dsa/learn">
              <Button>
                <GraduationCap className="size-4" /> Learn
              </Button>
            </Link>
            <Link to="/dsa/viz">
              <Button variant="ghost">
                <Play className="size-4" /> Visualizer
              </Button>
            </Link>
            <Link to="/dsa/lab">
              <Button variant="ghost">
                <Cpu className="size-4" /> Code lab
              </Button>
            </Link>
            <Button onClick={() => void startMock()}>
              <Timer className="size-4" /> Mock interview
            </Button>
          </div>
        }
      />

      {/* Current round hero */}
      <Rise className="mb-4">
        {wk === 0 ? (
          <Card className="relative overflow-hidden">
            <div className="pointer-events-none absolute -right-4 -top-10 text-[160px] font-black italic leading-none text-white/[0.03]">R01</div>
            <p className="slant inline-block bg-accent px-3 py-0.5 text-mini font-black italic uppercase tracking-widest text-white">Pre-season</p>
            <p className="mt-3 text-5xl font-black italic uppercase">Lights out in {daysBetween(t, start)} day{daysBetween(t, start) === 1 ? '' : 's'}</p>
            <p className="mt-1 text-ink-2">
              Round 1 — {WEEKS[0].gp} GP · {WEEKS[0].topic} — starts {parseDate(start).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link to="/dsa/week/1">
                <Button>
                  Preview round 1 <ChevronRight className="size-4" />
                </Button>
              </Link>
              <Button variant="ghost" onClick={() => setStart(t)}>
                Start the season today instead
              </Button>
            </div>
          </Card>
        ) : wk > WEEKS.length ? (
          <Card>
            <p className="text-4xl font-black italic uppercase">Season complete 🏆</p>
            <p className="text-ink-2">{points} championship points. Time for contests and a harder season.</p>
          </Card>
        ) : (
          <Card className="relative overflow-hidden">
            <div className="pointer-events-none absolute -right-4 -top-10 text-[160px] font-black italic leading-none text-white/[0.03]">R{String(week.n).padStart(2, '0')}</div>
            <div className="flex flex-col gap-6 md:flex-row md:items-center">
              <ProgressRing value={week.problems.filter((p) => get(p.id)?.status === 'solved' || get(p.id)?.status === 'revisit').length / week.problems.length} size={110} stroke={9} color="var(--accent)">
                <span className="text-2xl font-black italic">R{week.n}</span>
              </ProgressRing>
              <div className="flex-1">
                <p className="slant inline-block bg-accent px-3 py-0.5 text-mini font-black italic uppercase tracking-widest text-white">Round {week.n} of 13</p>
                <p className="mt-2 text-4xl font-black italic uppercase leading-none">{week.gp} GP</p>
                <p className="mt-1 text-ink-2">{week.topic}</p>
                <p className="mt-1 text-xs font-semibold uppercase tracking-wider text-ink-3">Qualifying (weekly test) {countdown(weekDates(start, week.n).testDay + 'T10:00:00')} away</p>
              </div>
              <Link to={`/dsa/week/${week.n}`}>
                <Button className="h-12 px-6">
                  Enter round <ChevronRight className="size-4" />
                </Button>
              </Link>
            </div>
          </Card>
        )}
      </Rise>

      <div className="mb-4 grid grid-cols-2 gap-2 lg:grid-cols-5">
        <Telemetry label="Points" value={<AnimatedNumber value={points} />} unit="pts" />
        <Telemetry label="Solved" value={<AnimatedNumber value={solvedPractice.length} />} unit={`/ ${ALL_PRACTICE.length}`} accent="var(--green)" />
        <Telemetry label="E · M · H" value={`${diffCount('E')}·${diffCount('M')}·${diffCount('H')}`} accent="var(--yellow)" />
        <Telemetry label="Streak" value={<span className="inline-flex items-center gap-1">{streak}<Flame className={cx('size-6', streak && 'fill-current text-yellow')} /></span>} unit="days" accent="var(--yellow)" />
        <Telemetry label="Revision due" value={due.length} accent="var(--purple)" />
      </div>

      <div className="mb-4">
        <FocusCard
          options={[
            ...todays.map((p) => ({ ref: p.id, label: p.title })),
            ...due.slice(0, 3).flatMap((d) => {
              const p = findProblem(d.problem);
              return p && !todays.some((x) => x.id === p.id) ? [{ ref: p.id, label: `↻ ${p.title}` }] : [];
            }),
            { ref: null, label: 'Free practice' },
            { ref: null, label: 'Academy lesson' },
          ]}
        />
      </div>

      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <SectionTitle>Today's laps</SectionTitle>
          {todays.length ? (
            <ul className="space-y-1.5">
              {todays.map((p, i) => (
                <ProblemRow key={p.id} p={p} prog={get(p.id)} i={i} />
              ))}
            </ul>
          ) : (
            <p className="py-4 text-sm text-ink-3">{wk === 0 ? 'Season not started yet — preview round 1 or start today.' : 'Sunday: qualifying day. Take the weekly test in the round page.'}</p>
          )}
        </Card>
        <Card>
          <SectionTitle>
            <span className="flex items-center gap-2">
              <RefreshCw className="size-4 text-purple" /> Revision queue
            </span>
          </SectionTitle>
          {due.length === 0 ? (
            <p className="py-4 text-sm text-ink-3">Nothing due. Solved problems come back after 2, 5 or 14 days depending on how confident you felt.</p>
          ) : (
            <ul className="space-y-1.5">
              {due.slice(0, 8).map((d, i) => {
                const p = findProblem(d.problem);
                return p ? (
                  <ProblemRow
                    key={p.id}
                    p={p}
                    prog={d}
                    i={i}
                    extra={
                      <Button size="sm" variant="soft" onClick={() => save({ problem: p.id, revisit_at: nextRevisit(d), status: 'solved' })}>
                        Revised
                      </Button>
                    }
                  />
                ) : null;
              })}
            </ul>
          )}
        </Card>
      </div>

      <Rise className="mb-4">
        <Radar data={radar} />
      </Rise>

      {/* Season calendar */}
      <Rise className="mb-4">
        <SectionTitle>
          <span className="flex items-center gap-2">
            <Flag className="size-4 text-accent" /> Season calendar
          </span>
        </SectionTitle>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {WEEKS.map((w, i) => {
            const done = w.problems.filter((p) => ['solved', 'revisit'].includes(get(p.id)?.status ?? '')).length;
            const dates = weekDates(start, w.n);
            const isNow = wk === w.n;
            const past = wk > w.n;
            const wt = testFor('weekly', String(w.n));
            const mega = MEGAS.find((m) => m.afterWeek === w.n);
            const mt = mega && testFor('mega', mega.id);
            return (
              <motion.div key={w.n} initial={{ opacity: 0, y: 16, skewX: -6 }} animate={{ opacity: 1, y: 0, skewX: 0 }} transition={{ delay: 0.1 + i * 0.035, type: 'spring', stiffness: 300, damping: 26 }}>
                <Link to={`/dsa/week/${w.n}`} className={cx('group relative block overflow-hidden rounded-lg border bg-surface p-3.5 transition-colors hover:border-accent', isNow ? 'border-accent' : 'border-line', past && done < w.problems.length && 'opacity-80')}>
                  <span className="absolute inset-x-0 bottom-0 h-[3px] bg-surface-2">
                    <motion.span className="block h-full bg-accent" initial={{ width: 0 }} animate={{ width: `${(done / w.problems.length) * 100}%` }} transition={{ type: 'spring', stiffness: 60, damping: 16, delay: 0.3 + i * 0.03 }} />
                  </span>
                  <div className="flex items-start justify-between">
                    <span className="font-mono text-tiny font-bold text-ink-3">R{String(w.n).padStart(2, '0')}</span>
                    <span className="text-micro font-semibold uppercase text-ink-3">{parseDate(dates.start).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</span>
                  </div>
                  <p className="mt-1 text-lg font-black italic uppercase leading-tight group-hover:text-accent-2">{w.gp}</p>
                  <p className="line-clamp-1 text-xs text-ink-2">{w.topic}</p>
                  <div className="mt-2 flex items-center gap-2 text-tiny font-bold">
                    <span className="font-mono text-ink-2">
                      {done}/{w.problems.length}
                    </span>
                    {wt && <span className="slant bg-green px-1.5 text-black">Q {Math.round(wt.score ?? 0)}</span>}
                    {mega && (
                      <span className={cx('slant px-1.5', mt ? 'bg-purple text-black' : 'bg-surface-2 text-ink-2')} title={mega.title}>
                        <Trophy className="mr-0.5 inline size-3" />
                        {mt ? Math.round(mt.score ?? 0) : 'GP'}
                      </span>
                    )}
                    {isNow && <span className="ml-auto text-accent-2">● LIVE</span>}
                  </div>
                </Link>
              </motion.div>
            );
          })}
        </div>
        <p className="mt-2 text-tiny text-ink-3">
          Grand Prix mega tests: {MEGAS.map((m) => `${m.title.split(' — ')[0]} (${parseDate(megaDate(start, m)).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })})`).join(' · ')}
        </p>
      </Rise>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Rise>
          <Contests />
        </Rise>
        <Rise>
          <Ratings />
        </Rise>
      </div>
    </Page>
  );
}
