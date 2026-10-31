import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { BookOpen, Check, Plus, Sparkles, Trash2, Wand2, X } from 'lucide-react';
import { api, useResource } from '../../lib/api';
import { haptic, parseDate, today } from '../../lib/format';
import { DAY_META, volume, type DayType, type Exercise } from '../../core/gym';
import { DAY_MUSCLES } from '../../core/exercises';
import { muscleSets, heat, plannedHeat } from '../../core/gymStats';
import type { Parsed } from '../../core/gymAi';
import type { GymSet, Workout } from '../../lib/types';
import { BodyMap } from '../BodyMap';
import { ExercisePicker } from '../ExercisePicker';
import { Mic } from '../Mic';
import { Button, Sheet, cx } from '../ui';
import { useToast } from '../toast';

const TYPES: Exclude<DayType, 'rest'>[] = ['push', 'pull', 'legs', 'upper', 'lower'];
const kg = (n: number) => (n > 0 ? `${+n.toFixed(1)}` : 'BW');

/** Quick add of one set to an exercise in a past/edited session. */
function AddSet({ onAdd }: { onAdd: (w: number, r: number) => void }) {
  const [w, setW] = useState('');
  const [r, setR] = useState('');
  return (
    <form onSubmit={(e) => (e.preventDefault(), Number(r) > 0 && (onAdd(Number(w) || 0, Number(r)), setR('')))} className="mt-2 flex items-center gap-1.5">
      <input inputMode="decimal" value={w} onChange={(e) => setW(e.target.value.replace(/[^\d.]/g, ''))} placeholder="kg" aria-label="Weight" className="field h-9 w-16 !px-2 text-center font-mono" />
      <span className="text-ink-3">×</span>
      <input inputMode="numeric" value={r} onChange={(e) => setR(e.target.value.replace(/\D/g, ''))} placeholder="reps" aria-label="Reps" className="field h-9 w-16 !px-2 text-center font-mono" />
      <Button size="sm" type="submit" disabled={!r} className="!h-9">
        <Plus className="size-4" /> Set
      </Button>
    </form>
  );
}

/**
 * One day of the gym calendar: what was planned, what you logged (edit or delete any of it), and —
 * for a day with nothing — log it after the fact, by picking exercises or just describing it.
 */
export function DaySheet({ date, planned, workouts, sets, template, onClose, onGuide }: { date: string | null; planned: DayType; workouts: Workout[]; sets: GymSet[]; template: (d: DayType) => Exercise[]; onClose: () => void; onGuide: (n: string) => void }) {
  const wApi = useResource<Workout>('workouts');
  const sApi = useResource<GymSet>('sets');
  const toast = useToast();
  const [picking, setPicking] = useState<string | null>(null); // workout id to add an exercise to
  const [extra, setExtra] = useState<Record<string, string[]>>({}); // exercises added but with no sets yet
  const [backfill, setBackfill] = useState<DayType | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [parsed, setParsed] = useState<Parsed | null>(null);

  if (!date) return <Sheet open={false} onClose={onClose}>{null}</Sheet>;
  const t = today();
  const future = date > t;
  const mine = workouts.filter((w) => w.date === date);
  const label = parseDate(date).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' });
  const chosen = backfill ?? (planned === 'rest' ? 'push' : planned);

  const newSession = async (type: DayType) => {
    const at = `${date}T19:00:00`;
    return wApi.create({ date, day_type: type, started_at: new Date(at).toISOString(), finished_at: new Date(`${date}T20:00:00`).toISOString(), notes: 'Logged after' });
  };
  const describe = async () => {
    setBusy(true);
    try {
      const p = await api<Parsed>('/gym/parse', { method: 'POST', body: JSON.stringify({ text }) });
      if (!p.exercises.length) toast({ message: 'Couldn’t read any sets from that — try “bench 60x8 x3”' });
      setParsed(p);
      if (p.day_type) setBackfill(p.day_type);
    } catch (e) {
      toast({ message: `AI unavailable: ${(e as Error).message}` });
    } finally {
      setBusy(false);
    }
  };
  const saveParsed = async () => {
    if (!parsed) return;
    const w = await newSession(parsed.day_type ?? chosen);
    let n = 0;
    for (const ex of parsed.exercises) for (const s of ex.sets) await sApi.create({ workout_id: w.id, date, exercise: ex.name, set_no: ++n, weight: s.weight, reps: s.reps });
    haptic(20);
    toast({ message: `Logged ${n} sets for ${label}` });
    setParsed(null);
    setText('');
  };
  const del = (w: Workout) => {
    const own = sets.filter((s) => s.workout_id === w.id);
    wApi.remove(w.id);
    toast({
      message: 'Session deleted',
      action: {
        label: 'Undo',
        onClick: async () => {
          const { id: _, created_at: __, updated_at: ___, ...rest } = w;
          const nw = await wApi.create(rest);
          for (const s of own) await sApi.create({ workout_id: nw.id, date: s.date, exercise: s.exercise, set_no: s.set_no, weight: s.weight, reps: s.reps });
        },
      },
    });
  };

  return (
    <>
      <Sheet open={!picking} onClose={onClose} title={label}>
        <div className="space-y-4">
          <p className="flex items-center gap-2 text-sm text-ink-2">
            <span className="slant px-2 py-0.5 text-mini font-black italic uppercase text-black" style={{ background: DAY_META[planned].color }}>
              {DAY_META[planned].label}
            </span>
            planned · {DAY_META[planned].focus}
          </p>

          {/* What was logged */}
          {mine.map((w) => {
            const own = sets.filter((s) => s.workout_id === w.id);
            const names = [...new Set([...own.map((s) => s.exercise), ...(extra[w.id] ?? [])])];
            return (
              <motion.div key={w.id} layout className="space-y-3 rounded-xl border border-line bg-bg p-3">
                <div className="grid grid-cols-[minmax(0,1fr)_7rem] gap-3">
                  <div className="min-w-0">
                    <p className="text-micro font-black uppercase tracking-[0.2em] text-ink-3">Logged as</p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {TYPES.map((d) => (
                        <button key={d} onClick={() => wApi.update({ id: w.id, day_type: d })} className={cx('slant px-2 py-0.5 text-micro font-black italic uppercase', w.day_type === d ? 'text-black' : 'bg-surface-2 text-ink-3')} style={w.day_type === d ? { background: DAY_META[d].color } : undefined}>
                          {DAY_META[d].label}
                        </button>
                      ))}
                    </div>
                    <p className="mt-2 font-mono text-tiny text-ink-3">
                      {own.length} sets · {Math.round(volume(own))} kg{!w.finished_at && ' · in progress'}
                    </p>
                  </div>
                  <BodyMap heat={heat(muscleSets(own))} className="h-28" />
                </div>
                <ul className="space-y-2">
                  {names.map((n) => (
                    <li key={n} className="rounded-lg bg-surface p-2.5">
                      <div className="flex items-center gap-2">
                        <p className="min-w-0 flex-1 truncate text-sm font-semibold">{n}</p>
                        <button onClick={() => onGuide(n)} aria-label={`${n} guide`} className="text-ink-3">
                          <BookOpen className="size-4" />
                        </button>
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        <AnimatePresence initial={false}>
                          {own
                            .filter((s) => s.exercise === n)
                            .map((s) => (
                              <motion.span key={s.id} layout initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.6 }} className="flex items-center gap-1 rounded-md bg-surface-2 py-1 pl-2 pr-1 font-mono text-tiny">
                                {kg(s.weight)}×{s.reps}
                                <button aria-label="Remove set" onClick={() => sApi.remove(s.id)} className="grid size-5 place-items-center text-ink-3 hover:text-accent">
                                  <X className="size-3" />
                                </button>
                              </motion.span>
                            ))}
                        </AnimatePresence>
                      </div>
                      <AddSet onAdd={(wt, r) => void sApi.create({ workout_id: w.id, date, exercise: n, set_no: own.length + 1, weight: wt, reps: r })} />
                    </li>
                  ))}
                </ul>
                <div className="grid grid-cols-2 gap-2">
                  <Button size="sm" variant="soft" onClick={() => setPicking(w.id)}>
                    <Plus className="size-4" /> Exercise
                  </Button>
                  <Button size="sm" variant="danger" onClick={() => del(w)}>
                    <Trash2 className="size-4" /> Delete {date === t ? 'today' : 'session'}
                  </Button>
                </div>
              </motion.div>
            );
          })}

          {/* Nothing logged: show the plan for a future day, or backfill a past one */}
          {!mine.length && future && planned !== 'rest' && (
            <div className="space-y-2">
              <BodyMap heat={plannedHeat(template(planned))} className="h-40" />
              <ol className="space-y-1 text-sm text-ink-2">
                {template(planned).map((e, i) => (
                  <li key={e.name} className="flex gap-2">
                    <span className="w-5 font-mono text-ink-3">{i + 1}</span> {e.name} <span className="text-ink-3">{e.sets}×{e.reps}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
          {!mine.length && future && planned === 'rest' && <p className="text-sm text-ink-3">Rest day — walk, stretch, sleep.</p>}

          {!mine.length && !future && (
            <div className="space-y-3">
              <p className="text-sm text-ink-3">Nothing logged{date === t ? ' yet today' : ''}. Trained but forgot to log? Add it now:</p>
              <div>
                <p className="mb-1 text-micro font-black uppercase tracking-[0.2em] text-ink-3">What did you train?</p>
                <div className="flex flex-wrap gap-1.5">
                  {TYPES.map((d) => (
                    <button key={d} onClick={() => setBackfill(d)} className={cx('slant px-3 py-1 text-mini font-black italic uppercase', chosen === d ? 'text-black' : 'bg-surface-2 text-ink-2')} style={chosen === d ? { background: DAY_META[d].color } : undefined}>
                      {DAY_META[d].label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-1 flex items-center gap-1.5 text-micro font-black uppercase tracking-[0.2em] text-ink-3">
                  <Wand2 className="size-3.5" /> Describe it
                </p>
                <div className="flex items-end gap-2">
                  <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} placeholder="bench 60x8 x3, incline db 20 3x10, pushdowns 25 3x12, laterals" className="field min-h-20 flex-1 resize-none text-base" />
                  <Mic value={text} onChange={setText} />
                </div>
                <Button size="sm" className="mt-2 w-full" disabled={!text.trim() || busy} onClick={() => void describe()}>
                  <Sparkles className="size-4" /> {busy ? 'Reading it…' : 'Turn into sets'}
                </Button>
              </div>
              {parsed && parsed.exercises.length > 0 && (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-2 rounded-xl border border-line bg-bg p-3">
                  <div className="grid grid-cols-[minmax(0,1fr)_6rem] gap-2">
                    <ul className="space-y-1 text-sm">
                      {parsed.exercises.map((e) => (
                        <li key={e.name}>
                          <span className="font-semibold">{e.name}</span>
                          <span className="block font-mono text-tiny text-ink-3">{e.sets.map((s) => `${kg(s.weight)}×${s.reps}`).join('  ')}</span>
                        </li>
                      ))}
                    </ul>
                    <BodyMap heat={heat(muscleSets(parsed.exercises.flatMap((e) => e.sets.map(() => ({ exercise: e.name })))))} className="h-28" />
                  </div>
                  <Button className="w-full" onClick={() => void saveParsed()}>
                    <Check className="size-4" /> Save as {DAY_META[parsed.day_type ?? chosen].label} · {parsed.exercises.reduce((a, e) => a + e.sets.length, 0)} sets
                  </Button>
                </motion.div>
              )}
              <Button variant="ghost" className="w-full" onClick={async () => setPicking((await newSession(chosen)).id)}>
                <Plus className="size-4" /> Or pick exercises one by one
              </Button>
            </div>
          )}
        </div>
      </Sheet>
      <ExercisePicker
        open={!!picking}
        onClose={() => setPicking(null)}
        muscles={DAY_MUSCLES[(mine.find((w) => w.id === picking)?.day_type as DayType) ?? chosen] ?? []}
        exclude={sets.filter((s) => s.workout_id === picking).map((s) => s.exercise)}
        onPick={(name) => picking && setExtra((x) => ({ ...x, [picking]: [...(x[picking] ?? []), name] }))}
      />
    </>
  );
}
