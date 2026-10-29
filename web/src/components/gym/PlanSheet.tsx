import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { BookOpen, Check, Flame, Sparkles, Timer } from 'lucide-react';
import { api, useSettings } from '../../lib/api';
import { haptic, today } from '../../lib/format';
import { DAY_META, type DayType } from '../../core/gym';
import { plannedHeat } from '../../core/gymStats';
import type { GymPlan } from '../../core/gymAi';
import { BodyMap } from '../BodyMap';
import { Mic } from '../Mic';
import { Button, Sheet, cx } from '../ui';
import { useToast } from '../toast';

export type SavedPlan = { date: string; day_type: DayType; plan: GymPlan };
const LINES = ['Reading your last sessions…', 'Checking this week’s volume…', 'Picking weights…', 'Ordering the session…'];

/** Ask the coach for today's session (time, niggles, mood) → review it on the body map → use it. */
export function PlanSheet({ open, onClose, dayType, onGuide }: { open: boolean; onClose: () => void; dayType: DayType; onGuide: (n: string) => void }) {
  const { settings, save } = useSettings();
  const toast = useToast();
  const saved = settings.gymPlan as SavedPlan | undefined;
  const [minutes, setMinutes] = useState(60);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [line, setLine] = useState(0);
  const [plan, setPlan] = useState<GymPlan | null>(saved?.date === today() && saved.day_type === dayType ? saved.plan : null);

  const go = async () => {
    setBusy(true);
    const id = setInterval(() => setLine((l) => (l + 1) % LINES.length), 1800);
    try {
      const r = await api<{ day_type: DayType; plan: GymPlan }>('/gym/plan', { method: 'POST', body: JSON.stringify({ minutes, note, day_type: dayType }) });
      setPlan(r.plan);
      haptic(15);
    } catch (e) {
      toast({ message: `Coach unavailable: ${(e as Error).message}` });
    } finally {
      clearInterval(id);
      setBusy(false);
    }
  };
  const use = () => {
    if (!plan) return;
    save({ gymPlan: { date: today(), day_type: dayType, plan } satisfies SavedPlan });
    toast({ message: 'Plan locked in — start the session when ready' });
    onClose();
  };

  return (
    <Sheet open={open} onClose={onClose} title={`Plan my ${DAY_META[dayType].label} session`}>
      {!plan || busy ? (
        <div className="space-y-4">
          <div>
            <p className="mb-1.5 flex items-center gap-1.5 text-micro font-black uppercase tracking-[0.2em] text-ink-3">
              <Timer className="size-3.5" /> Time I have
            </p>
            <div className="grid grid-cols-5 gap-1.5">
              {[30, 45, 60, 75, 90].map((m) => (
                <button key={m} onClick={() => setMinutes(m)} className={cx('h-10 rounded-md font-mono text-sm font-bold', minutes === m ? 'bg-accent text-white' : 'bg-surface-2 text-ink-2')}>
                  {m}′
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-1.5 text-micro font-black uppercase tracking-[0.2em] text-ink-3">Anything the coach should know?</p>
            <div className="flex items-end gap-2">
              <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="“lower back tight”, “bench is taken”, “feeling strong, push it”, “only dumbbells”" className="field min-h-16 flex-1 resize-none text-base" />
              <Mic value={note} onChange={setNote} />
            </div>
          </div>
          <Button className="h-12 w-full" disabled={busy} onClick={() => void go()}>
            {busy ? (
              <motion.span key={line} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
                {LINES[line]}
              </motion.span>
            ) : (
              <>
                <Sparkles className="size-4" /> Build my session
              </>
            )}
          </Button>
          <p className="text-tiny text-ink-3">Uses your logged sets (to pick weights), this week’s muscle volume, and your template — through Claude on your laptop.</p>
        </div>
      ) : (
        <AnimatePresence>
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
            <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] items-center gap-3">
              <BodyMap heat={plannedHeat(plan.exercises)} pulse className="h-44" />
              <div className="min-w-0">
                <p className="text-xl font-black italic uppercase leading-tight">{plan.title}</p>
                <p className="mt-1 text-sm text-ink-3">{plan.exercises.reduce((a, e) => a + e.sets, 0)} sets · {plan.exercises.length} exercises</p>
                {plan.notes && <p className="mt-2 text-sm text-ink-2">{plan.notes}</p>}
              </div>
            </div>
            {plan.warmup.length > 0 && (
              <div className="rounded-lg bg-bg p-3">
                <p className="mb-1 flex items-center gap-1.5 text-micro font-black uppercase tracking-[0.2em] text-amber">
                  <Flame className="size-3.5" /> Warm-up
                </p>
                <ul className="space-y-0.5 text-sm text-ink-2">
                  {plan.warmup.map((w) => (
                    <li key={w}>• {w}</li>
                  ))}
                </ul>
              </div>
            )}
            <ol className="space-y-2">
              {plan.exercises.map((e, i) => (
                <motion.li key={e.name} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.06 }} className="rounded-lg border border-line bg-bg p-3">
                  <div className="flex items-start gap-3">
                    <span className="font-mono text-sm font-bold text-ink-3">{String(i + 1).padStart(2, '0')}</span>
                    <div className="min-w-0 flex-1">
                      <p className="font-bold leading-snug">{e.name}</p>
                      <p className="font-mono text-tiny text-ink-2">
                        {e.sets} × {e.reps}
                        {e.weight ? ` @ ${e.weight} kg` : ''} · rest {e.rest_s >= 120 ? `${Math.round(e.rest_s / 60 * 10) / 10} min` : `${e.rest_s}s`}
                      </p>
                      {e.why && <p className="mt-1 text-tiny text-ink-3">{e.why}</p>}
                    </div>
                    <button onClick={() => onGuide(e.name)} aria-label={`${e.name} form guide`} className="grid size-9 shrink-0 place-items-center rounded-md bg-surface-2 text-ink-2">
                      <BookOpen className="size-4" />
                    </button>
                  </div>
                </motion.li>
              ))}
            </ol>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="ghost" onClick={() => setPlan(null)}>
                <Sparkles className="size-4" /> Redo
              </Button>
              <Button onClick={use}>
                <Check className="size-4" /> Use this plan
              </Button>
            </div>
          </motion.div>
        </AnimatePresence>
      )}
    </Sheet>
  );
}
