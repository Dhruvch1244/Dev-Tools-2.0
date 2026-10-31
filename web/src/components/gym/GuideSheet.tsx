import { useQuery } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { CircleAlert, ListChecks, Play, Settings2, Wind, Zap } from 'lucide-react';
import { api } from '../../lib/api';
import { relativeDay } from '../../lib/format';
import { e1rm, setScore } from '../../core/gym';
import { videoLinks, type Guide } from '../../core/gymAi';
import type { Region } from '../../core/gymStats';
import type { GymSet } from '../../lib/types';
import { BodyMap } from '../BodyMap';
import { Sheet } from '../ui';
import { ExerciseDemo } from './ExerciseDemo';

function Block({ icon: Icon, title, items, tone = 'text-ink-2', ordered }: { icon: typeof Zap; title: string; items: string[]; tone?: string; ordered?: boolean }) {
  if (!items.length) return null;
  return (
    <section>
      <p className="mb-1.5 flex items-center gap-1.5 text-micro font-black uppercase tracking-[0.2em] text-ink-3">
        <Icon className="size-3.5" /> {title}
      </p>
      <ul className="space-y-1">
        {items.map((x, i) => (
          <motion.li key={x} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.05 * i }} className={`flex gap-2 text-sm ${tone}`}>
            <span className="w-4 shrink-0 font-mono text-ink-3">{ordered ? i + 1 : '•'}</span>
            <span>{x}</span>
          </motion.li>
        ))}
      </ul>
    </section>
  );
}

/** How to do one exercise: muscles on the body map, setup, steps, cues, mistakes, videos, your numbers. */
export function GuideSheet({ name, sets, onClose, onPick }: { name: string | null; sets: GymSet[]; onClose: () => void; onPick?: (name: string) => void }) {
  const { data: g, isLoading, error } = useQuery({ queryKey: ['gym-guide', name], queryFn: () => api<Guide>(`/gym/guide/${encodeURIComponent(name!)}`), enabled: !!name, staleTime: Infinity, retry: false });
  const mine = sets.filter((s) => s.exercise === name);
  const best = mine.reduce<GymSet | null>((b, s) => (!b || setScore(s.weight, s.reps) > setScore(b.weight, b.reps) ? s : b), null);
  const lastDay = mine.at(-1)?.date;
  const heat: Partial<Record<Region, number>> = { ...Object.fromEntries((g?.secondary ?? []).map((m) => [m, 0.45])), ...Object.fromEntries((g?.primary ?? []).map((m) => [m, 1])) };
  return (
    <Sheet open={!!name} onClose={onClose} title={name ?? ''}>
      {name && <ExerciseDemo name={name} className="mb-5" />}
      {isLoading && (
        <div className="space-y-2 py-2">
          <p className="text-sm text-ink-3">Pulling the technique notes…</p>
          {[80, 95, 70, 88].map((w, i) => (
            <motion.div key={i} className="h-3 rounded bg-surface-2" style={{ width: `${w}%` }} animate={{ opacity: [0.35, 0.8, 0.35] }} transition={{ duration: 1.3, repeat: Infinity, delay: i * 0.1 }} />
          ))}
        </div>
      )}
      {error && <p className="text-sm text-accent">Couldn’t load the guide: {(error as Error).message}</p>}
      {g && (
        <div className="space-y-5">
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] items-center gap-3">
            <BodyMap heat={heat} pulse className="h-48" />
            <div className="min-w-0 space-y-2 text-sm">
              {g.primary.length > 0 && (
                <p>
                  <span className="text-micro font-black uppercase tracking-[0.2em] text-accent">Primary</span>
                  <br />
                  {g.primary.join(', ')}
                </p>
              )}
              {g.secondary.length > 0 && (
                <p>
                  <span className="text-micro font-black uppercase tracking-[0.2em] text-ink-3">Also works</span>
                  <br />
                  {g.secondary.join(', ')}
                </p>
              )}
              {best && (
                <p className="rounded-md bg-bg px-2.5 py-2 font-mono text-tiny text-ink-2">
                  {best.weight > 0 ? `Best ${best.weight}×${best.reps} (~${Math.round(e1rm(best.weight, best.reps))} 1RM)` : `Best ${best.reps} reps at bodyweight`}
                  {lastDay && <><br />Last: {relativeDay(lastDay)}</>}
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {videoLinks(g.name).map((v, i) => (
              <a key={v.url} href={v.url} target="_blank" rel="noreferrer" className={`flex h-11 items-center justify-center gap-2 rounded-lg text-mini font-bold uppercase ${i === 0 ? 'bg-accent text-white' : 'bg-surface-2 text-ink-2'}`}>
                <Play className="size-4 fill-current" /> {v.label}
              </a>
            ))}
          </div>

          <Block icon={Settings2} title="Set up" items={g.setup} />
          <Block icon={ListChecks} title="The rep" items={g.steps} ordered />
          <Block icon={Zap} title="Cues" items={g.cues} tone="text-ink" />
          <Block icon={CircleAlert} title="Common mistakes" items={g.mistakes} tone="text-accent-2" />
          {g.breathing && (
            <p className="flex gap-2 rounded-lg bg-bg p-3 text-sm text-ink-2">
              <Wind className="mt-0.5 size-4 shrink-0 text-sky" /> {g.breathing}
            </p>
          )}
          {(g.easier || g.harder) && (
            <div className="grid grid-cols-2 gap-2 text-sm">
              {[
                ['Easier', g.easier],
                ['Harder', g.harder],
              ].map(([k, v]) =>
                v ? (
                  <button key={k} disabled={!onPick} onClick={() => onPick?.(v)} className="rounded-lg border border-line bg-bg p-2.5 text-left">
                    <span className="block text-micro font-black uppercase tracking-[0.2em] text-ink-3">{k}</span>
                    {v}
                  </button>
                ) : (
                  <span key={k} />
                ),
              )}
            </div>
          )}
        </div>
      )}
    </Sheet>
  );
}
