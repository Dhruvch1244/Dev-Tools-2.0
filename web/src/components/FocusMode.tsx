import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { AnimatePresence, motion } from 'motion/react';
import { Coffee, Crosshair, Flag, Play, Plus, X } from 'lucide-react';
import { useList, useResource } from '../lib/api';
import { addDays, haptic, today } from '../lib/format';
import type { FocusRow } from '../lib/types';
import { AWAY_ASK_SEC, LENGTHS, activeStint, clock, focusWeek, leftSec, stintMinutes } from '../core/focus';
import { Button, Card, cx } from './ui';

export function useFocus() {
  const t = today();
  const { data: rows = [] } = useList<FocusRow>('focus', { from: addDays(t, -7) });
  const api = useResource<FocusRow>('focus');
  const [now, setNow] = useState(Date.now());
  const active = activeStint(rows, now);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active]);
  const start = (planned: number, ref: string | null, label: string) => {
    const at = new Date();
    return api.create({ date: t, started_at: at.toISOString(), planned, minutes: 0, ref, label, distractions: 0, away_sec: 0, ended_at: null });
  };
  const end = (s: FocusRow) => api.update({ id: s.id, ended_at: new Date().toISOString(), minutes: stintMinutes(s, Date.now()) });
  return { rows, active, now, start, end, update: api.update, stats: focusWeek(rows, t) };
}

/** A short beep-beep from the speakers — the stint's chequered flag. */
function chime() {
  try {
    const ctx = new AudioContext();
    [0, 0.22, 0.44].forEach((t, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = i === 2 ? 1320 : 880;
      g.gain.setValueAtTime(0.18, ctx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.18);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + t);
      o.stop(ctx.currentTime + t + 0.2);
    });
  } catch {
    // No audio (autoplay policy): the visual flag still shows.
  }
}

/**
 * The running stint, floating over every page on the laptop: countdown, the problem, and an honest
 * check when you come back from another tab — "LeetCode, or wandered?". Ends itself at zero.
 */
export function FocusPill() {
  const { active, now, end, update } = useFocus();
  const [away, setAway] = useState<number | null>(null);
  const [finished, setFinished] = useState<FocusRow | null>(null);
  const hiddenAt = useRef<number | null>(null);
  const left = active ? leftSec(active, now) : 0;

  // Leaving the tab: remember when; coming back after a while: ask what happened.
  useEffect(() => {
    if (!active) return;
    const on = () => {
      if (document.hidden) hiddenAt.current = Date.now();
      else if (hiddenAt.current) {
        const s = Math.round((Date.now() - hiddenAt.current) / 1000);
        hiddenAt.current = null;
        if (s >= AWAY_ASK_SEC) setAway(s);
      }
    };
    document.addEventListener('visibilitychange', on);
    return () => document.removeEventListener('visibilitychange', on);
  }, [active]);

  useEffect(() => {
    if (active && left <= 0) {
      chime();
      navigator.vibrate?.([60, 40, 60]);
      setFinished({ ...active, minutes: stintMinutes(active, Date.now()) });
      end(active);
      if (document.hidden && 'Notification' in window && Notification.permission === 'granted') new Notification('🏁 Stint done', { body: `${active.planned} min on ${active.label ?? 'DSA'}. Take 5.` });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.id, left <= 0]);

  return (
    <AnimatePresence>
      {active && (
        <motion.div key="pill" initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }} className="fixed bottom-5 left-1/2 z-40 w-[min(440px,calc(100vw-2rem))] -translate-x-1/2 max-lg:hidden">
          <div className="overflow-hidden rounded-xl border border-accent bg-surface-solid shadow-2xl">
            <div className="h-1 bg-surface-2">
              <div className="h-full bg-accent transition-[width] duration-1000 ease-linear" style={{ width: `${Math.min(100, (1 - left / (active.planned * 60)) * 100)}%` }} />
            </div>
            {away != null ? (
              <div className="flex items-center gap-2 px-3 py-2.5">
                <span className="flex-1 text-sm">
                  Away <b className="font-mono">{clock(away)}</b> — working or wandered?
                </span>
                <Button size="sm" variant="soft" onClick={() => setAway(null)}>
                  Working
                </Button>
                <Button size="sm" onClick={() => (update({ id: active.id, distractions: active.distractions + 1, away_sec: active.away_sec + away }), setAway(null))}>
                  Wandered
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-3 px-3 py-2">
                <Crosshair className="size-4 shrink-0 text-accent" />
                <span className="font-display text-2xl font-black italic tabular-nums">{clock(left)}</span>
                <span className="min-w-0 flex-1 truncate text-sm font-semibold">{active.ref ? <Link to={`/dsa/p/${active.ref}`}>{active.label}</Link> : active.label}</span>
                <button title="I got distracted" onClick={() => (haptic(10), update({ id: active.id, distractions: active.distractions + 1 }))} className="rounded-md bg-surface-2 px-2 py-1 font-mono text-tiny font-bold">
                  😵 {active.distractions}
                </button>
                <button title="5 more minutes" onClick={() => update({ id: active.id, planned: active.planned + 5 })} className="grid size-7 place-items-center rounded-md bg-surface-2">
                  <Plus className="size-3.5" />
                </button>
                <button title="End stint" onClick={() => (setFinished({ ...active, minutes: stintMinutes(active, Date.now()) }), end(active))} className="grid size-7 place-items-center rounded-md bg-surface-2">
                  <X className="size-3.5" />
                </button>
              </div>
            )}
          </div>
        </motion.div>
      )}
      {finished && !active && (
        <motion.div key="done" initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }} className="fixed bottom-5 left-1/2 z-40 w-[min(440px,calc(100vw-2rem))] -translate-x-1/2 max-lg:hidden">
          <div className="checker-band flex items-center gap-3 rounded-xl border border-line px-4 py-3 shadow-2xl">
            <Flag className="size-5 shrink-0 text-accent" />
            <span className="flex-1 text-sm">
              <b>{Math.round(finished.minutes)} min</b> focused on {finished.label}
              {finished.distractions ? ` · ${finished.distractions} wander${finished.distractions > 1 ? 's' : ''}` : ' · clean stint'}. Stand up, water, 5 min.
            </span>
            <button onClick={() => setFinished(null)} aria-label="Dismiss" className="text-ink-3">
              <X className="size-4" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Start a stint on one of today's problems (or free practice), and the week's focus at a glance. */
export function FocusCard({ options }: { options: { ref: string | null; label: string }[] }) {
  const { active, start, stats } = useFocus();
  const [len, setLen] = useState(45);
  const [pick, setPick] = useState(0);
  const choice = options[pick] ?? options[0];
  const max = Math.max(60, ...stats.days.map((d) => d.minutes));
  return (
    <Card>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-micro font-black uppercase tracking-[0.25em] text-accent">Focus mode</p>
          <h2 className="font-display text-xl font-black uppercase italic leading-tight">{active ? 'Stint running' : 'Start a stint'}</h2>
        </div>
        <div className="text-right">
          <p className="font-display text-2xl font-black italic tabular-nums">{stats.today}<span className="text-sm text-ink-3"> min</span></p>
          <p className="text-tiny text-ink-3">today · {Math.round(stats.week / 6) / 10} h this week</p>
        </div>
      </div>
      <div className="mb-3 flex h-12 items-end gap-1.5" aria-label="Focus minutes, last 7 days">
        {stats.days.map((d, i) => (
          <div key={d.date} className="flex flex-1 flex-col items-center gap-1" title={`${d.date}: ${d.minutes} min`}>
            <div className={cx('w-full rounded-t-sm', i === 6 ? 'bg-accent' : 'bg-ink-3/40')} style={{ height: `${Math.max(2, (d.minutes / max) * 36)}px` }} />
            <span className="text-micro text-ink-3">{'SMTWTFS'[new Date(`${d.date}T12:00`).getDay()]}</span>
          </div>
        ))}
      </div>
      {!active && (
        <>
          <div className="mb-2 flex flex-wrap gap-1.5">
            {options.map((o, i) => (
              <button key={o.label} onClick={() => setPick(i)} className={cx('max-w-full truncate rounded-md px-2.5 py-1.5 text-tiny font-bold', i === pick ? 'bg-accent text-white' : 'bg-surface-2 text-ink-2')}>
                {o.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            {LENGTHS.map((m) => (
              <button key={m} onClick={() => setLen(m)} className={cx('h-10 flex-1 rounded-md font-mono text-sm font-bold', m === len ? 'bg-ink text-bg' : 'bg-surface-2 text-ink-2')}>
                {m}′
              </button>
            ))}
            <Button className="h-10 flex-[1.4]" onClick={() => (haptic(15), void start(len, choice.ref, choice.label), 'Notification' in window && Notification.permission === 'default' && void Notification.requestPermission())}>
              <Play className="size-4" /> Go
            </Button>
          </div>
          <p className="mt-2 flex items-center gap-1.5 text-tiny text-ink-3">
            <Coffee className="size-3.5" /> Phone in another room. Leaving this tab for 90 s+ asks if you were on LeetCode or wandered.
            {stats.stints > 0 && ` ${stats.wanderRate.toFixed(1)} wanders/hour this week.`}
          </p>
        </>
      )}
    </Card>
  );
}
