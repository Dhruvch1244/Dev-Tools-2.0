import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Briefcase, Home, LogIn, LogOut, Plus, Settings2, Trash2 } from 'lucide-react';
import { useSettings } from '../lib/api';
import { addDays, haptic, today } from '../lib/format';
import { addMin, isConnectWeek, weekLabel, workConfig, workDay, workWeek, nextSwitch, type WorkConfig, type WorkMode, type WorkOverride } from '../core/work';
import { Button, Input, Sheet, cx } from './ui';

const MODES: { id: WorkMode; label: string; color: string }[] = [
  { id: 'office', label: 'Office', color: 'var(--accent)' },
  { id: 'wfh', label: 'WFH', color: 'var(--sky)' },
  { id: 'leave', label: 'Leave', color: 'var(--yellow)' },
  { id: 'off', label: 'Off', color: 'var(--ink-3)' },
];
const colorOf = (m: WorkMode) => MODES.find((x) => x.id === m)!.color;
const mins = (hm: string) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5));
const dur = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m` : `${m}m`);
const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/** Today's office day as a mini race timeline: leave → login → logout → home, with the next stop counting down. */
export function WorkCard() {
  const { settings, save } = useSettings();
  const cfg = workConfig(settings.work);
  const overrides = settings.workOverrides ?? {};
  const t = today();
  const [sel, setSel] = useState(t);
  const [edit, setEdit] = useState(false);
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);
  const day = workDay(sel, cfg, overrides);
  const week = workWeek(t, 7, cfg, overrides);
  const sw = nextSwitch(t, cfg);
  const nowMin = now.getHours() * 60 + now.getMinutes();

  const stops = day.shift
    ? day.mode === 'office'
      ? [
          { k: 'Leave', at: day.leaveBy! },
          { k: 'Login', at: day.shift.login },
          { k: 'Logout', at: day.shift.logout },
          { k: 'Home', at: day.homeBy! },
        ]
      : [
          { k: 'Login', at: day.shift.login },
          { k: 'Logout', at: day.shift.logout },
        ]
    : [];
  const isToday = sel === t;
  const next = isToday ? stops.find((s) => mins(s.at) > nowMin) : undefined;
  const span = stops.length ? [mins(stops[0].at), mins(stops.at(-1)!.at)] : [0, 1];
  const progress = isToday && stops.length ? Math.max(0, Math.min(1, (nowMin - span[0]) / (span[1] - span[0] || 1))) : 0;

  const override = (patch: WorkOverride | null) => {
    const { [sel]: _, ...rest } = overrides;
    // Setting a day back to what the schedule says anyway clears the override.
    const base = workDay(sel, cfg, {});
    const merged = patch && { ...overrides[sel], ...patch };
    const same = merged && !merged.in && !merged.out && (merged.mode ?? base.mode) === base.mode && (merged.shift ?? cfg.defaultShift) === cfg.defaultShift;
    save({ workOverrides: !merged || same ? rest : { ...rest, [sel]: merged } });
  };

  return (
    <div className="relative overflow-hidden rounded-xl border border-line bg-surface p-4">
      <span className="absolute inset-y-0 left-0 w-[3px]" style={{ background: colorOf(day.mode) }} />
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-micro font-black uppercase tracking-[0.25em] text-ink-3">
            Work
            <span className={cx('slant px-2 py-px tracking-normal', day.connect ? 'bg-accent text-white' : 'bg-sky/20 text-sky')}>{weekLabel(sel, cfg)}</span>
          </p>
          <p className="mt-1 flex items-center gap-2 text-2xl font-black uppercase italic leading-tight">
            {day.mode === 'office' ? <Briefcase className="size-5 text-accent" /> : day.mode === 'wfh' ? <Home className="size-5 text-sky" /> : null}
            {day.mode === 'office' ? 'Office' : day.mode === 'wfh' ? 'WFH' : day.mode === 'leave' ? 'On leave 🌴' : 'Day off'}
            {day.shift && <span className="text-sm font-bold normal-case not-italic text-ink-3">{day.shift.label} shift</span>}
          </p>
          <p className="text-xs text-ink-3">
            {next ? (
              <>
                <span className="font-bold text-ink">
                  {next.k} in {dur(mins(next.at) - nowMin)}
                </span>{' '}
                · {next.at}
              </>
            ) : isToday && stops.length ? (
              'Done for the day — chequered flag 🏁'
            ) : !isToday ? (
              new Date(`${sel}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' })
            ) : sw ? (
              `${sw.connect ? 'Connect' : 'Home'} weeks start ${new Date(`${sw.date}T12:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`
            ) : null}
          </p>
        </div>
        <button onClick={() => setEdit(true)} aria-label="Edit work schedule" className="grid size-10 shrink-0 place-items-center rounded-md border border-line text-ink-2">
          <Settings2 className="size-4" />
        </button>
      </div>

      {stops.length > 0 && (
        <div className="mt-4">
          <div className="relative h-1.5 rounded-full bg-surface-2">
            <motion.div className="absolute inset-y-0 left-0 rounded-full" style={{ background: colorOf(day.mode) }} initial={{ width: 0 }} animate={{ width: `${progress * 100}%` }} transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }} />
          </div>
          <div className="mt-2 grid" style={{ gridTemplateColumns: `repeat(${stops.length}, minmax(0,1fr))` }}>
            {stops.map((s, i) => {
              const passed = isToday && mins(s.at) <= nowMin;
              return (
                <div key={s.k} className={cx(i === 0 ? 'text-left' : i === stops.length - 1 ? 'text-right' : 'text-center')}>
                  <p className={cx('font-mono text-base font-bold tabular-nums', passed ? 'text-ink-3' : next?.k === s.k ? 'text-ink' : 'text-ink-2')}>{s.at}</p>
                  <p className={cx('text-micro font-bold uppercase tracking-wider', next?.k === s.k ? 'text-accent' : 'text-ink-3')}>{s.k}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {isToday && day.shift && <Clock day={day} onSet={(p) => override(p)} />}

      {/* Week strip: tap a day to view or change it */}
      <div className="mt-4 grid grid-cols-7 gap-1">
        {week.map((d) => (
          <button key={d.date} onClick={() => setSel(d.date)} className={cx('flex flex-col items-center gap-1 rounded-md py-1.5 transition', sel === d.date ? 'bg-surface-2 ring-1 ring-line-strong' : '')}>
            <span className="text-micro font-bold text-ink-3">{DOW[new Date(`${d.date}T12:00:00`).getDay()]}</span>
            <span className="text-mini font-bold tabular-nums">{Number(d.date.slice(8))}</span>
            <span className={cx('h-1.5 w-5 rounded-full', d.overridden && 'ring-1 ring-white/70')} style={{ background: colorOf(d.mode) }} />
          </button>
        ))}
      </div>

      <div className="mt-3 grid grid-cols-4 gap-1.5">
        {MODES.map((m) => (
          <button key={m.id} onClick={() => override({ mode: m.id })} className={cx('h-9 rounded-md text-mini font-bold uppercase transition', day.mode === m.id ? 'text-black' : 'bg-surface-2 text-ink-2')} style={day.mode === m.id ? { background: m.color } : undefined}>
            {m.label}
          </button>
        ))}
      </div>
      {(day.shift && cfg.shifts.length > 1) || day.overridden ? (
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {day.shift &&
            cfg.shifts.length > 1 &&
            cfg.shifts.map((s) => (
              <button key={s.id} onClick={() => override({ shift: s.id })} className={cx('h-9 rounded-md border px-2.5 text-mini font-bold', day.shift?.id === s.id ? 'border-ink-2 text-ink' : 'border-line text-ink-3')}>
                {s.label} <span className="font-mono">{s.login}</span>
              </button>
            ))}
          {day.overridden && (
            <button onClick={() => override(null)} className="ml-auto h-9 px-2 text-mini font-bold uppercase text-ink-3 underline">
              Reset day
            </button>
          )}
        </div>
      ) : null}

      <WorkSettings open={edit} onClose={() => setEdit(false)} cfg={cfg} onSave={(work) => save({ work })} />
    </div>
  );
}

function WorkSettings({ open, onClose, cfg, onSave }: { open: boolean; onClose: () => void; cfg: WorkConfig; onSave: (c: WorkConfig) => void }) {
  const [d, setD] = useState(cfg);
  useEffect(() => void (open && setD(cfg)), [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const t = today();
  const thisMonday = addDays(t, -((new Date(`${t}T12:00:00`).getDay() + 6) % 7));
  const set = (p: Partial<WorkConfig>) => setD({ ...d, ...p });
  const label = 'text-micro font-black uppercase tracking-[0.2em] text-ink-3';

  return (
    <Sheet open={open} onClose={onClose} title="Work schedule">
      <div className="space-y-5">
        <section>
          <p className={label}>Is this week a connect (office) week?</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {[true, false].map((c) => {
              // Re-anchor so this week becomes week 1 of a connect block, or week 1 of a home block.
              const anchor = c ? thisMonday : addDays(thisMonday, -7 * d.on);
              const on = c === isConnectWeek(t, d);
              return (
                <button key={String(c)} onClick={() => set({ anchor })} className={cx('h-11 rounded-md text-sm font-bold uppercase', on ? (c ? 'bg-accent text-white' : 'bg-sky text-black') : 'bg-surface-2 text-ink-2')}>
                  {c ? 'Yes — office' : 'No — home'}
                </button>
              );
            })}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <label className="text-xs text-ink-3">
              Office weeks in a row
              <Input type="number" inputMode="numeric" min={0} max={8} value={d.on} onChange={(e) => set({ on: Math.max(0, Math.min(8, Number(e.target.value) || 0)) })} />
            </label>
            <label className="text-xs text-ink-3">
              Then home weeks
              <Input type="number" inputMode="numeric" min={0} max={8} value={d.off} onChange={(e) => set({ off: Math.max(0, Math.min(8, Number(e.target.value) || 0)) })} />
            </label>
          </div>
          <p className="mt-2 text-tiny text-ink-3">{weekLabel(t, d)} now · next 8 weeks: {Array.from({ length: 8 }, (_, i) => (workDay(addDays(thisMonday, i * 7), d).connect ? '🏢' : '🏠')).join(' ')}</p>
        </section>

        <section>
          <p className={label}>Working days</p>
          <div className="mt-2 grid grid-cols-7 gap-1">
            {DOW.map((x, i) => (
              <button key={i} onClick={() => set({ days: d.days.includes(i) ? d.days.filter((y) => y !== i) : [...d.days, i].sort() })} className={cx('h-10 rounded-md text-sm font-bold', d.days.includes(i) ? 'bg-accent text-white' : 'bg-surface-2 text-ink-3')}>
                {x}
              </button>
            ))}
          </div>
        </section>

        <section>
          <p className={label}>Shifts</p>
          <div className="mt-2 space-y-2">
            {d.shifts.map((s, i) => (
              <div key={s.id} className="rounded-lg border border-line bg-bg p-2">
                <div className="flex items-center gap-2">
                  <button onClick={() => set({ defaultShift: s.id })} aria-label={`Make ${s.label} the usual shift`} className={cx('size-5 shrink-0 rounded-full border-2', d.defaultShift === s.id ? 'border-accent bg-accent' : 'border-line')} />
                  <input value={s.label} aria-label="Shift name" onChange={(e) => set({ shifts: d.shifts.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} className="field h-10 min-w-0 flex-1" />
                  {d.shifts.length > 1 && (
                    <button aria-label="Remove shift" onClick={() => set({ shifts: d.shifts.filter((_, j) => j !== i), defaultShift: d.defaultShift === s.id ? d.shifts.find((_, j) => j !== i)!.id : d.defaultShift })} className="grid size-9 shrink-0 place-items-center text-ink-3">
                      <Trash2 className="size-4" />
                    </button>
                  )}
                </div>
                <div className="mt-2 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                  <input type="time" value={s.login} onChange={(e) => set({ shifts: d.shifts.map((x, j) => (j === i ? { ...x, login: e.target.value } : x)) })} className="field h-10 min-w-0" aria-label={`${s.label} login`} />
                  <span className="text-tiny font-bold uppercase text-ink-3">to</span>
                  <input type="time" value={s.logout} onChange={(e) => set({ shifts: d.shifts.map((x, j) => (j === i ? { ...x, logout: e.target.value } : x)) })} className="field h-10 min-w-0" aria-label={`${s.label} logout`} />
                </div>
              </div>
            ))}
            <button onClick={() => set({ shifts: [...d.shifts, { id: `s${Date.now().toString(36)}`, label: 'Custom', login: '10:00', logout: '19:00' }] })} className="flex h-9 items-center gap-1.5 text-mini font-bold uppercase text-accent">
              <Plus className="size-4" /> Add shift
            </button>
          </div>
          <p className="mt-1 text-tiny text-ink-3">The filled dot is your usual shift. Switch a single day from the Today card.</p>
        </section>

        <section className="grid grid-cols-2 gap-2">
          <label className="text-xs text-ink-3">
            Commute (min, one way)
            <Input type="number" inputMode="numeric" min={0} max={240} value={d.commute} onChange={(e) => set({ commute: Math.max(0, Math.min(240, Number(e.target.value) || 0)) })} />
          </label>
          <label className="flex items-end gap-2 pb-2 text-sm">
            <input type="checkbox" checked={d.remind} onChange={(e) => set({ remind: e.target.checked })} className="size-5 accent-[var(--accent)]" />
            Push reminders
          </label>
        </section>
        <p className="-mt-3 text-tiny text-ink-3">
          Office days push: pack-up {d.commute ? `at ${addMin(addMin(d.shifts.find((s) => s.id === d.defaultShift)?.login ?? '09:30', -d.commute), -20)}` : ''}, leave now, log out, and a heads-up the evening before a connect week. WFH days push login and logout.
        </p>

        <section>
          <p className={label}>Pack list for office days</p>
          <Input className="mt-2" value={d.pack.join(', ')} onChange={(e) => set({ pack: e.target.value.split(',').map((x) => x.trimStart()) })} placeholder="ID card, Laptop + charger, Lunch box" />
          <p className="mt-1 text-tiny text-ink-3">Comma separated. “Gym bag” is added on gym days automatically.</p>
        </section>

        <Button className="w-full" onClick={() => (onSave({ ...d, pack: d.pack.map((x) => x.trim()).filter(Boolean) }), onClose())}>
          Save schedule
        </Button>
      </div>
    </Sheet>
  );
}

const hmNow = () => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/** Clock in/out for today: the real login time re-times the logout, home ETA and the day's reminders. */
function Clock({ day, onSet }: { day: ReturnType<typeof workDay>; onSet: (p: WorkOverride) => void }) {
  const { in: tin, out } = day.actual;
  const field = (v: string | undefined, k: 'in' | 'out', label: string) => (
    <label className="flex items-center gap-1.5 text-micro font-bold uppercase text-ink-3">
      {label}
      <input type="time" value={v ?? ''} onChange={(e) => onSet({ [k]: e.target.value || undefined })} className="field h-9 w-[6.5rem] !py-0 text-sm" />
    </label>
  );
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg bg-bg p-2">
      {!tin ? (
        <Button size="sm" onClick={() => (haptic(12), onSet({ in: hmNow() }))}>
          <LogIn className="size-4" /> Logged in now
        </Button>
      ) : (
        field(tin, 'in', 'In')
      )}
      {tin && !out && (
        <Button size="sm" variant="soft" onClick={() => (haptic(12), onSet({ out: hmNow() }))}>
          <LogOut className="size-4" /> Log out now
        </Button>
      )}
      {out && field(out, 'out', 'Out')}
      <span className="ml-auto text-tiny text-ink-3">{tin ? (out ? 'Day clocked' : `Logout ~${day.shift!.logout}`) : 'Plans shift to your real login'}</span>
    </div>
  );
}
