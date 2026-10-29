import { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Radio, Sparkles } from 'lucide-react';
import { api, useList, useSettings } from '../lib/api';
import { addDays, parseDate, today } from '../lib/format';
import { e1rm, volume } from '../core/gym';
import { DEFAULT_PROFILE, targets } from '../core/fuel';
import { ALL_PRACTICE, POINTS } from '../core/dsa/plan';
import type { Activity, DsaProgress, DsaTest, FoodLog, GymSet, Habit, HabitLog, Health, Routine, RoutineLog, Workout } from '../lib/types';
import { Button, Card, IconButton, Page, PageHeader, Rise, SectionTitle, cx } from '../components/ui';
import { md } from '../lib/dsa';

/** Monday of the week containing `d`. */
const mondayOf = (d: string) => {
  const dow = (parseDate(d).getDay() + 6) % 7;
  return addDays(d, -dow);
};
const inRange = (d: string | null | undefined, a: string, b: string) => !!d && d.slice(0, 10) >= a && d.slice(0, 10) <= b;

type Row = { label: string; now: number; prev: number; unit?: string; fmt?: (n: number) => string; better?: 'up' | 'down' | 'none'; target?: number };

function Delta({ r }: { r: Row }) {
  const d = r.now - r.prev;
  if (!r.prev && !r.now) return <span className="text-ink-3">—</span>;
  const f = r.fmt ?? ((n: number) => String(Math.round(n)));
  if (Math.abs(d) < 1e-9) return <span className="text-ink-3">±0</span>;
  // Calories / weight: direction isn't good or bad by itself, so show it in neutral ink.
  if (r.better === 'none') return <span className="font-bold text-ink-2">{d > 0 ? '▲' : '▼'} {f(Math.abs(d))}</span>;
  const good = r.better === 'down' ? d < 0 : d > 0;
  return <span className={cx('font-bold', good ? 'text-green' : 'text-accent-2')}>{d > 0 ? '▲' : '▼'} {f(Math.abs(d))}</span>;
}

function Section({ title, rows, i }: { title: string; rows: Row[]; i: number }) {
  // `i` staggers the rows below by section.
  return (
    <Card>
      <SectionTitle>{title}</SectionTitle>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-micro font-black uppercase tracking-widest text-ink-3">
            <th className="pb-2 font-black" />
            <th className="pb-2 text-right font-black">This week</th>
            <th className="pb-2 text-right font-black">vs last</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, k) => {
            const f = r.fmt ?? ((n: number) => String(Math.round(n)));
            return (
              <motion.tr key={r.label} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 + k * 0.03 }} className="border-t border-line">
                <td className="py-2 text-ink-2">{r.label}</td>
                <td className="py-2 text-right font-mono font-bold">
                  {f(r.now)}
                  {r.unit && <span className="ml-1 text-xs font-normal text-ink-3">{r.unit}</span>}
                  {r.target !== undefined && <span className="ml-1 text-xs font-normal text-ink-3">/ {f(r.target)}</span>}
                </td>
                <td className="py-2 text-right font-mono text-xs">
                  <Delta r={r} />
                </td>
              </motion.tr>
            );
          })}
        </tbody>
      </table>
    </Card>
  );
}

/** The AI race-engineer debrief for a week: written automatically on Sunday evening, or on demand. */
function Debrief({ week }: { week: string }) {
  const qc = useQueryClient();
  const { data: reviews = [] } = useQuery({ queryKey: ['reviews'], queryFn: () => api<{ week: string; body: string; created_at: string }[]>('/reviews') });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const r = reviews.find((x) => x.week === week);
  const run = async () => {
    setBusy(true);
    setErr('');
    try {
      await api('/reviews/generate', { method: 'POST', body: JSON.stringify({ week }) });
      await qc.invalidateQueries({ queryKey: ['reviews'] });
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="rounded-3xl border border-line bg-surface p-5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-micro font-black uppercase tracking-[0.25em] text-ink-3">
          <Radio className="size-3.5 text-accent" /> AI debrief {r && `· ${new Date(r.created_at).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}`}
        </p>
        <Button size="sm" variant={r ? 'ghost' : 'primary'} disabled={busy} onClick={() => void run()}>
          <Sparkles className="size-4" /> {busy ? 'Writing… ~20 s' : r ? 'Rewrite' : 'Write debrief'}
        </Button>
      </div>
      {r ? <div className="prose-f1 text-[15px]" dangerouslySetInnerHTML={{ __html: md(r.body) }} /> : <p className="text-sm text-ink-3">{busy ? 'Reading your week — food, gym, sport, DSA, sleep, money and journal…' : 'Written automatically every Sunday at 7:30 pm and pushed to your phone. Or write it now.'}</p>}
      {err && <p className="mt-2 text-sm text-warn">{err}</p>}
    </div>
  );
}

export function ReportPage() {
  const { settings } = useSettings();
  const [offset, setOffset] = useState(0);
  const start = addDays(mondayOf(today()), -7 * offset);
  const end = addDays(start, 6);
  const pStart = addDays(start, -7);
  const pEnd = addDays(start, -1);
  const from = pStart;
  const { data: workouts = [] } = useList<Workout>('workouts', { from, to: end });
  const { data: sets = [] } = useList<GymSet>('sets');
  const { data: food = [] } = useList<FoodLog>('food_logs', { from, to: end });
  const { data: acts = [] } = useList<Activity>('activities', { from, to: end });
  const { data: health = [] } = useList<Health>('health', { from: addDays(from, -30), to: end });
  const { data: habits = [] } = useList<Habit>('habits');
  const { data: routines = [] } = useList<Routine>('routines');
  const { data: tests = [] } = useList<DsaTest>('dsa_tests');
  const { data: dsa = [] } = useQuery({ queryKey: ['dsa'], queryFn: () => api<DsaProgress[]>('/dsa') });
  const { data: hlogs = [] } = useQuery({ queryKey: ['habit_logs', from], queryFn: () => api<HabitLog[]>(`/habit_logs?from=${from}`) });
  const { data: rlogs = [] } = useQuery({ queryKey: ['routine_logs', from], queryFn: () => api<RoutineLog[]>(`/routine_logs?from=${from}`) });
  const t = targets(settings.fuel ?? DEFAULT_PROFILE);

  const sections = useMemo(() => {
    const week = (a: string, b: string) => {
      const ws = workouts.filter((w) => inRange(w.date, a, b) && w.finished_at);
      const ss = sets.filter((s) => inRange(s.date, a, b));
      const prior = sets.filter((s) => s.date < a);
      const prs = [...new Set(ss.map((s) => s.exercise))].filter((ex) => {
        const best = Math.max(0, ...prior.filter((s) => s.exercise === ex).map((s) => e1rm(s.weight, s.reps)));
        return best > 0 && ss.some((s) => s.exercise === ex && e1rm(s.weight, s.reps) > best);
      }).length;
      const fd = food.filter((f) => inRange(f.date, a, b));
      const days = new Set(fd.map((f) => f.date)).size;
      const kcal = days ? fd.reduce((x, f) => x + f.kcal, 0) / days : 0;
      const protein = days ? fd.reduce((x, f) => x + f.protein, 0) / days : 0;
      const ac = acts.filter((x) => inRange(x.date, a, b));
      const solved = dsa.filter((p) => ['solved', 'revisit'].includes(p.status) && inRange(p.solved_at, a, b));
      const points = solved.reduce((x, p) => x + (POINTS[ALL_PRACTICE.find((q) => q.id === p.problem)?.diff ?? 'M'] ?? 0), 0);
      const ts = tests.filter((x) => x.finished_at && inRange(x.started_at, a, b));
      const activeHabits = habits.filter((h) => !h.archived);
      const habitPct = activeHabits.length ? (hlogs.filter((l) => inRange(l.date, a, b) && activeHabits.some((h) => h.id === l.habit_id)).length / (activeHabits.length * 7)) * 100 : 0;
      const scheduled = routines.filter((r) => r.active).reduce((x, r) => x + JSON.parse(r.days).length, 0);
      const routinePct = scheduled ? (rlogs.filter((l) => inRange(l.date, a, b)).length / scheduled) * 100 : 0;
      const hv = (k: string) => health.filter((h) => h.kind === k && inRange(h.date, a, b)).map((h) => h.value);
      const avg = (xs: number[]) => (xs.length ? xs.reduce((x, y) => x + y, 0) / xs.length : 0);
      const weights = health.filter((h) => h.kind === 'weight' && h.date <= b).sort((x, y) => y.date.localeCompare(x.date));
      return {
        sessions: ws.length,
        sets: ss.length,
        vol: volume(ss),
        prs,
        kcal,
        protein,
        days,
        actMin: ac.reduce((x, y) => x + y.duration_min, 0),
        runKm: ac.filter((x) => x.type === 'run').reduce((s, y) => s + (y.distance_km ?? 0), 0),
        walkKm: ac.filter((x) => x.type === 'walk').reduce((s, y) => s + (y.distance_km ?? 0), 0),
        badminton: ac.filter((x) => x.type === 'badminton').length,
        burned: ac.reduce((x, y) => x + (y.kcal ?? 0), 0),
        solved: solved.length,
        points,
        tests: ts.length,
        testPts: ts.reduce((x, y) => x + (y.score ?? 0), 0),
        habitPct,
        routinePct,
        sleep: avg(hv('sleep')),
        water: avg(hv('water')),
        weight: weights[0]?.value ?? 0,
      };
    };
    const n = week(start, end);
    const p = week(pStart, pEnd);
    const one = (x: number) => x.toFixed(1);
    const rows: { title: string; rows: Row[] }[] = [
      { title: 'Gym', rows: [
        { label: 'Sessions', now: n.sessions, prev: p.sessions },
        { label: 'Sets', now: n.sets, prev: p.sets },
        { label: 'Volume', now: n.vol, prev: p.vol, unit: 'kg', fmt: (x) => Math.round(x).toLocaleString() },
        { label: 'PRs (fastest laps)', now: n.prs, prev: p.prs },
      ] },
      { title: 'Fuel', rows: [
        { label: 'Avg calories', now: n.kcal, prev: p.kcal, unit: 'kcal', target: t.kcal, better: 'none' },
        { label: 'Avg protein', now: n.protein, prev: p.protein, unit: 'g', target: t.protein },
        { label: 'Days logged', now: n.days, prev: p.days, unit: '/ 7' },
      ] },
      { title: 'Sport', rows: [
        { label: 'Active minutes', now: n.actMin, prev: p.actMin, unit: 'min' },
        { label: 'Run', now: n.runKm, prev: p.runKm, unit: 'km', fmt: one },
        { label: 'Walk', now: n.walkKm, prev: p.walkKm, unit: 'km', fmt: one },
        { label: 'Badminton sessions', now: n.badminton, prev: p.badminton },
        { label: 'Burned', now: n.burned, prev: p.burned, unit: 'kcal' },
      ] },
      { title: 'DSA', rows: [
        { label: 'Problems solved', now: n.solved, prev: p.solved },
        { label: 'Championship points', now: n.points, prev: p.points },
        { label: 'Tests taken', now: n.tests, prev: p.tests },
        { label: 'Test points', now: n.testPts, prev: p.testPts },
      ] },
      { title: 'Habits & routines', rows: [
        { label: 'Habit completion', now: n.habitPct, prev: p.habitPct, unit: '%' },
        { label: 'Routines done', now: n.routinePct, prev: p.routinePct, unit: '%' },
      ] },
      { title: 'Health', rows: [
        { label: 'Avg sleep', now: n.sleep, prev: p.sleep, unit: 'h', fmt: one },
        { label: 'Avg water', now: n.water, prev: p.water, unit: 'glasses', fmt: one },
        { label: 'Weight', now: n.weight, prev: p.weight, unit: 'kg', fmt: one, better: 'none' },
      ] },
    ];
    return rows;
  }, [workouts, sets, food, acts, health, habits, routines, tests, dsa, hlogs, rlogs, start, end, pStart, pEnd, t.kcal, t.protein]);

  const label = `${parseDate(start).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} – ${parseDate(end).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`;
  return (
    <Page>
      <PageHeader
        eyebrow="Race report"
        title={
          <span className="flex items-center gap-1">
            <IconButton label="Previous week" onClick={() => setOffset(offset + 1)}>
              <ChevronLeft className="size-5" />
            </IconButton>
            {offset === 0 ? 'This week' : offset === 1 ? 'Last week' : label}
            <IconButton label="Next week" onClick={() => setOffset(Math.max(0, offset - 1))} disabled={offset === 0}>
              <ChevronRight className="size-5" />
            </IconButton>
          </span>
        }
      />
      <Rise className="-mt-4 mb-5 font-mono text-sm text-ink-3">{label} · compared with the week before</Rise>
      <Rise className="mb-4">
        <Debrief week={start} />
      </Rise>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {sections.map((s, i) => (
          <Section key={s.title} title={s.title} rows={s.rows} i={i} />
        ))}
      </div>
    </Page>
  );
}
