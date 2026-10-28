import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Check as CheckIcon, ChevronDown, Flag, Pencil, Plus, Redo2, Timer, Trash2, Trophy, X } from 'lucide-react';
import { useList, useResource, useSettings } from '../lib/api';
import { addDays, parseDate, relativeDay, today } from '../lib/format';
import { listItem, spring } from '../lib/motion';
import { CYCLE, DAY_META, DEFAULT_TEMPLATES, bestByExercise, dayTypeOn, e1rm, sectorColor, volume, type DayType, type Exercise } from '../core/gym';
import type { GymSet, Workout } from '../lib/types';
import { Chequered, CountdownBar, SectorChip, SectorLegend, StartLights, Telemetry } from '../components/f1';
import { useToast } from '../components/toast';
import { AnimatedNumber, Button, Card, IconButton, Input, Page, PageHeader, Rise, SectionTitle, Sheet, cx } from '../components/ui';

const kg = (n: number) => `${+n.toFixed(1)}`;

function useTemplates() {
  const { settings, save } = useSettings();
  const get = (d: DayType): Exercise[] => (d === 'rest' ? [] : (settings.gymTemplates?.[d] as Exercise[] | undefined) ?? DEFAULT_TEMPLATES[d]);
  const set = (d: DayType, list: Exercise[]) => save({ gymTemplates: { ...settings.gymTemplates, [d]: list } });
  return { get, set };
}


// ---------- Race calendar strip ----------
function Calendar({ shift, workouts }: { shift: number; workouts: Workout[] }) {
  const t = today();
  const days = Array.from({ length: 14 }, (_, i) => addDays(t, i - 6));
  const trained = new Set(workouts.filter((w) => w.finished_at).map((w) => w.date));
  return (
    <div className="no-scrollbar -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <div className="grid min-w-[760px] grid-cols-14 gap-1.5" style={{ gridTemplateColumns: 'repeat(14, minmax(0, 1fr))' }}>
        {days.map((d, i) => {
          const type = dayTypeOn(d, shift);
          const meta = DAY_META[type];
          const isToday = d === t;
          const past = d < t;
          const done = trained.has(d);
          return (
            <motion.div
              key={d}
              initial={{ opacity: 0, y: 20, skewX: -8 }}
              animate={{ opacity: 1, y: 0, skewX: 0 }}
              transition={{ ...spring, delay: 0.15 + i * 0.03 }}
              className={cx('relative overflow-hidden rounded-md border px-2 pb-2 pt-1.5', isToday ? 'border-accent bg-accent-soft' : 'border-line bg-surface', past && !isToday && 'opacity-60')}
            >
              <span className="absolute inset-x-0 top-0 h-[3px]" style={{ background: meta.color }} />
              <p className="text-[10px] font-bold uppercase tracking-wider text-ink-3">{parseDate(d).toLocaleDateString(undefined, { weekday: 'short' })}</p>
              <p className="text-lg font-black italic leading-none">{parseDate(d).getDate()}</p>
              <p className="mt-1 text-[11px] font-black italic uppercase" style={{ color: type === 'rest' ? 'var(--ink-3)' : meta.color }}>
                {meta.short}
              </p>
              {done && <Flag className="absolute right-1.5 top-2 size-3.5 fill-current text-ink" aria-label="Trained" />}
              {isToday && <motion.span layoutId="cal-today" className="absolute inset-x-0 bottom-0 h-[3px] bg-accent" />}
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

// ---------- Live session ----------
function ExerciseCard({ ex, workout, sets, lastSets, priorBest, onLogged }: { ex: Exercise; workout: Workout; sets: GymSet[]; lastSets: GymSet[]; priorBest: number; onLogged: () => void }) {
  const { create, remove } = useResource<GymSet>('sets');
  const next = lastSets[sets.length] ?? lastSets.at(-1) ?? sets.at(-1);
  const [weight, setWeight] = useState<string>(next ? String(next.weight) : '');
  const [reps, setReps] = useState<string>(next ? String(next.reps) : '');
  const done = sets.length >= ex.sets;
  const lastBest = lastSets.reduce((m, s) => Math.max(m, e1rm(s.weight, s.reps)), 0);
  const sessionBest = sets.reduce((m, s) => Math.max(m, e1rm(s.weight, s.reps)), 0);

  const log = async () => {
    const w = Number(weight);
    const r = Number(reps);
    if (!(r > 0) || !(w >= 0)) return;
    await create({ workout_id: workout.id, date: workout.date, exercise: ex.name, set_no: sets.length + 1, weight: w, reps: r });
    onLogged();
  };

  return (
    <motion.div layout {...listItem} className={cx('rounded-xl border bg-surface p-4 transition-colors', done ? 'border-green/40' : 'border-line')}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[16px] font-bold">{ex.name}</p>
          <p className="text-xs text-ink-3">
            Target {ex.sets} × {ex.reps}
            {lastSets.length > 0 && <> · last: {lastSets.map((s) => `${kg(s.weight)}×${s.reps}`).join(', ')}</>}
          </p>
        </div>
        <span className={cx('font-mono text-sm font-bold', done ? 'text-green' : 'text-ink-3')}>
          {sets.length}/{ex.sets}
        </span>
      </div>
      {sets.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-2">
          <AnimatePresence initial={false}>
            {sets.map((s) => (
              <motion.li key={s.id} layout initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, scale: 0.8 }} className="group flex items-center gap-1">
                <SectorChip sector={sectorColor(s, sessionBest, priorBest, lastBest)}>
                  {kg(s.weight)}×{s.reps}
                </SectorChip>
                <button aria-label="Remove set" onClick={() => remove(s.id)} className="text-ink-3 opacity-0 transition group-hover:opacity-100 hover:text-danger">
                  <X className="size-3.5" />
                </button>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
      <form
        className="mt-3 flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void log();
        }}
      >
        <label className="relative flex-1">
          <input inputMode="decimal" aria-label="Weight (kg)" value={weight} onChange={(e) => setWeight(e.target.value.replace(/[^\d.]/g, ''))} className="field h-10 w-full pr-9 font-mono" placeholder="kg" />
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-ink-3">kg</span>
        </label>
        <span className="text-ink-3">×</span>
        <label className="relative flex-1">
          <input inputMode="numeric" aria-label="Reps" value={reps} onChange={(e) => setReps(e.target.value.replace(/\D/g, ''))} className="field h-10 w-full pr-11 font-mono" placeholder="reps" />
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-ink-3">reps</span>
        </label>
        <Button size="sm" type="submit" className="h-10" disabled={!reps}>
          <CheckIcon className="size-4" /> Log
        </Button>
      </form>
    </motion.div>
  );
}

function Session({ workout, template, sets, allSets, workouts }: { workout: Workout; template: Exercise[]; sets: GymSet[]; allSets: GymSet[]; workouts: Workout[] }) {
  const { update } = useResource<Workout>('workouts');
  const [rest, setRest] = useState(0);
  const [extra, setExtra] = useState('');
  const [finished, setFinished] = useState(false);
  const loggedNames = [...new Set(sets.map((s) => s.exercise))];
  const exercises: Exercise[] = [...template, ...loggedNames.filter((n) => !template.some((t) => t.name === n)).map((name) => ({ name, sets: 3, reps: '8-12' }))];
  const [added, setAdded] = useState<Exercise[]>([]);
  const all = [...exercises, ...added.filter((a) => !exercises.some((e) => e.name === a.name))];

  // Previous session of the same day type, for "last time" ghosts and the green threshold.
  const prev = workouts.find((w) => w.id !== workout.id && w.day_type === workout.day_type && w.finished_at && w.date <= workout.date);
  const prevSets = prev ? allSets.filter((s) => s.workout_id === prev.id) : [];
  const vol = volume(sets);
  const prior = useMemo(() => bestByExercise(allSets, workout.id), [allSets, workout.id]);
  // A PR needs history to beat — a first-ever benchmark isn't counted as one.
  const sessionMax = bestByExercise(sets);
  const prs = [...sessionMax].filter(([name, v]) => (prior.get(name) ?? 0) > 0 && v > prior.get(name)!).map(([name]) => sets.filter((s) => s.exercise === name).sort((a, b) => e1rm(b.weight, b.reps) - e1rm(a.weight, a.reps))[0]);
  const mins = Math.round((Date.now() - new Date(workout.started_at ?? workout.created_at).getTime()) / 60000);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Telemetry label="Sets" value={<AnimatedNumber value={sets.length} />} />
        <Telemetry label="Volume" value={<AnimatedNumber value={vol} />} unit="kg" accent="var(--sky)" />
        <Telemetry label="Fastest laps" value={<AnimatedNumber value={prs.length} />} unit="PR" accent="var(--purple)" />
        <Telemetry label="Session" value={mins} unit="min" accent="var(--yellow)" />
      </div>
      <SectorLegend />
      <AnimatePresence>
        {rest > 0 && (
          <motion.div key={rest} initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="sticky top-14 z-20 rounded-xl border border-green/30 bg-bg/95 p-3 backdrop-blur">
            <div className="flex items-center gap-3">
              <Timer className="size-5 text-green" />
              <div className="flex-1">
                <CountdownBar seconds={90} label="Rest · DRS open" onDone={() => (navigator.vibrate?.([80, 60, 80]), setRest(0))} />
              </div>
              <IconButton label="Skip rest" onClick={() => setRest(0)}>
                <X className="size-4" />
              </IconButton>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <motion.div layout className="grid gap-3 xl:grid-cols-2">
        {all.map((ex) => (
          <ExerciseCard
            key={ex.name}
            ex={ex}
            workout={workout}
            sets={sets.filter((s) => s.exercise === ex.name)}
            lastSets={prevSets.filter((s) => s.exercise === ex.name)}
            priorBest={prior.get(ex.name) ?? 0}
            onLogged={() => setRest((r) => r + 1)}
          />
        ))}
      </motion.div>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (extra.trim()) setAdded((a) => [...a, { name: extra.trim(), sets: 3, reps: '8-12' }]);
          setExtra('');
        }}
      >
        <Input placeholder="Add another exercise" value={extra} onChange={(e) => setExtra(e.target.value)} />
        <Button type="submit" variant="soft">
          <Plus className="size-4" /> Add
        </Button>
      </form>
      <Button
        className="h-14 w-full text-base"
        onClick={() => {
          update({ id: workout.id, finished_at: new Date().toISOString() });
          setFinished(true);
        }}
      >
        <Flag className="size-5" /> Finish session
      </Button>
      <Sheet open={finished} onClose={() => setFinished(false)}>
        <div className="flex flex-col items-center text-center">
          <Chequered className="h-24 w-36" />
          <p className="mt-4 text-[13px] font-black uppercase tracking-[0.25em] text-ink-3">Chequered flag</p>
          <p className="text-4xl font-black italic uppercase">{DAY_META[workout.day_type as DayType]?.label} done</p>
          <div className="mt-5 grid w-full grid-cols-3 gap-2">
            <Telemetry label="Sets" value={sets.length} />
            <Telemetry label="Volume" value={Math.round(vol)} unit="kg" accent="var(--sky)" />
            <Telemetry label="PRs" value={prs.length} accent="var(--purple)" />
          </div>
          {prs.length > 0 && (
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {prs.map((s) => (
                <SectorChip key={s.id} sector="purple">
                  {s.exercise} {kg(s.weight)}×{s.reps}
                </SectorChip>
              ))}
            </div>
          )}
        </div>
      </Sheet>
    </div>
  );
}

// ---------- Today ----------
function TodayPanel({ shift, workouts, sets }: { shift: number; workouts: Workout[]; sets: GymSet[] }) {
  const t = today();
  const planned = dayTypeOn(t, shift);
  const [override, setOverride] = useState<DayType | null>(null);
  const { create } = useResource<Workout>('workouts');
  const { get } = useTemplates();
  const { save, settings } = useSettings();
  const toast = useToast();
  const [lights, setLights] = useState(false);
  const active = workouts.find((w) => w.date === t && !w.finished_at) ?? workouts.find((w) => w.date === t);
  const type = (active?.day_type as DayType | undefined) ?? override ?? planned;
  const meta = DAY_META[type];
  const tomorrow = DAY_META[dayTypeOn(addDays(t, 1), shift)];

  if (active && !active.finished_at) {
    return <Session workout={active} template={get(type)} sets={sets.filter((s) => s.workout_id === active.id)} allSets={sets} workouts={workouts} />;
  }

  if (active?.finished_at) {
    const s = sets.filter((x) => x.workout_id === active.id);
    return (
      <Card className="flex flex-col items-center gap-4 py-10 text-center sm:flex-row sm:text-left">
        <Chequered className="h-20 w-28 shrink-0" />
        <div className="flex-1">
          <p className="text-3xl font-black italic uppercase">{meta.label} — finished</p>
          <p className="text-ink-2">
            {s.length} sets · {Math.round(volume(s))} kg volume. Next up: <b className="text-ink">{tomorrow.label}</b> tomorrow.
          </p>
        </div>
      </Card>
    );
  }

  if (type === 'rest') {
    return (
      <Card className="relative overflow-hidden">
        <div className="pointer-events-none absolute -right-10 -top-10 text-[180px] font-black italic leading-none text-white/[0.03]">BOX</div>
        <p className="slant inline-block bg-ink px-3 py-0.5 text-[12px] font-black italic uppercase tracking-widest text-bg">Pit stop</p>
        <p className="mt-3 text-4xl font-black italic uppercase">Rest day</p>
        <p className="mt-1 max-w-lg text-ink-2">Muscle is built while you recover. Tomorrow is <b className="text-ink">{tomorrow.label}</b> ({tomorrow.focus}).</p>
        <ul className="mt-5 grid gap-2 sm:grid-cols-2">
          {['8k+ steps / easy walk', '10 min mobility & stretching', 'Hit your protein target', '7.5–8 h sleep'].map((x, i) => (
            <motion.li key={x} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 + i * 0.08 }} className="flex items-center gap-2 rounded-lg bg-bg px-3 py-2.5 text-sm">
              <span className="h-3 w-1 -skew-x-12 bg-green" /> {x}
            </motion.li>
          ))}
        </ul>
        <div className="mt-5 flex flex-wrap gap-2">
          {(['upper', 'lower', 'push', 'pull', 'legs'] as DayType[]).map((d) => (
            <Button key={d} size="sm" variant="ghost" onClick={() => setOverride(d)}>
              Train {DAY_META[d].label} anyway
            </Button>
          ))}
        </div>
      </Card>
    );
  }

  const template = get(type);
  return (
    <Card className="relative overflow-hidden">
      <div className="pointer-events-none absolute -right-6 -top-8 text-[170px] font-black italic leading-none opacity-[0.05]" style={{ color: meta.color }}>
        {meta.short}
      </div>
      <div className="flex flex-col gap-6 lg:flex-row lg:items-center">
        <div className="flex-1">
          <p className="slant inline-block px-3 py-0.5 text-[12px] font-black italic uppercase tracking-widest text-black" style={{ background: meta.color }}>
            Lights out
          </p>
          <p className="mt-3 text-5xl font-black italic uppercase">{meta.label} day</p>
          <p className="text-ink-2">{meta.focus}</p>
          <ol className="mt-4 grid gap-1 text-sm text-ink-2 sm:grid-cols-2">
            {template.map((e, i) => (
              <li key={e.name} className="flex gap-2">
                <span className="w-5 font-mono text-ink-3">{String(i + 1).padStart(2, '0')}</span>
                {e.name} <span className="text-ink-3">{e.sets}×{e.reps}</span>
              </li>
            ))}
          </ol>
        </div>
        <div className="flex flex-col items-center gap-4">
          <StartLights
            running={lights}
            size={26}
            onGo={async () => {
              await create({ date: t, day_type: type, started_at: new Date().toISOString() });
              setLights(false);
            }}
          />
          <Button className="h-12 w-full px-8 text-base" disabled={lights} onClick={() => setLights(true)}>
            {lights ? 'Hold…' : 'Start session'}
          </Button>
          <button
            className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-ink-3 hover:text-ink"
            onClick={() => {
              save({ gymShift: (settings.gymShift ?? 0) + 1 });
              toast({ message: `Skipped — ${meta.label} moves to tomorrow`, action: { label: 'Undo', onClick: () => save({ gymShift: settings.gymShift ?? 0 }) } });
            }}
          >
            <Redo2 className="size-3.5" /> Skipped today? Push plan by a day
          </button>
        </div>
      </div>
    </Card>
  );
}

// ---------- Analytics ----------
function WeeklyVolume({ sets }: { sets: GymSet[] }) {
  const t = today();
  const weeks = Array.from({ length: 10 }, (_, i) => {
    const end = addDays(t, -7 * (9 - i));
    const start = addDays(end, -6);
    return { label: parseDate(start).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }), v: volume(sets.filter((s) => s.date >= start && s.date <= end)) };
  });
  const max = Math.max(1, ...weeks.map((w) => w.v));
  const [hover, setHover] = useState<number | null>(null);
  const shown = weeks[hover ?? weeks.length - 1];
  return (
    <Card>
      <SectionTitle>Weekly volume</SectionTitle>
      <p className="text-xs text-ink-3">{hover === null ? 'This week' : `Week of ${shown.label}`}</p>
      <p className="mb-3 text-3xl font-black italic tabular-nums">
        {Math.round(shown.v).toLocaleString()} <span className="text-sm not-italic text-ink-3">kg</span>
      </p>
      <div className="flex h-36 items-end gap-1.5" onMouseLeave={() => setHover(null)}>
        {weeks.map((w, i) => (
          <button key={i} className="flex h-full flex-1 items-end" onMouseEnter={() => setHover(i)} aria-label={`${w.label}: ${Math.round(w.v)} kg`}>
            <motion.span
              className="w-full rounded-t-[4px]"
              style={{ background: i === weeks.length - 1 ? 'var(--accent)' : 'var(--line-strong)', opacity: hover === null || hover === i ? 1 : 0.45 }}
              initial={{ height: 0 }}
              animate={{ height: w.v ? `${(w.v / max) * 100}%` : '2px' }}
              transition={{ type: 'spring', stiffness: 80, damping: 16, delay: i * 0.04 }}
            />
          </button>
        ))}
      </div>
    </Card>
  );
}

function PrBoard({ sets }: { sets: GymSet[] }) {
  const rows = useMemo(() => {
    const best = new Map<string, GymSet>();
    for (const s of sets) {
      const b = best.get(s.exercise);
      if (!b || e1rm(s.weight, s.reps) > e1rm(b.weight, b.reps)) best.set(s.exercise, s);
    }
    return [...best.values()].sort((a, b) => e1rm(b.weight, b.reps) - e1rm(a.weight, a.reps)).slice(0, 8);
  }, [sets]);
  return (
    <Card>
      <SectionTitle>
        <span className="flex items-center gap-2">
          <Trophy className="size-4 text-purple" /> Fastest laps
        </span>
      </SectionTitle>
      {rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-ink-3">Log your first session to set the timing board.</p>
      ) : (
        <ol className="space-y-1.5">
          {rows.map((s, i) => (
            <motion.li key={s.exercise} initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }} className="flex items-center gap-3 rounded-md bg-bg px-3 py-2 text-sm">
              <span className="w-6 font-mono font-bold text-ink-3">P{i + 1}</span>
              <span className="flex-1 truncate font-semibold">{s.exercise}</span>
              <span className="font-mono text-ink-2">
                {kg(s.weight)}×{s.reps}
              </span>
              <span className="w-16 text-right font-mono font-bold text-purple">{Math.round(e1rm(s.weight, s.reps))}</span>
            </motion.li>
          ))}
        </ol>
      )}
      <p className="mt-2 text-[11px] text-ink-3">Right column: estimated 1-rep max (Epley), kg.</p>
    </Card>
  );
}

function History({ workouts, sets }: { workouts: Workout[]; sets: GymSet[] }) {
  const { remove, create } = useResource<Workout>('workouts');
  const setsApi = useResource<GymSet>('sets');
  const toast = useToast();
  const [open, setOpen] = useState<string | null>(null);
  const done = workouts.filter((w) => w.finished_at).slice(0, 20);
  const del = (w: Workout) => {
    const mine = sets.filter((s) => s.workout_id === w.id);
    remove(w.id);
    toast({
      message: 'Session deleted',
      action: {
        label: 'Undo',
        onClick: async () => {
          const { id: _, created_at: __, updated_at: ___, ...rest } = w;
          const nw = await create(rest);
          for (const s of mine) await setsApi.create({ workout_id: nw.id, date: s.date, exercise: s.exercise, set_no: s.set_no, weight: s.weight, reps: s.reps });
        },
      },
    });
  };
  return (
    <Card>
      <SectionTitle>Race history</SectionTitle>
      {done.length === 0 && <p className="py-6 text-center text-sm text-ink-3">No finished sessions yet.</p>}
      <ul className="space-y-1.5">
        {done.map((w) => {
          const s = sets.filter((x) => x.workout_id === w.id);
          const meta = DAY_META[w.day_type as DayType] ?? DAY_META.push;
          const isOpen = open === w.id;
          return (
            <li key={w.id} className="overflow-hidden rounded-md bg-bg">
              <button onClick={() => setOpen(isOpen ? null : w.id)} className="group flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm">
                <span className="h-6 w-1 -skew-x-12" style={{ background: meta.color }} />
                <span className="w-24 font-semibold">{relativeDay(w.date)}</span>
                <span className="flex-1 font-black italic uppercase">{meta.label}</span>
                <span className="font-mono text-ink-3">{s.length} sets</span>
                <span className="w-20 text-right font-mono">{Math.round(volume(s))}kg</span>
                <ChevronDown className={cx('size-4 text-ink-3 transition', isOpen && 'rotate-180')} />
              </button>
              <AnimatePresence initial={false}>
                {isOpen && (
                  <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden">
                    <div className="space-y-1 border-t border-line px-4 py-3 text-sm">
                      {[...new Set(s.map((x) => x.exercise))].map((name) => (
                        <p key={name} className="flex gap-3">
                          <span className="w-48 truncate text-ink-2">{name}</span>
                          <span className="font-mono text-ink">{s.filter((x) => x.exercise === name).map((x) => `${kg(x.weight)}×${x.reps}`).join('  ')}</span>
                        </p>
                      ))}
                      <Button size="sm" variant="danger" className="mt-2" onClick={() => del(w)}>
                        <Trash2 className="size-3.5" /> Delete session
                      </Button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function TemplateEditor({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { get, set } = useTemplates();
  const [day, setDay] = useState<Exclude<DayType, 'rest'>>('push');
  const list = get(day);
  const [name, setName] = useState('');
  return (
    <Sheet open={open} onClose={onClose} title="Session templates">
      <div className="no-scrollbar mb-4 flex gap-1.5 overflow-x-auto">
        {(['push', 'pull', 'legs', 'upper', 'lower'] as const).map((d) => (
          <button key={d} onClick={() => setDay(d)} className={cx('slant px-4 py-1.5 text-[12px] font-black italic uppercase', day === d ? 'text-black' : 'bg-surface-2 text-ink-2')} style={day === d ? { background: DAY_META[d].color } : undefined}>
            {DAY_META[d].label}
          </button>
        ))}
      </div>
      <ul className="space-y-1.5">
        {list.map((e, i) => (
          <li key={e.name + i} className="flex items-center gap-2 rounded-md bg-bg px-3 py-2 text-sm">
            <span className="flex-1 truncate">{e.name}</span>
            <input aria-label="Sets" value={e.sets} onChange={(ev) => set(day, list.map((x, j) => (j === i ? { ...x, sets: Number(ev.target.value) || 1 } : x)))} className="field h-8 w-12 !px-2 text-center font-mono" />
            <span className="text-ink-3">×</span>
            <input aria-label="Reps" value={e.reps} onChange={(ev) => set(day, list.map((x, j) => (j === i ? { ...x, reps: ev.target.value } : x)))} className="field h-8 w-16 !px-2 text-center font-mono" />
            <IconButton label={`Remove ${e.name}`} onClick={() => set(day, list.filter((_, j) => j !== i))}>
              <Trash2 className="size-4" />
            </IconButton>
          </li>
        ))}
      </ul>
      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          set(day, [...list, { name: name.trim(), sets: 3, reps: '8-12' }]);
          setName('');
        }}
      >
        <Input placeholder={`Add exercise to ${DAY_META[day].label}`} value={name} onChange={(e) => setName(e.target.value)} />
        <Button type="submit">Add</Button>
      </form>
    </Sheet>
  );
}

export function GymPage() {
  const { settings } = useSettings();
  const shift = settings.gymShift ?? 0;
  const { data: workouts = [] } = useList<Workout>('workouts');
  const { data: sets = [] } = useList<GymSet>('sets');
  const [editing, setEditing] = useState(false);
  const month = today().slice(0, 7);
  const sessionsThisMonth = workouts.filter((w) => w.finished_at && w.date.startsWith(month)).length;
  const lap = CYCLE.map((d) => DAY_META[d].short).join(' › ');

  return (
    <Page>
      <PageHeader
        eyebrow="Garage · Body"
        title="Gym"
        action={
          <Button variant="ghost" onClick={() => setEditing(true)}>
            <Pencil className="size-4" /> Templates
          </Button>
        }
      />
      <Rise className="mb-2 flex items-center justify-between text-[11px] font-bold uppercase tracking-widest text-ink-3">
        <span>Lap: {lap}</span>
        <span>{sessionsThisMonth} sessions this month</span>
      </Rise>
      <Rise className="mb-6">
        <Calendar shift={shift} workouts={workouts} />
      </Rise>
      <Rise className="mb-6">
        <TodayPanel shift={shift} workouts={workouts} sets={sets} />
      </Rise>
      <div className="grid gap-4 lg:grid-cols-2">
        <Rise>
          <WeeklyVolume sets={sets} />
        </Rise>
        <Rise>
          <PrBoard sets={sets} />
        </Rise>
      </div>
      <Rise className="mt-4">
        <History workouts={workouts} sets={sets} />
      </Rise>
      <TemplateEditor open={editing} onClose={() => setEditing(false)} />
    </Page>
  );
}
