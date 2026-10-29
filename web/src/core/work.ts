// Office schedule: connect weeks (in the office) alternate with non-connect weeks (work from home)
// in fixed blocks, e.g. 2 weeks on / 2 weeks off, anchored on the Monday of a connect week.
// A day resolves to office / WFH / off with its shift times, the leave-by time (login − commute)
// and home ETA (logout + commute). Per-day overrides (leave, swap to WFH, late shift) win.
// Pure: no React, no I/O — the server's reminders and the Today page use the same answers.

export type Shift = { id: string; label: string; login: string; logout: string };
export type WorkMode = 'office' | 'wfh' | 'off' | 'leave';
export type WorkOverride = { mode?: WorkMode; shift?: string };
export type WorkConfig = {
  /** Monday (YYYY-MM-DD) of any connect week. */
  anchor: string;
  /** Weeks in the office, then weeks at home, repeating. */
  on: number;
  off: number;
  /** Working weekdays, 0 = Sunday. */
  days: number[];
  shifts: Shift[];
  defaultShift: string;
  /** One-way commute in minutes. */
  commute: number;
  /** Push leave-by, logout and connect-week reminders. */
  remind: boolean;
  /** Things to grab before leaving on office days. */
  pack: string[];
};

export const DEFAULT_WORK: WorkConfig = {
  anchor: '2026-10-26',
  on: 2,
  off: 2,
  days: [1, 2, 3, 4, 5],
  shifts: [
    { id: 'early', label: 'Early', login: '09:30', logout: '18:00' },
    { id: 'late', label: 'Late', login: '11:00', logout: '20:00' },
  ],
  defaultShift: 'early',
  commute: 40,
  remind: true,
  pack: ['ID card', 'Laptop + charger', 'Lunch box', 'Water bottle'],
};

export const workConfig = (w?: Partial<WorkConfig> | null): WorkConfig => ({ ...DEFAULT_WORK, ...(w ?? {}), shifts: w?.shifts?.length ? w.shifts : DEFAULT_WORK.shifts });

const DAY = 86_400_000;
const utc = (d: string) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
export const addMin = (hm: string, n: number) => {
  const t = (((Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5)) + n) % 1440) + 1440) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
};
export const dow = (d: string) => new Date(utc(d)).getUTCDay();
/** Monday of the week containing `d`. */
export const mondayOf = (d: string) => iso(utc(d) - ((dow(d) + 6) % 7) * DAY);

/** Is the week containing `d` a connect (office) week? */
export function isConnectWeek(d: string, cfg: WorkConfig) {
  const cycle = Math.max(1, cfg.on + cfg.off);
  const weeks = Math.round((utc(mondayOf(d)) - utc(mondayOf(cfg.anchor))) / (7 * DAY));
  return (((weeks % cycle) + cycle) % cycle) < cfg.on;
}

export type WorkDay = {
  date: string;
  mode: WorkMode;
  connect: boolean;
  /** Set on office and WFH days. */
  shift: Shift | null;
  /** Office days only: when to walk out of the door, and when you're home. */
  leaveBy: string | null;
  homeBy: string | null;
  overridden: boolean;
};

export function workDay(date: string, cfg: WorkConfig, overrides: Record<string, WorkOverride> = {}): WorkDay {
  const connect = isConnectWeek(date, cfg);
  const o = overrides[date];
  const workday = cfg.days.includes(dow(date));
  const mode: WorkMode = o?.mode ?? (!workday ? 'off' : connect ? 'office' : 'wfh');
  const shift = mode === 'office' || mode === 'wfh' ? (cfg.shifts.find((s) => s.id === (o?.shift ?? cfg.defaultShift)) ?? cfg.shifts[0]) : null;
  const office = mode === 'office' && shift;
  return {
    date,
    mode,
    connect,
    shift,
    leaveBy: office ? addMin(shift.login, -cfg.commute) : null,
    homeBy: office ? addMin(shift.logout, cfg.commute) : null,
    overridden: !!o,
  };
}

/** The next `n` days from `from`, for a week strip. */
export const workWeek = (from: string, n: number, cfg: WorkConfig, overrides?: Record<string, WorkOverride>) => Array.from({ length: n }, (_, i) => workDay(iso(utc(from) + i * DAY), cfg, overrides));

/** "Connect week 1 of 2" / "Home week 2 of 2" for the week containing `d`. */
export function weekLabel(d: string, cfg: WorkConfig) {
  const cycle = Math.max(1, cfg.on + cfg.off);
  const weeks = Math.round((utc(mondayOf(d)) - utc(mondayOf(cfg.anchor))) / (7 * DAY));
  const pos = ((weeks % cycle) + cycle) % cycle;
  return pos < cfg.on ? `Connect week ${pos + 1} of ${cfg.on}` : `Home week ${pos - cfg.on + 1} of ${cfg.off}`;
}

/** When the next block of the other kind starts (Monday), e.g. the first home week after this connect block. */
export function nextSwitch(d: string, cfg: WorkConfig) {
  const now = isConnectWeek(d, cfg);
  let m = mondayOf(d);
  for (let i = 0; i < 60; i++) {
    m = iso(utc(m) + 7 * DAY);
    if (isConnectWeek(m, cfg) !== now) return { date: m, connect: !now };
  }
  return null;
}

export type WorkPing = { id: string; at: string; title: string; body: string };

/**
 * The automatic reminders for one day: pack-up and leave-by on office days, logout, and a heads-up
 * the evening before a connect block starts. `gymDay` adds the gym bag to the pack list.
 */
export function workPings(date: string, cfg: WorkConfig, overrides: Record<string, WorkOverride> = {}, gymDay?: string | null): WorkPing[] {
  if (!cfg.remind) return [];
  const w = workDay(date, cfg, overrides);
  const out: WorkPing[] = [];
  if (w.mode === 'office' && w.shift && w.leaveBy) {
    const pack = [...cfg.pack, ...(gymDay ? ['Gym bag'] : [])];
    out.push({ id: 'pack', at: addMin(w.leaveBy, -20), title: `🎒 Out-lap in 20 min — leave by ${w.leaveBy}`, body: pack.length ? `Pack: ${pack.join(' · ')}` : `Login ${w.shift.login}` });
    out.push({ id: 'leave', at: w.leaveBy, title: `🏎️ Lights out — leave now`, body: `${cfg.commute} min to the office · login ${w.shift.login}` });
    out.push({ id: 'logout', at: w.shift.logout, title: `🏁 Chequered flag — log out`, body: `Home by ${w.homeBy}${gymDay ? ` · ${gymDay} at the gym after` : ''}` });
  } else if (w.mode === 'wfh' && w.shift) {
    out.push({ id: 'login', at: addMin(w.shift.login, -5), title: `💻 WFH login at ${w.shift.login}`, body: 'Home week — no commute today' });
    out.push({ id: 'logout', at: w.shift.logout, title: `🏁 Log out — day done`, body: gymDay ? `${gymDay} next` : 'Go move a bit' });
  }
  // Evening before a connect block's first office day.
  const tomorrow = iso(utc(date) + DAY);
  const t = workDay(tomorrow, cfg, overrides);
  const firstOfBlock = t.mode === 'office' && !isConnectWeek(date, cfg) && t.leaveBy;
  if (firstOfBlock || (t.mode === 'office' && w.mode !== 'office' && t.leaveBy)) {
    out.push({ id: 'eve', at: '21:00', title: firstOfBlock ? '🚦 Connect week starts tomorrow' : '🚦 Office tomorrow', body: `Leave by ${t.leaveBy} · login ${t.shift!.login} — pack tonight` });
  }
  return out;
}
