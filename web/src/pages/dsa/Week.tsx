import { Link, useParams } from 'react-router';
import { motion } from 'motion/react';
import { ArrowLeft, GraduationCap, ChevronLeft, ChevronRight, Play, Timer, Trophy } from 'lucide-react';
import { useList } from '../../lib/api';
import { md, useDsa, useSeason } from '../../lib/dsa';
import { parseDate } from '../../lib/format';
import { MEGAS, WEEKS, problemsForDay, weekDates } from '../../core/dsa/plan';
import { algoById } from '../../core/dsa/viz';
import type { DsaTest } from '../../lib/types';
import { Button, Card, Page, PageHeader, Rise, SectionTitle } from '../../components/ui';
import { ProblemRow, STATUS } from './shared';

export function DsaWeek() {
  const n = Number(useParams().n) || 1;
  const w = WEEKS[n - 1] ?? WEEKS[0];
  const { start } = useSeason();
  const { get, save } = useDsa();
  const { data: tests = [] } = useList<DsaTest>('dsa_tests');
  const dates = weekDates(start, w.n);
  const mega = MEGAS.find((m) => m.afterWeek === w.n);
  const weeklyDone = tests.filter((t) => t.kind === 'weekly' && t.ref === String(w.n) && t.finished_at);
  const megaDone = mega ? tests.filter((t) => t.kind === 'mega' && t.ref === mega.id && t.finished_at) : [];
  const days = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(parseDate(dates.start));
    d.setDate(d.getDate() + i);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return { iso, label: d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' }), problems: problemsForDay(start, iso) };
  });

  return (
    <Page>
      <Rise className="mb-3 flex items-center justify-between">
        <Link to="/dsa" className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-ink-3 hover:text-ink">
          <ArrowLeft className="size-4" /> Season HQ
        </Link>
        <div className="flex gap-1">
          {w.n > 1 && (
            <Link to={`/dsa/week/${w.n - 1}`} className="grid size-8 place-items-center rounded-md bg-surface-2 text-ink-2 hover:text-ink" aria-label="Previous round">
              <ChevronLeft className="size-4" />
            </Link>
          )}
          {w.n < WEEKS.length && (
            <Link to={`/dsa/week/${w.n + 1}`} className="grid size-8 place-items-center rounded-md bg-surface-2 text-ink-2 hover:text-ink" aria-label="Next round">
              <ChevronRight className="size-4" />
            </Link>
          )}
        </div>
      </Rise>
      <PageHeader eyebrow={`Round ${w.n} · ${parseDate(dates.start).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} – ${parseDate(dates.end).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`} title={`${w.gp} GP`} action={w.n <= 4 ? <Link to="/dsa/learn"><Button><GraduationCap className="size-4" /> Learn this week</Button></Link> : undefined} />
      <Rise className="-mt-4 mb-6 text-lg text-ink-2">{w.topic}</Rise>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <Card>
            <SectionTitle>Race schedule</SectionTitle>
            <div className="space-y-4">
              {days.map((d, di) => (
                <div key={d.iso}>
                  <p className="mb-1.5 text-tiny font-black uppercase tracking-[0.18em] text-ink-3">{d.label}</p>
                  <ul className="space-y-1.5">
                    {d.problems.map((p, i) => {
                      const prog = get(p.id);
                      return (
                        <ProblemRow
                          key={p.id}
                          p={p}
                          prog={prog}
                          i={di * 2 + i}
                          extra={
                            <select
                              aria-label={`Status of ${p.title}`}
                              value={prog?.status ?? 'todo'}
                              onChange={(e) => save({ problem: p.id, status: e.target.value as never, ...(e.target.value === 'solved' && !prog?.solved_at ? { solved_at: new Date().toISOString() } : {}) })}
                              className="rounded border border-line bg-surface-2 px-1.5 py-1 text-tiny font-bold uppercase"
                            >
                              {STATUS.map((s) => (
                                <option key={s.value} value={s.value}>
                                  {s.label}
                                </option>
                              ))}
                            </select>
                          }
                        />
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          </Card>

          <Card className="relative overflow-hidden">
            <div className="pointer-events-none absolute -right-2 -top-6 text-[110px] font-black italic leading-none text-white/[0.03]">Q</div>
            <p className="slant inline-block bg-green px-3 py-0.5 text-mini font-black italic uppercase tracking-widest text-black">Qualifying · Sunday</p>
            <p className="mt-2 text-2xl font-black italic uppercase">Weekly test · 90 min</p>
            <p className="text-sm text-ink-2">3 unseen problems on this round's patterns. Timed — no peeking at your notes.</p>
            {weeklyDone.length > 0 && <p className="mt-2 text-sm font-semibold text-green">Best score: {Math.max(...weeklyDone.map((t) => t.score ?? 0))} pts ({weeklyDone.length} attempt{weeklyDone.length > 1 ? 's' : ''})</p>}
            <Link to={`/dsa/test/weekly/${w.n}`}>
              <Button className="mt-3">
                <Timer className="size-4" /> Go to qualifying
              </Button>
            </Link>
          </Card>

          {mega && (
            <Card className="relative overflow-hidden border-purple/40">
              <p className="slant inline-block bg-purple px-3 py-0.5 text-mini font-black italic uppercase tracking-widest text-black">Grand Prix · mega test</p>
              <p className="mt-2 text-2xl font-black italic uppercase">{mega.title}</p>
              <p className="text-sm text-ink-2">
                {mega.problems.length} problems · {mega.durationMin / 60} h · covers rounds {mega.covers.join(', ')}.
              </p>
              {megaDone.length > 0 && <p className="mt-2 text-sm font-semibold text-purple">Best score: {Math.max(...megaDone.map((t) => t.score ?? 0))} pts</p>}
              <Link to={`/dsa/test/mega/${mega.id}`}>
                <Button className="mt-3">
                  <Trophy className="size-4" /> Go to the grid
                </Button>
              </Link>
            </Card>
          )}
        </div>

        <div className="space-y-4">
          {w.viz.length > 0 && (
            <Card>
              <SectionTitle>Watch it run</SectionTitle>
              <div className="space-y-2">
                {w.viz.map((id, i) => {
                  const a = algoById(id);
                  return a ? (
                    <motion.div key={id} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.08 }}>
                      <Link to={`/dsa/viz/${id}`} className="group flex items-center gap-3 rounded-md bg-bg p-3 transition hover:bg-surface-2">
                        <span className="grid size-10 place-items-center rounded-md bg-accent text-white transition group-hover:scale-110">
                          <Play className="size-4 fill-current" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-bold">{a.title}</span>
                          <span className="block truncate text-xs text-ink-3">{a.blurb}</span>
                        </span>
                      </Link>
                    </motion.div>
                  ) : null;
                })}
              </div>
            </Card>
          )}
          <Card>
            <SectionTitle>Briefing</SectionTitle>
            <div className="prose-f1" dangerouslySetInnerHTML={{ __html: md(w.concepts) }} />
          </Card>
        </div>
      </div>
    </Page>
  );
}
