import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { AnimatePresence, motion } from 'motion/react';
import { BellRing, Lock, Minus, Plus, Radio, RefreshCw, Trash2, Unlock } from 'lucide-react';
import { useList, useSettings } from '../lib/api';
import { addDays, haptic, today } from '../lib/format';
import { useSeason } from '../lib/dsa';
import { problemsForDay } from '../core/dsa/plan';
import { workConfig } from '../core/work';
import { cookConfig } from '../core/cook';
import { nextContact } from '../core/people';
import { DEFAULT_PREFS, REMIND_KINDS, planText, planWeek, type Block, type BlockKind, type DayPlan, type PlanPrefs } from '../core/weekPlan';
import type { PersonRow, Routine } from '../lib/types';
import { useGoogleEvents } from './Routines';
import { useToast } from '../components/toast';
import { Button, Page, PageHeader, Rise, Sheet, cx } from '../components/ui';

const COLOR: Record<BlockKind, string> = {
  work: 'var(--sky)',
  commute: 'var(--ink-3)',
  gym: 'var(--accent)',
  dsa: 'var(--purple)',
  walk: 'var(--green)',
  meal: 'var(--yellow)',
  cook: 'var(--yellow)',
  pack: 'var(--ink-2)',
  shop: 'var(--green)',
  review: 'var(--purple)',
  winddown: 'var(--ink-3)',
  routine: 'var(--green)',
  event: 'var(--sky)',
  call: 'var(--pink, #ff7ac6)',
};
const mins = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const hm = (n: number) => `${String(Math.floor(((n % 1440) + 1440) % 1440 / 60)).padStart(2, '0')}:${String(((n % 60) + 60) % 60).padStart(2, '0')}`;

/** Race strategy: the week auto-planned around office/WFH days; lock it in to get reminders. */
export function PlanPage() {
  const { settings, save } = useSettings();
  const toast = useToast();
  const nav = useNavigate();
  const t = today();
  const end = addDays(t, 6);
  const { data: routines = [] } = useList<Routine>('routines');
  const { data: people = [] } = useList<PersonRow>('people');
  const { events } = useGoogleEvents(t, end);
  const { start } = useSeason();
  const prefs: PlanPrefs = { ...DEFAULT_PREFS, ...(settings.planPrefs ?? {}) };
  const [sel, setSel] = useState(t);
  const [edit, setEdit] = useState<Block | null>(null);

  const fresh = useMemo(
    () =>
      planWeek({
        from: t,
        work: workConfig(settings.work),
        overrides: settings.workOverrides,
        gymShift: settings.gymShift ?? 0,
        prefs,
        dsaCount: (d) => problemsForDay(start, d).length,
        routines: routines.filter((r) => r.active).map((r) => ({ name: `${r.emoji ?? ''} ${r.name}`.trim(), time: r.time, duration_min: r.duration_min, days: JSON.parse(r.days) })),
        events: events.filter((e) => !e.allDay && !e.fromRoutine).map((e) => ({ date: e.start.slice(0, 10), title: e.title, start: new Date(e.start).toTimeString().slice(0, 5), end: new Date(e.end).toTimeString().slice(0, 5) })),
        calls: (d) => people.filter((p) => nextContact(p, d) === d).map((p) => p.name),
        cookAt: cookConfig(settings.cook).at,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, settings.work, settings.workOverrides, settings.gymShift, settings.planPrefs, settings.cook, start, routines, people, events],
  );
  // A locked day keeps your edits; unlocked days follow the live plan.
  const locked = settings.weekPlan?.days ?? {};
  const days: DayPlan[] = fresh.map((d) => locked[d.date] ?? d);
  const day = days.find((d) => d.date === sel) ?? days[0];
  const isLocked = !!locked[day.date];

  const lockAll = () => {
    save({ weekPlan: { days: Object.fromEntries(days.map((d) => [d.date, d])), remind: true } });
    haptic(15);
    toast({ message: 'Plan locked — reminders 10 min before each block' });
  };
  const unlock = () => save({ weekPlan: { ...settings.weekPlan, days: {} } });
  const editBlock = (b: Block, patch: Partial<Block> | null) => {
    const next = { ...day, blocks: patch ? day.blocks.map((x) => (x.id === b.id ? { ...x, ...patch } : x)).sort((a, z) => mins(a.start) - mins(z.start)) : day.blocks.filter((x) => x.id !== b.id) };
    save({ weekPlan: { remind: true, ...settings.weekPlan, days: { ...locked, [day.date]: next } } });
  };

  const first = mins(prefs.wake);
  const last = mins(prefs.sleep);
  const PX = 1.15; // px per minute

  return (
    <Page>
      <PageHeader
        eyebrow="Auto-planned around office & WFH"
        title="Race strategy"
        action={
          Object.keys(locked).length ? (
            <Button variant="ghost" onClick={unlock}>
              <Unlock className="size-4" /> Unlock
            </Button>
          ) : (
            <Button onClick={lockAll}>
              <Lock className="size-4" /> Lock in week
            </Button>
          )
        }
      />

      <Rise className="no-scrollbar -mx-4 mb-4 flex gap-2 overflow-x-auto px-4">
        {days.map((d) => {
          const dt = new Date(`${d.date}T12:00:00`);
          const gym = d.blocks.find((b) => b.kind === 'gym');
          return (
            <button key={d.date} onClick={() => setSel(d.date)} className={cx('flex w-[4.6rem] shrink-0 flex-col items-center gap-0.5 rounded-xl border py-2', sel === d.date ? 'border-accent bg-accent-soft' : 'border-line bg-surface')}>
              <span className="text-micro font-black uppercase text-ink-3">{d.date === t ? 'Today' : dt.toLocaleDateString(undefined, { weekday: 'short' })}</span>
              <span className="text-lg font-black tabular-nums">{dt.getDate()}</span>
              <span className={cx('text-micro font-bold uppercase', d.label === 'Office' ? 'text-accent' : d.label === 'WFH' ? 'text-sky' : 'text-ink-3')}>{d.label}</span>
              <span className="h-1 w-6 rounded-full" style={{ background: gym ? 'var(--accent)' : 'var(--green)' }} title={gym ? gym.title : 'Rest'} />
              {locked[d.date] && <Lock className="size-3 text-ink-3" />}
            </button>
          );
        })}
      </Rise>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="relative rounded-xl border border-line bg-surface p-3" style={{ height: (last - first) * PX + 24 }}>
          {Array.from({ length: Math.ceil((last - first) / 60) + 1 }, (_, i) => first - (first % 60) + i * 60)
            .filter((x) => x >= first && x <= last)
            .map((x) => (
              <div key={x} className="absolute inset-x-3 border-t border-line/60" style={{ top: 12 + (x - first) * PX }}>
                <span className="absolute -top-2 left-0 bg-surface pr-1 font-mono text-micro text-ink-3">{hm(x)}</span>
              </div>
            ))}
          <AnimatePresence initial={false}>
            {day.blocks.map((b, i) => {
              const top = 12 + Math.max(0, mins(b.start) - first) * PX;
              const h = Math.max(22, (mins(b.end) - mins(b.start)) * PX - 2);
              const small = h < 40;
              return (
                <motion.button
                  key={b.id}
                  layout
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ delay: i * 0.02 }}
                  onClick={() => !b.fixed && setEdit(b)}
                  className={cx('absolute left-12 right-3 overflow-hidden rounded-md border-l-[3px] px-2 text-left', b.fixed ? 'bg-surface-2/70' : 'bg-bg hover:bg-surface-2', small ? 'flex items-center gap-2' : 'flex flex-col justify-start py-1')}
                  style={{ top, height: h, borderColor: COLOR[b.kind] }}
                >
                  <span className={cx('font-mono text-tiny text-ink-3', small && 'shrink-0')}>{b.start}{!small && `–${b.end}`}</span>
                  <span className={cx('block truncate font-bold', small ? 'text-mini' : 'text-sm')}>
                    {REMIND_KINDS.includes(b.kind) && isLocked && <BellRing className="mr-1 inline size-3 text-accent" />}
                    {b.title}
                  </span>
                  {!small && b.note && <span className="block truncate text-tiny text-ink-3">{b.note}</span>}
                </motion.button>
              );
            })}
          </AnimatePresence>
        </div>

        <div className="space-y-3">
          <div className="rounded-xl border border-line bg-surface p-4">
            <p className="text-micro font-black uppercase tracking-[0.2em] text-ink-3">Day summary</p>
            <p className="mt-1 text-2xl font-black italic">{Math.floor(day.free / 60)}h {day.free % 60}m free</p>
            <ul className="mt-2 space-y-1 text-sm">
              {day.blocks
                .filter((b) => ['gym', 'dsa', 'walk', 'call', 'shop'].includes(b.kind))
                .map((b) => (
                  <li key={b.id} className="flex gap-2">
                    <span className="font-mono text-ink-3">{b.start}</span> {b.title}
                  </li>
                ))}
            </ul>
            <p className="mt-3 text-tiny text-ink-3">{isLocked ? 'Locked — tap a block to move it; you get a push 10 min before gym, DSA, walks, calls and errands.' : 'Live plan — it re-flows when your shift, routines or calendar change. Lock it to get reminders.'}</p>
          </div>
          <div className="rounded-xl border border-line bg-surface p-4">
            <p className="text-micro font-black uppercase tracking-[0.2em] text-ink-3">Preferences</p>
            <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-ink-3">
              <label>
                Wake
                <input type="time" value={prefs.wake} onChange={(e) => save({ planPrefs: { ...prefs, wake: e.target.value } })} className="field mt-1" />
              </label>
              <label>
                Sleep
                <input type="time" value={prefs.sleep} onChange={(e) => save({ planPrefs: { ...prefs, sleep: e.target.value } })} className="field mt-1" />
              </label>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-1">
              {(['auto', 'morning', 'evening'] as const).map((g) => (
                <button key={g} onClick={() => save({ planPrefs: { ...prefs, gymWhen: g } })} className={cx('h-9 rounded-md text-mini font-bold uppercase', prefs.gymWhen === g ? 'bg-accent text-white' : 'bg-surface-2 text-ink-2')}>
                  Gym {g}
                </button>
              ))}
            </div>
            <div className="mt-2 grid grid-cols-3 gap-1">
              {[45, 60, 75].map((n) => (
                <button key={n} onClick={() => save({ planPrefs: { ...prefs, gymMin: n } })} className={cx('h-9 rounded-md text-mini font-bold', prefs.gymMin === n ? 'bg-ink text-bg' : 'bg-surface-2 text-ink-2')}>
                  {n} min
                </button>
              ))}
            </div>
          </div>
          <Button variant="soft" className="w-full" onClick={() => nav(`/pitwall?q=${encodeURIComponent(`Here's my auto-planned week. Review it against my goals and suggest changes (as action cards where useful):\n${planText(days)}`)}`)}>
            <Radio className="size-4" /> Ask Pit Wall to tweak it
          </Button>
          {isLocked && (
            <Button variant="ghost" className="w-full" onClick={() => save({ weekPlan: { ...settings.weekPlan, days: Object.fromEntries(Object.entries(locked).filter(([k]) => k !== day.date)) } })}>
              <RefreshCw className="size-4" /> Re-plan this day
            </Button>
          )}
        </div>
      </div>

      <Sheet open={!!edit} onClose={() => setEdit(null)} title={edit?.title}>
        {edit && (
          <div className="space-y-4">
            <p className="text-center font-mono text-3xl font-bold">
              {edit.start}–{edit.end}
            </p>
            <div className="grid grid-cols-4 gap-2">
              {[-30, -15, 15, 30].map((d) => (
                <Button
                  key={d}
                  variant="soft"
                  onClick={() => {
                    const p = { start: hm(mins(edit.start) + d), end: hm(mins(edit.end) + d) };
                    editBlock(edit, p);
                    setEdit({ ...edit, ...p });
                  }}
                >
                  {d < 0 ? <Minus className="size-4" /> : <Plus className="size-4" />} {Math.abs(d)}
                </Button>
              ))}
            </div>
            <Button variant="danger" className="w-full" onClick={() => (editBlock(edit, null), setEdit(null))}>
              <Trash2 className="size-4" /> Skip this block
            </Button>
            <p className="text-center text-tiny text-ink-3">Editing locks this day so your change sticks.</p>
          </div>
        )}
      </Sheet>
    </Page>
  );
}
