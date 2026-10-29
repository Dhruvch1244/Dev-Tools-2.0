import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowDownRight, ArrowUpRight, Radio, Sparkles, TriangleAlert } from 'lucide-react';
import { api } from '../../lib/api';
import { today } from '../../lib/format';
import { dayTypeOn } from '../../core/gym';
import { heat, weekReport, type MuscleStatus, type Region } from '../../core/gymStats';
import type { Debrief } from '../../core/gymAi';
import type { GymSet, Workout } from '../../lib/types';
import { BodyMap } from '../BodyMap';
import { Telemetry } from '../f1';
import { AnimatedNumber, Button, Card, SectionTitle, cx } from '../ui';
import { useToast } from '../toast';

const TONE = { low: 'var(--yellow)', ok: 'var(--green)', high: 'var(--accent)' } as const;

/** One muscle: sets as a bar over the target zone (shaded), coloured by low / in range / too much. */
function MuscleBar({ m, i }: { m: MuscleStatus; i: number }) {
  const scale = Math.max(m.max * 1.25, m.sets, 1);
  return (
    <li className="grid grid-cols-[5.5rem_minmax(0,1fr)_3.2rem] items-center gap-2 text-sm">
      <span className="truncate text-ink-2">{m.muscle}</span>
      <span className="relative h-3 overflow-hidden rounded-sm bg-surface-2">
        <span className="absolute inset-y-0 bg-green/15" style={{ left: `${(m.min / scale) * 100}%`, width: `${((m.max - m.min) / scale) * 100}%` }} />
        <motion.span className="absolute inset-y-0 left-0 rounded-sm" style={{ background: TONE[m.status] }} initial={{ width: 0 }} animate={{ width: `${(m.sets / scale) * 100}%` }} transition={{ type: 'spring', stiffness: 70, damping: 16, delay: 0.1 + i * 0.03 }} />
      </span>
      <span className="text-right font-mono text-tiny">
        <span className="font-bold" style={{ color: TONE[m.status] }}>
          {m.sets}
        </span>
        <span className="text-ink-3">/{m.min}</span>
      </span>
    </li>
  );
}

/** The last 7 days: body heat, sets per muscle vs productive ranges, balance, flags, and a coach debrief. */
export function WeekCard({ sets, workouts, shift }: { sets: GymSet[]; workouts: Workout[]; shift: number }) {
  const toast = useToast();
  const r = useMemo(() => weekReport(today(), sets, workouts, (d) => dayTypeOn(d, shift)), [sets, workouts, shift]);
  const [debrief, setDebrief] = useState<Debrief | null>(null);
  const [busy, setBusy] = useState(false);
  // Heat relative to each muscle's own target ceiling, so 12 chest sets and 12 calf sets read alike.
  const h = heat(Object.fromEntries(r.muscles.map((m) => [m.muscle, m.max ? m.sets / m.max : 0])) as Record<Region, number>, 1);
  const muscles = [...r.muscles].filter((m) => m.min > 0 || m.sets > 0).sort((a, b) => a.sets / Math.max(1, a.min) - b.sets / Math.max(1, b.min));

  const ask = async (fresh = false) => {
    setBusy(true);
    try {
      const j = await api<{ debrief: Debrief }>('/gym/debrief', { method: 'POST', body: JSON.stringify({ fresh }) });
      setDebrief(j.debrief);
    } catch (e) {
      toast({ message: `Coach unavailable: ${(e as Error).message}` });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <SectionTitle action={<span className="text-tiny text-ink-3">last 7 days</span>}>This week</SectionTitle>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Telemetry label="Sessions" value={<><AnimatedNumber value={r.sessions} /><span className="text-ink-3">/{r.planned}</span></>} accent="var(--green)" />
        <Telemetry label="Hard sets" value={<AnimatedNumber value={r.sets} />} />
        <Telemetry
          label="Volume"
          value={<AnimatedNumber value={Math.round(r.volume / 100) / 10} />}
          unit="t"
          accent="var(--sky)"
        />
        <Telemetry label="PRs" value={<AnimatedNumber value={r.prs.length} />} accent="var(--purple)" />
      </div>
      {r.volumeChange != null && (
        <p className={cx('mt-2 flex items-center gap-1 text-tiny font-bold', r.volumeChange >= 0 ? 'text-green' : 'text-amber')}>
          {r.volumeChange >= 0 ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />} {Math.abs(r.volumeChange)}% volume vs the week before
          {r.pushPull != null && <span className="ml-auto font-mono text-ink-3">push:pull {r.pushPull}</span>}
        </p>
      )}

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-[14rem_minmax(0,1fr)]">
        <div>
          <BodyMap heat={h} className="h-56" />
          <p className="mt-1 flex justify-center gap-3 text-micro font-bold uppercase text-ink-3">
            <span className="flex items-center gap-1"><i className="size-2 rounded-sm bg-surface-2" /> none</span>
            <span className="flex items-center gap-1"><i className="size-2 rounded-sm" style={{ background: 'color-mix(in oklab, var(--accent) 55%, var(--surface-2))' }} /> some</span>
            <span className="flex items-center gap-1"><i className="size-2 rounded-sm bg-accent" /> at cap</span>
          </p>
        </div>
        <div className="min-w-0">
          <p className="mb-2 flex justify-between text-micro font-black uppercase tracking-[0.2em] text-ink-3">
            <span>Sets per muscle</span>
            <span className="flex items-center gap-1 normal-case tracking-normal"><i className="h-2 w-4 rounded-sm bg-green/25" /> target range</span>
          </p>
          <ul className="space-y-1.5">
            {muscles.map((m, i) => (
              <MuscleBar key={m.muscle} m={m} i={i} />
            ))}
          </ul>
        </div>
      </div>

      {r.flags.length > 0 && (
        <ul className="mt-4 space-y-1.5">
          {r.flags.map((f, i) => (
            <motion.li key={f} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 + i * 0.06 }} className="flex gap-2 rounded-md bg-bg px-3 py-2 text-sm text-ink-2">
              <TriangleAlert className={cx('mt-0.5 size-4 shrink-0', f.includes('PR') ? 'text-purple' : f.startsWith('Too much') ? 'text-accent' : 'text-amber')} /> {f}
            </motion.li>
          ))}
        </ul>
      )}

      <AnimatePresence mode="wait">
        {debrief ? (
          <motion.div key="d" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-4 rounded-xl border border-line bg-bg p-4">
            <p className="mb-1 flex items-center gap-1.5 text-micro font-black uppercase tracking-[0.25em] text-accent">
              <Radio className="size-3" /> Race engineer
            </p>
            <p className="text-lg font-bold leading-snug">{debrief.headline}</p>
            {(
              [
                ['Going well', debrief.good, 'text-green'],
                ['Improve', debrief.improve, 'text-amber'],
                ['Too much', debrief.too_much, 'text-accent'],
                ['Next week', debrief.next_week, 'text-sky'],
              ] as const
            ).map(([k, xs, tone]) =>
              xs.length ? (
                <div key={k} className="mt-3">
                  <p className={cx('text-micro font-black uppercase tracking-[0.2em]', tone)}>{k}</p>
                  <ul className="mt-1 space-y-1 text-sm text-ink-2">
                    {xs.map((x) => (
                      <li key={x}>• {x}</li>
                    ))}
                  </ul>
                </div>
              ) : null,
            )}
            <button onClick={() => void ask(true)} disabled={busy} className="mt-3 text-mini font-bold uppercase text-ink-3">
              {busy ? 'Rewriting…' : 'Refresh'}
            </button>
          </motion.div>
        ) : (
          <motion.div key="b" className="mt-4">
            <Button variant="soft" className="w-full" disabled={busy} onClick={() => void ask()}>
              <Sparkles className="size-4" /> {busy ? 'Reading the telemetry…' : 'Coach debrief — what to improve, what’s too much'}
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}
