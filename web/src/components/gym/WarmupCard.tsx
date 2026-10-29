import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ChevronDown, Play, Timer } from 'lucide-react';
import { api } from '../../lib/api';
import { haptic, today } from '../../lib/format';
import { minutesOf, type Phase } from '../../core/warmup';
import { Card, cx } from '../ui';

const clock = (s: number) => (s >= 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : `${s}s`);

/**
 * A warm-up or cool-down checklist. Tick drills as you go (saved per day, so the phone and laptop
 * agree); drills with a hold start a countdown on tap and tick themselves when it ends.
 */
export function WarmupCard({ kind, title, phases, open: startOpen = true, accent = 'var(--accent)' }: { kind: 'warm' | 'cool' | 'mobility'; title: string; phases: Phase[]; open?: boolean; accent?: string }) {
  const t = today();
  const qc = useQueryClient();
  const { data: checks = [] } = useQuery({ queryKey: ['checks', 'warm', t], queryFn: () => api<{ ref: string; date: string }[]>(`/checks?kind=warm&from=${t}`) });
  const toggle = useMutation({
    mutationFn: (ref: string) => api('/checks/toggle', { method: 'POST', body: JSON.stringify({ kind: 'warm', ref, date: t }) }),
    onMutate: (ref) => qc.setQueryData<{ ref: string; date: string }[]>(['checks', 'warm', t], (old = []) => (old.some((c) => c.ref === ref) ? old.filter((c) => c.ref !== ref) : [...old, { ref, date: t }])),
    onSettled: () => qc.invalidateQueries({ queryKey: ['checks', 'warm', t] }),
  });
  const ref = (p: Phase, i: number) => `${kind}:${p.id}:${i}`;
  const done = (r: string) => checks.some((c) => c.ref === r && c.date === t);
  const all = phases.flatMap((p) => p.drills.map((_, i) => ref(p, i)));
  const n = all.filter(done).length;
  const [open, setOpen] = useState(startOpen && n < all.length);
  const [timer, setTimer] = useState<{ ref: string; left: number } | null>(null);

  useEffect(() => {
    if (!timer) return;
    if (timer.left <= 0) {
      navigator.vibrate?.([80, 60, 80]);
      if (!done(timer.ref)) toggle.mutate(timer.ref);
      setTimer(null);
      return;
    }
    const id = setTimeout(() => setTimer({ ...timer, left: timer.left - 1 }), 1000);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timer]);

  return (
    <Card className="!p-0 overflow-hidden">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center gap-3 px-4 py-3 text-left">
        <span className="slant grid h-9 w-12 shrink-0 place-items-center text-mini font-black italic text-black" style={{ background: n === all.length ? 'var(--green)' : accent }}>
          {n === all.length ? <Check className="size-4" /> : `${n}/${all.length}`}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-display text-lg font-black uppercase italic leading-tight">{title}</span>
          <span className="block text-tiny text-ink-3">
            ~{minutesOf(phases)} min · {phases.map((p) => p.title).join(' → ')}
          </span>
        </span>
        <ChevronDown className={cx('size-4 shrink-0 text-ink-3 transition', open && 'rotate-180')} />
      </button>
      <div className="h-1 bg-surface-2">
        <motion.div className="h-full" style={{ background: n === all.length ? 'var(--green)' : accent }} initial={false} animate={{ width: `${all.length ? (n / all.length) * 100 : 0}%` }} />
      </div>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden">
            <div className="space-y-4 px-4 py-4">
              {phases.map((p) => (
                <div key={p.id}>
                  <p className="text-micro font-black uppercase tracking-[0.2em]" style={{ color: accent }}>
                    {p.title} <span className="font-normal normal-case tracking-normal text-ink-3">· {p.why}</span>
                  </p>
                  <ul className="mt-1.5 space-y-1.5">
                    {p.drills.map((d, i) => {
                      const r = ref(p, i);
                      const on = done(r);
                      const running = timer?.ref === r;
                      return (
                        <li key={r} className={cx('flex items-center gap-3 rounded-md bg-bg px-3 py-2', on && 'opacity-60')}>
                          <button onClick={() => (haptic(10), toggle.mutate(r))} aria-pressed={on} aria-label={`Done: ${d.name}`} className={cx('grid size-7 shrink-0 place-items-center rounded-md border-2', on ? 'border-green bg-green text-black' : 'border-line-strong')}>
                            {on && <Check className="size-4" />}
                          </button>
                          <div className="min-w-0 flex-1">
                            <p className={cx('text-sm font-bold', on && 'line-through')}>{d.name}</p>
                            <p className="text-tiny text-ink-3">
                              <span className="font-mono font-bold text-ink-2">{d.dose}</span> · {d.cue}
                            </p>
                          </div>
                          {d.secs && !on && (
                            <button onClick={() => setTimer(running ? null : { ref: r, left: d.secs! })} className={cx('flex h-8 shrink-0 items-center gap-1 rounded-md px-2 font-mono text-tiny font-bold', running ? 'bg-accent text-white' : 'bg-surface-2 text-ink-2')}>
                              <Timer className="size-3.5" /> {clock(running ? timer!.left : d.secs)}
                            </button>
                          )}
                          <a href={`https://www.youtube.com/results?search_query=${encodeURIComponent(`${d.name} how to`)}`} target="_blank" rel="noreferrer" aria-label={`Video: ${d.name}`} className="grid size-8 shrink-0 place-items-center rounded-md text-ink-3">
                            <Play className="size-3.5" />
                          </a>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}
