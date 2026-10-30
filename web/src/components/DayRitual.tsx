import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { AnimatePresence, motion } from 'motion/react';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, Check, Flag, Moon, Plus, Sunrise, Trash2, X } from 'lucide-react';
import { api, useList, useResource, useSettings } from '../lib/api';
import { addDays, haptic, today } from '../lib/format';
import type { DayRow, Task } from '../lib/types';
import { ENERGY, SHUTDOWN_STEPS, parseTop, runEnding, toTomorrow, topJson, type Top } from '../core/day';
import { DAY_META, dayTypeOn } from '../core/gym';
import { workConfig, workDay } from '../core/work';
import { weatherOf } from '../core/people';
import { useHabits } from '../lib/habits';
import { Daily3, useStory } from './Daily3';
import { Button, Card, Sheet, cx } from './ui';

/** A stable id per date, so the phone and laptop (even offline) write the same row. */
const dayId = (date: string) => `00000000-0000-4000-8000-${date.replace(/-/g, '')}0000`;

export function useDay(date: string) {
  const { data = [] } = useList<DayRow>('days', { from: addDays(date, -60), to: addDays(date, 1) });
  const api_ = useResource<DayRow>('days');
  const row = data.find((d) => d.date === date) ?? null;
  const save = async (patch: Partial<DayRow>, on = date) => {
    const r = data.find((d) => d.date === on);
    if (r) api_.update({ id: r.id, ...patch });
    else {
      await api_.create({ id: dayId(on), date: on });
      api_.update({ id: dayId(on), ...patch });
    }
  };
  const shutdowns = data.filter((d) => d.shutdown_at).map((d) => d.date);
  return { row, rows: data, save, top: parseTop(row?.intention), streak: runEnding(shutdowns, date) };
}

/** The day's top 3: tick them off, add one, or clear one. */
function TopThree({ items, onChange, placeholder = 'What would make today a win?' }: { items: Top[]; onChange: (items: Top[]) => void; placeholder?: string }) {
  const [draft, setDraft] = useState('');
  const add = () => draft.trim() && (onChange([...items, { t: draft.trim(), done: false }]), setDraft(''));
  return (
    <div className="space-y-1.5">
      {items.map((x, i) => (
        <div key={i} className={cx('flex items-center gap-3 rounded-md bg-bg px-3 py-2', x.done && 'opacity-60')}>
          <button onClick={() => (haptic(10), onChange(items.map((y, j) => (j === i ? { ...y, done: !y.done } : y))))} aria-pressed={x.done} aria-label={`Done: ${x.t}`} className={cx('grid size-6 shrink-0 place-items-center rounded-md border-2', x.done ? 'border-green bg-green text-black' : 'border-line-strong')}>
            {x.done && <Check className="size-3.5" />}
          </button>
          <span className={cx('flex-1 text-sm font-semibold', x.done && 'line-through')}>
            <span className="mr-1.5 font-mono text-tiny text-accent">P{i + 1}</span>
            {x.t}
          </span>
          <button onClick={() => onChange(items.filter((_, j) => j !== i))} aria-label={`Remove ${x.t}`} className="text-ink-3">
            <X className="size-4" />
          </button>
        </div>
      ))}
      {items.length < 3 && (
        <form onSubmit={(e) => (e.preventDefault(), add())} className="flex gap-2">
          <input value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={add} enterKeyHint="done" placeholder={items.length ? 'Another one?' : placeholder} className="field h-10 flex-1 text-sm" />
          <button type="submit" aria-label="Add" className="grid size-10 shrink-0 place-items-center rounded-md bg-surface-2 text-ink-2">
            <Plus className="size-4" />
          </button>
        </form>
      )}
    </div>
  );
}

function useBrief() {
  return useQuery({ queryKey: ['briefs-preview'], queryFn: () => api<{ morning: { title: string; body: string }; evening: { title: string; body: string } }>('/briefs/preview'), staleTime: 5 * 60_000 });
}

function Weather() {
  const { settings } = useSettings();
  const h = settings.home;
  const pts = h ? `${h.lat},${h.lon}` : '';
  const { data } = useQuery({ queryKey: ['weather', pts], queryFn: () => api<Record<string, { temp: number; code: number; day: boolean; max: number | null; min: number | null } | null>>(`/geo/weather?pts=${pts}`), enabled: !!h, staleTime: 10 * 60_000 });
  const w = h && data?.[`${h.lat.toFixed(2)},${h.lon.toFixed(2)}`];
  if (!w) return null;
  const x = weatherOf(w.code, w.day);
  return (
    <span className="font-mono text-tiny text-ink-2">
      {x.emoji} {Math.round(w.temp)}°{w.max != null && ` · ${Math.round(w.min!)}–${Math.round(w.max)}°`} {h.city}
    </span>
  );
}

/**
 * The day's bookend card on Today. Morning: the brief, the weather and today's top 3. Afternoon:
 * just the top 3. Evening: the shutdown ritual — or the chequered flag once it's done.
 */
export function DayCard() {
  const t = today();
  const hour = new Date().getHours();
  const { top, save, row, streak } = useDay(t);
  const { data: brief } = useBrief();
  const [params, setParams] = useSearchParams();
  const [open, setOpen] = useState(params.get('shutdown') === '1');
  useEffect(() => {
    if (params.get('shutdown') === '1') (setOpen(true), params.delete('shutdown'), setParams(params, { replace: true }));
  }, [params, setParams]);
  const morning = hour < 12;
  const evening = hour >= 17;
  const lines = (morning ? brief?.morning.body : null)?.split('\n').filter((l) => !/^💻/.test(l)) ?? [];

  return (
    <Card className="!p-0 overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-micro font-black uppercase tracking-[0.25em] text-accent">
            {evening ? <Moon className="size-3.5" /> : <Sunrise className="size-3.5" />} {morning ? 'Formation lap' : evening ? 'Shutdown' : 'Today’s top 3'}
          </p>
          <Weather />
        </div>
        {streak > 0 && <span className="slant shrink-0 bg-surface-2 px-2 py-0.5 font-mono text-tiny font-bold">🏁 {streak}d</span>}
      </div>
      <div className="space-y-3 p-4">
        {lines.length > 0 && (
          <ul className="space-y-1 text-sm text-ink-2">
            {lines.slice(0, 7).map((l, i) => (
              <li key={i} className="leading-snug">
                {l}
              </li>
            ))}
          </ul>
        )}
        <TopThree items={top} onChange={(items) => void save({ intention: topJson(items) })} />
        {evening &&
          (row?.shutdown_at ? (
            <div className="checker-band flex items-center justify-between gap-3 rounded-md p-3">
              <span className="text-sm font-bold">🏁 Shut down at {new Date(row.shutdown_at).toTimeString().slice(0, 5)}</span>
              <button onClick={() => setOpen(true)} className="text-tiny font-bold uppercase text-accent">
                Reopen
              </button>
            </div>
          ) : (
            <Button className="w-full" onClick={() => (haptic(15), setOpen(true))}>
              <Flag className="size-4" /> Start shutdown · 5 min
            </Button>
          ))}
      </div>
      <ShutdownSheet open={open} onClose={() => setOpen(false)} />
    </Card>
  );
}

/** Five short steps to close the day: debrief, open loops, Daily 3, one good thing, tomorrow's grid. */
export function ShutdownSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = today();
  const tm = addDays(t, 1);
  const [step, setStep] = useState(0);
  const [doneAt, setDoneAt] = useState<string | null>(null);
  const { settings } = useSettings();
  const day = useDay(t);
  const tomorrow = useDay(tm);
  const { data: brief } = useBrief();
  const { data: tasks = [] } = useList<Task>('tasks');
  const tasksApi = useResource<Task>('tasks');
  const { habits, isDone, isDue, toggle } = useHabits();
  const story = useStory();
  const [win, setWin] = useState('');
  useEffect(() => {
    if (open) (setStep(0), setDoneAt(null), setWin(day.row?.win ?? ''));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const loops = tasks.filter((x) => !x.done && x.due && x.due.slice(0, 10) <= t);
  const habitsLeft = habits.filter((h) => isDue(h.id, t));
  const gym = dayTypeOn(tm, settings.gymShift ?? 0);
  const work = workDay(tm, workConfig(settings.work), settings.workOverrides);
  const tmPlans = tasks.filter((x) => !x.done && x.due?.slice(0, 10) === tm).sort((a, b) => (a.due ?? '').localeCompare(b.due ?? ''));
  const s = SHUTDOWN_STEPS[step];
  const last = step === SHUTDOWN_STEPS.length - 1;
  const finish = async () => {
    const at = new Date().toISOString();
    await day.save({ shutdown_at: at, win: win.trim() || null });
    navigator.vibrate?.([30, 50, 30, 50, 80]);
    setDoneAt(at);
  };

  return (
    <Sheet open={open} onClose={onClose} title={doneAt ? 'Chequered flag' : `${step + 1}/${SHUTDOWN_STEPS.length} · ${s.title}`}>
      {doneAt ? (
        <div className="space-y-4 text-center">
          <motion.div initial={{ scale: 0.6, rotate: -8, opacity: 0 }} animate={{ scale: 1, rotate: 0, opacity: 1 }} transition={{ type: 'spring', stiffness: 220, damping: 14 }} className="checker-band mx-auto h-24 w-full rounded-lg" />
          <p className="font-display text-3xl font-black uppercase italic">Day closed</p>
          <p className="text-sm text-ink-2">
            {day.streak + (day.row?.shutdown_at ? 0 : 1)} day{day.streak ? 's' : ''} in a row. Laptop lid down — tomorrow’s grid is set.
          </p>
          <div className="flex justify-center gap-2">
            <Link to="/life?journal=1" onClick={onClose} className="rounded-md bg-surface-2 px-3 py-2 text-sm font-bold">
              📓 Tonight’s journal
            </Link>
            <Button onClick={onClose}>Done</Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex gap-1">
            {SHUTDOWN_STEPS.map((x, i) => (
              <span key={x.id} className={cx('slant h-1.5 flex-1', i <= step ? 'bg-accent' : 'bg-surface-2')} />
            ))}
          </div>
          <p className="text-sm text-ink-3">{s.hint}</p>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={s.id} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.18 }} className="space-y-3">
              {s.id === 'debrief' && (
                <>
                  <ul className="space-y-1.5 rounded-xl border border-line bg-bg p-3 text-sm">
                    {(brief?.evening.body.split('\n') ?? []).filter((l) => !/^🥗/.test(l)).map((l, i) => (
                      <li key={i}>{l}</li>
                    ))}
                  </ul>
                  {day.top.length > 0 && (
                    <>
                      <p className="text-micro font-black uppercase tracking-[0.2em] text-ink-3">Today’s top 3</p>
                      <TopThree items={day.top} onChange={(items) => void day.save({ intention: topJson(items) })} />
                    </>
                  )}
                </>
              )}
              {s.id === 'loops' && (
                <>
                  {loops.length === 0 && habitsLeft.every((h) => isDone(h.id, t)) && <p className="rounded-xl bg-good/10 px-4 py-3 text-sm text-good">Nothing open. Clean race.</p>}
                  {loops.map((x) => (
                    <div key={x.id} className="flex items-center gap-2 rounded-md bg-bg px-3 py-2">
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold">{x.title}</span>
                      <button onClick={() => (haptic(10), tasksApi.update({ id: x.id, done: 1, done_at: new Date().toISOString() }))} className="rounded-md bg-green px-2 py-1 text-tiny font-black uppercase text-black">
                        Done
                      </button>
                      <button onClick={() => tasksApi.update({ id: x.id, due: toTomorrow(x.due, tm) })} className="rounded-md bg-surface-2 px-2 py-1 text-tiny font-black uppercase">
                        Tmrw
                      </button>
                      <button onClick={() => tasksApi.remove(x.id)} aria-label={`Delete ${x.title}`} className="p-1 text-ink-3">
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  ))}
                  {habitsLeft.length > 0 && (
                    <>
                      <p className="pt-1 text-micro font-black uppercase tracking-[0.2em] text-ink-3">Habits today</p>
                      <div className="flex flex-wrap gap-2">
                        {habitsLeft.map((h) => {
                          const on = isDone(h.id, t);
                          return (
                            <button key={h.id} onClick={() => toggle(h.id, t)} aria-pressed={on} className={cx('flex h-9 items-center gap-1.5 rounded-full border px-3 text-sm font-semibold', on ? 'border-transparent bg-green text-black' : 'border-line text-ink-2')}>
                              {h.emoji} {h.name}
                            </button>
                          );
                        })}
                      </div>
                    </>
                  )}
                </>
              )}
              {s.id === 'story' && <Daily3 compact className="!rounded-xl !p-3" />}
              {s.id === 'win' && (
                <>
                  <textarea value={win} onChange={(e) => setWin(e.target.value)} placeholder="One thing that went well today — big or tiny." rows={3} className="field w-full resize-none py-2.5 text-[15px]" />
                  <p className="text-micro font-black uppercase tracking-[0.2em] text-ink-3">Energy tank</p>
                  <div className="flex justify-between">
                    {ENERGY.map((e, i) => (
                      <button key={e} onClick={() => (haptic(10), void day.save({ energy: i + 1 }))} aria-pressed={day.row?.energy === i + 1} aria-label={`Energy ${i + 1} of 5`} className={cx('grid size-12 place-items-center rounded-xl text-2xl', day.row?.energy === i + 1 ? 'bg-accent-soft ring-1 ring-accent/40' : day.row?.energy ? 'opacity-40 grayscale' : '')}>
                        {e}
                      </button>
                    ))}
                  </div>
                </>
              )}
              {s.id === 'tomorrow' && (
                <>
                  <ul className="space-y-1 rounded-xl border border-line bg-bg p-3 text-sm">
                    <li>{gym === 'rest' ? '🛞 Rest day' : `🏋️ ${DAY_META[gym].label} day — ${DAY_META[gym].focus}`}</li>
                    {work.mode === 'office' && <li>🏢 Office — leave by {work.leaveBy}, login {work.shift?.login}</li>}
                    {work.mode === 'wfh' && <li>🏠 WFH — login {work.shift?.login}</li>}
                    {work.mode === 'leave' && <li>🌴 On leave</li>}
                    {tmPlans.slice(0, 4).map((x) => (
                      <li key={x.id}>
                        {x.kind === 'bill' ? '🧾' : x.kind === 'plan' ? '📍' : '⏰'} {x.due && x.due.length > 10 ? `${x.due.slice(11, 16)} ` : ''}
                        {x.title}
                      </li>
                    ))}
                  </ul>
                  <p className="text-micro font-black uppercase tracking-[0.2em] text-ink-3">Tomorrow’s top 3</p>
                  <TopThree items={tomorrow.top} placeholder="The one thing tomorrow must have" onChange={(items) => void tomorrow.save({ intention: topJson(items) }, tm)} />
                </>
              )}
            </motion.div>
          </AnimatePresence>
          <div className="flex items-center gap-2 pt-1">
            {step > 0 && (
              <Button variant="ghost" onClick={() => setStep(step - 1)}>
                <ArrowLeft className="size-4" /> Back
              </Button>
            )}
            <span className="flex-1 text-right text-tiny text-ink-3">{s.id === 'story' && story.answered < 3 ? `${story.answered}/3 answered — skip is fine` : ''}</span>
            {last ? (
              <Button onClick={finish}>
                <Flag className="size-4" /> Close the day
              </Button>
            ) : (
              <Button onClick={() => (s.id === 'win' && win.trim() !== (day.row?.win ?? '') && void day.save({ win: win.trim() || null }), setStep(step + 1))}>
                Next <ArrowRight className="size-4" />
              </Button>
            )}
          </div>
        </div>
      )}
    </Sheet>
  );
}
