import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeft, ExternalLink, Flag } from 'lucide-react';
import { useList, useResource } from '../../lib/api';
import { MEGAS, POINTS, WEEKS, findProblem, type Problem } from '../../core/dsa/plan';
import type { DsaTest } from '../../lib/types';
import { Chequered, StartLights, Telemetry } from '../../components/f1';
import { Button, Card, Page, PageHeader, Rise, SectionTitle, cx } from '../../components/ui';
import { DiffChip } from './shared';

type Outcome = 'solved' | 'partial' | 'unsolved';
type Results = Record<string, { outcome: Outcome; at?: number }>;

/** Full points for a solve, a third for partial; a 25% bonus for a solve in the first half of the clock. */
function score(problems: Problem[], results: Results, startedAt: number, durationMin: number) {
  return Math.round(
    problems.reduce((a, p) => {
      const r = results[p.id];
      if (!r || r.outcome === 'unsolved') return a;
      const base = POINTS[p.diff] * (r.outcome === 'solved' ? 1 : 1 / 3);
      const fast = r.outcome === 'solved' && r.at && r.at - startedAt < (durationMin * 60_000) / 2 ? 1.25 : 1;
      return a + base * fast;
    }, 0),
  );
}

export function DsaTestPage() {
  const { kind = 'weekly', ref = '1' } = useParams();
  const isMega = kind === 'mega';
  const week = WEEKS[Number(ref) - 1];
  const mega = MEGAS.find((m) => m.id === ref);
  const isMock = kind === 'mock';
  const mockP = isMock ? findProblem(ref) : undefined;
  const title = isMock ? `Mock interview — ${mockP?.title ?? ''}` : isMega ? (mega?.title ?? 'Grand Prix') : `Qualifying — R${ref} ${week?.gp ?? ''} GP`;
  const problems = (isMock ? (mockP ? [mockP] : []) : isMega ? mega?.problems : week?.test) ?? [];
  // Mock interviews run like the real thing: 45 min for a Medium, 60 for a Hard.
  const duration = isMock ? (mockP?.diff === 'H' ? 60 : 45) : isMega ? (mega?.durationMin ?? 180) : 90;
  const { data: tests = [] } = useList<DsaTest>('dsa_tests');
  const { create, update } = useResource<DsaTest>('dsa_tests');
  const mine = tests.filter((t) => t.kind === kind && t.ref === ref);
  const live = mine.find((t) => !t.finished_at);
  const [lights, setLights] = useState(false);
  const [now, setNow] = useState(Date.now());
  const results: Results = useMemo(() => (live?.results ? JSON.parse(live.results) : {}), [live?.results]);

  useEffect(() => {
    if (!live) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [live]);

  const startedAt = live ? Date.parse(live.started_at) : 0;
  const left = live ? Math.max(0, startedAt + duration * 60_000 - now) : duration * 60_000;
  const finish = () => {
    if (!live) return;
    update({ id: live.id, finished_at: new Date().toISOString(), score: score(problems, results, startedAt, duration) });
  };
  useEffect(() => {
    if (live && left === 0) finish();
    // finishing is idempotent server-side; run once when the clock hits zero
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [left === 0, live?.id]);

  const setOutcome = (p: Problem, outcome: Outcome) => {
    if (!live) return;
    const next = { ...results, [p.id]: { outcome, at: outcome === 'solved' ? Date.now() : undefined } };
    update({ id: live.id, results: JSON.stringify(next) });
  };
  const fmt = (ms: number) => {
    const s = Math.ceil(ms / 1000);
    return `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  };
  const lastDone = mine.filter((t) => t.finished_at).sort((a, b) => b.started_at.localeCompare(a.started_at))[0];

  return (
    <Page>
      <Rise className="mb-3">
        <Link to={isMega || isMock ? '/dsa' : `/dsa/week/${ref}`} className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-ink-3 hover:text-ink">
          <ArrowLeft className="size-4" /> Back
        </Link>
      </Rise>
      <PageHeader eyebrow={isMock ? 'Mock interview' : isMega ? 'Grand Prix · mega test' : 'Qualifying · weekly test'} title={title} />

      {!live ? (
        <Card className="flex flex-col items-center gap-6 py-10 text-center">
          <p className="max-w-lg text-ink-2">
            {problems.length} unseen problems · {duration} minutes. Open each one here — statement, editor and judge included — and a green run counts it on this grid. Solving in the first half of the clock earns a 25% bonus.
          </p>
          <StartLights running={lights} onGo={async () => (await create({ kind: kind as 'weekly' | 'mega' | 'mock', ref, started_at: new Date().toISOString(), duration_min: duration, results: '{}' }), setLights(false))} />
          <Button className="h-12 px-10 text-base" disabled={lights} onClick={() => setLights(true)}>
            {lights ? 'Hold…' : 'Start the clock'}
          </Button>
          {lastDone && (
            <div className="flex items-center gap-3">
              <Chequered className="h-10 w-14" />
              <p className="text-sm text-ink-2">
                Last attempt: <b className="text-ink">{lastDone.score} pts</b> on {new Date(lastDone.started_at).toLocaleDateString()}
              </p>
            </div>
          )}
        </Card>
      ) : (
        <>
          <div className="sticky top-14 z-20 mb-4 grid grid-cols-3 gap-2 bg-bg/80 py-2 backdrop-blur">
            <Telemetry label="Time left" value={<span className={cx('font-mono not-italic', left < 10 * 60_000 && 'text-accent-2')}>{fmt(left)}</span>} />
            <Telemetry label="Solved" value={`${Object.values(results).filter((r) => r.outcome === 'solved').length}/${problems.length}`} accent="var(--green)" />
            <Telemetry label="Projected" value={score(problems, results, startedAt, duration)} unit="pts" accent="var(--purple)" />
          </div>
          <div className="h-1.5 overflow-hidden rounded-sm bg-surface-2">
            <motion.div className="h-full bg-accent" animate={{ width: `${(left / (duration * 60_000)) * 100}%` }} transition={{ ease: 'linear', duration: 1 }} />
          </div>
          <Card className="mt-4">
            <SectionTitle>The grid</SectionTitle>
            <ul className="space-y-2">
              {problems.map((p, i) => {
                const r = results[p.id]?.outcome;
                return (
                  <motion.li key={p.id} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.06 }} className="flex flex-wrap items-center gap-3 rounded-md bg-bg px-3 py-3">
                    <span className="w-8 font-mono font-bold text-ink-3">P{i + 1}</span>
                    <DiffChip d={p.diff} />
                    <Link to={`/dsa/p/${p.id}`} className="min-w-0 flex-1 truncate font-semibold hover:text-accent-2">
                      {p.title}
                    </Link>
                    <a href={p.url} target="_blank" rel="noreferrer" aria-label={`${p.title} on LeetCode`} className="text-ink-3 hover:text-ink">
                      <ExternalLink className="size-4" />
                    </a>
                    <div className="flex gap-1">
                      {(['solved', 'partial', 'unsolved'] as Outcome[]).map((o) => (
                        <button
                          key={o}
                          onClick={() => setOutcome(p, o)}
                          className={cx('slant px-2.5 py-1 text-[10px] font-black italic uppercase', r === o ? (o === 'solved' ? 'bg-green text-black' : o === 'partial' ? 'bg-yellow text-black' : 'bg-accent text-white') : 'bg-surface-2 text-ink-3 hover:text-ink')}
                        >
                          {o}
                        </button>
                      ))}
                    </div>
                  </motion.li>
                );
              })}
            </ul>
            <Button className="mt-4 h-12 w-full" onClick={finish}>
              <Flag className="size-4" /> Finish — take the flag
            </Button>
          </Card>
        </>
      )}

      <AnimatePresence>
        {mine.filter((t) => t.finished_at).length > 0 && (
          <Rise className="mt-4">
            <Card>
              <SectionTitle>Attempts</SectionTitle>
              <ul className="space-y-1">
                {mine
                  .filter((t) => t.finished_at)
                  .map((t) => (
                    <li key={t.id} className="flex justify-between rounded-md bg-bg px-3 py-2 text-sm">
                      <span>{new Date(t.started_at).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                      <span className="font-mono font-bold">{t.score} pts</span>
                    </li>
                  ))}
              </ul>
            </Card>
          </Rise>
        )}
      </AnimatePresence>
    </Page>
  );
}
