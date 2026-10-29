import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { AnimatePresence, motion } from 'motion/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, BellOff, CalendarCheck, CalendarDays, Check as CheckIcon, Copy, ExternalLink, Plus, RefreshCw, Trash2, Unplug, X } from 'lucide-react';
import { api, useList, useResource, useSettings } from '../lib/api';
import { addDays, parseDate, today } from '../lib/format';
import { listItem, spring } from '../lib/motion';
import { dayTypeOn } from '../core/gym';
import type { Habit, Routine, RoutineLog } from '../lib/types';
import { useToast } from '../components/toast';
import { Button, Card, Check, Input, Page, PageHeader, Rise, SectionTitle, Sheet, cx } from '../components/ui';

const DAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
type GStatus = { configured: boolean; connected: boolean; email: string | null; timezone: string; redirectUri: string };
export type GEvent = { id: string; title: string; start: string; end: string; allDay: boolean; link: string; fromRoutine: string | null; location?: string };

export function useGoogleEvents(from: string, to: string) {
  const { data: st } = useQuery({ queryKey: ['google-status'], queryFn: () => api<GStatus>('/google/status') });
  const q = useQuery({ queryKey: ['google-events', from, to], queryFn: () => api<GEvent[]>(`/google/events?from=${from}&to=${to}`), enabled: !!st?.connected, staleTime: 120_000, refetchInterval: 5 * 60_000 });
  return { events: q.data ?? [], connected: !!st?.connected, error: q.error as Error | null };
}

export function useRoutineLogs(from: string) {
  const qc = useQueryClient();
  const { data: logs = [] } = useQuery({ queryKey: ['routine_logs', from], queryFn: () => api<RoutineLog[]>(`/routine_logs?from=${from}`) });
  const toggle = useMutation({
    mutationFn: (v: { routine_id: string; date: string }) => api('/routine_logs/toggle', { method: 'POST', body: JSON.stringify(v) }),
    onMutate: (v) => qc.setQueryData<RoutineLog[]>(['routine_logs', from], (old = []) => (old.some((l) => l.routine_id === v.routine_id && l.date === v.date) ? old.filter((l) => !(l.routine_id === v.routine_id && l.date === v.date)) : [...old, { ...v, steps: null }])),
    onSettled: () => (qc.invalidateQueries({ queryKey: ['routine_logs'] }), qc.invalidateQueries({ queryKey: ['habit_logs'] })),
  });
  return { done: (id: string, date: string) => logs.some((l) => l.routine_id === id && l.date === date), toggle: toggle.mutate };
}

const days = (r: Routine): number[] => JSON.parse(r.days);
const minutesOf = (hm: string) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5));
const hmOf = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });

/** Today's routines and calendar events on one timeline. Shared with the Today page. */
export function TodaySchedule({ compact }: { compact?: boolean }) {
  const t = today();
  const { data: routines = [] } = useList<Routine>('routines');
  const { events, connected } = useGoogleEvents(t, t);
  const { done, toggle } = useRoutineLogs(t);
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);
  const dow = parseDate(t).getDay();
  type Item = { key: string; start: number; end: number; title: string; kind: 'routine' | 'event'; routine?: Routine; event?: GEvent };
  const items: Item[] = [
    ...routines.filter((r) => r.active && days(r).includes(dow)).map((r) => ({ key: `r${r.id}`, start: minutesOf(r.time), end: minutesOf(r.time) + r.duration_min, title: `${r.emoji ?? ''} ${r.name}`.trim(), kind: 'routine' as const, routine: r })),
    // Calendar copies of our own routines are already shown as routines.
    ...events.filter((e) => !e.fromRoutine && !e.allDay).map((e) => ({ key: `e${e.id}`, start: minutesOf(hmOf(e.start)), end: minutesOf(hmOf(e.end)), title: e.title, kind: 'event' as const, event: e })),
  ].sort((a, b) => a.start - b.start);
  const allDay = events.filter((e) => e.allDay);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const fmt = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  const nowIdx = items.findIndex((i) => i.start > nowMin);

  if (!items.length && !allDay.length) return <p className="py-4 text-sm text-ink-3">{compact ? 'Nothing scheduled today.' : 'Nothing scheduled today. Add a routine below or connect Google Calendar.'}</p>;
  return (
    <div>
      {allDay.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {allDay.map((e) => (
            <span key={e.id} className="slant bg-surface-2 px-2.5 py-0.5 text-[11px] font-bold">
              {e.title}
            </span>
          ))}
        </div>
      )}
      <ol className="relative space-y-1.5">
        {items.map((it, i) => {
          const live = nowMin >= it.start && nowMin < it.end;
          const past = nowMin >= it.end;
          const isDone = it.routine ? done(it.routine.id, t) : false;
          return (
            <motion.li key={it.key} initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }}>
              {i === nowIdx && (
                <div className="my-1 flex items-center gap-2" aria-label="Now">
                  <span className="font-mono text-[10px] font-bold text-accent-2">{fmt(nowMin)}</span>
                  <span className="h-[2px] flex-1 bg-accent" />
                </div>
              )}
              <div className={cx('flex items-center gap-3 rounded-md border-l-[3px] bg-bg px-3 py-2', live ? 'border-accent' : it.kind === 'event' ? 'border-sky' : 'border-line-strong', past && !live && 'opacity-60')}>
                <span className="w-24 shrink-0 font-mono text-xs text-ink-2">
                  {fmt(it.start)}–{fmt(it.end)}
                </span>
                <span className={cx('min-w-0 flex-1 truncate text-sm font-semibold', isDone && 'text-ink-3 line-through')}>{it.title}</span>
                {live && <span className="slant bg-accent px-2 text-[10px] font-black text-white">NOW</span>}
                {it.kind === 'event' ? (
                  <a href={it.event!.link} target="_blank" rel="noreferrer" className="text-ink-3 hover:text-ink" aria-label="Open in Google Calendar">
                    <CalendarDays className="size-4" />
                  </a>
                ) : (
                  <Check checked={isDone} onChange={() => toggle({ routine_id: it.routine!.id, date: t })} label={`Done: ${it.routine!.name}`} />
                )}
              </div>
            </motion.li>
          );
        })}
        {nowIdx === -1 && items.length > 0 && (
          <div className="my-1 flex items-center gap-2">
            <span className="font-mono text-[10px] font-bold text-accent-2">{fmt(nowMin)}</span>
            <span className="h-[2px] flex-1 bg-accent" />
          </div>
        )}
      </ol>
      {connected && <p className="mt-2 text-[10px] font-bold uppercase tracking-widest text-ink-3">Blue = Google Calendar</p>}
    </div>
  );
}

function GoogleCard() {
  const qc = useQueryClient();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const { data: st, refetch } = useQuery({ queryKey: ['google-status'], queryFn: () => api<GStatus>('/google/status') });
  const [id, setId] = useState('');
  const [secret, setSecret] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const g = params.get('google');
    if (!g) return;
    toast({
      message:
        g === 'connected'
          ? `Google Calendar connected · ${params.get('synced') ?? 0} routines synced`
          : g === 'access_denied'
            ? 'Google blocked sign-in: your consent screen is in Testing. Cloud console → Google Auth Platform → Audience → Publish app, then Connect again.'
            : `Google: ${g}`,
    });
    setParams({}, { replace: true });
    void refetch();
  }, [params, setParams, toast, refetch]);
  const local = location.hostname === 'localhost' || location.hostname === '127.0.0.1';

  if (!st) return null;
  return (
    <Card className="relative overflow-hidden">
      <SectionTitle>
        <span className="flex items-center gap-2">
          <CalendarCheck className="size-4 text-sky" /> Google Calendar
          {st.connected && <span className="slant bg-green px-2 text-[10px] font-black text-black">SYNCED</span>}
        </span>
      </SectionTitle>
      {st.connected ? (
        <div className="space-y-3">
          <p className="text-sm text-ink-2">
            Connected as <b className="text-ink">{st.email ?? 'your Google account'}</b>. Routines appear as weekly events in your primary calendar ({st.timezone}); your events show here and on Today.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="soft" disabled={busy} onClick={async () => (setBusy(true), toast({ message: `Synced ${(await api<{ synced: number }>('/google/sync', { method: 'POST' })).synced} routines` }), setBusy(false), qc.invalidateQueries({ queryKey: ['google-events'] }))}>
              <RefreshCw className={cx('size-4', busy && 'animate-spin')} /> Sync now
            </Button>
            <Button size="sm" variant="ghost" onClick={async () => (await api('/google/disconnect', { method: 'POST' }), void refetch())}>
              <Unplug className="size-4" /> Disconnect
            </Button>
          </div>
        </div>
      ) : !st.configured ? (
        <div className="space-y-3 text-sm text-ink-2">
          <p>One-time setup (~10 min). Google needs an OAuth client that belongs to you — the app then talks to your calendar directly from this laptop.</p>
          <ol className="list-decimal space-y-1.5 pl-5">
            <li>
              Open{' '}
              <a className="text-accent-2 underline" href="https://console.cloud.google.com/projectcreate" target="_blank" rel="noreferrer">
                Google Cloud console
              </a>{' '}
              → create a project (e.g. “Dev Tools”).
            </li>
            <li>
              <a className="text-accent-2 underline" href="https://console.cloud.google.com/apis/library/calendar-json.googleapis.com" target="_blank" rel="noreferrer">
                Enable the Google Calendar API
              </a>
              .
            </li>
            <li>
              <a className="text-accent-2 underline" href="https://console.cloud.google.com/auth/branding" target="_blank" rel="noreferrer">
                OAuth consent screen
              </a>{' '}
              → External → app name + your email → under <b>Audience</b> click <b>Publish app</b> (otherwise Google expires the sign-in every 7 days).
            </li>
            <li>
              <a className="text-accent-2 underline" href="https://console.cloud.google.com/auth/clients/create" target="_blank" rel="noreferrer">
                Create OAuth client
              </a>{' '}
              → type <b>Web application</b> → Authorized redirect URI:
              <button onClick={() => (navigator.clipboard.writeText(st.redirectUri), toast({ message: 'Redirect URI copied' }))} className="mt-1 flex w-full items-center gap-2 rounded-md border border-line bg-bg px-3 py-2 text-left font-mono text-xs text-ink">
                <span className="min-w-0 flex-1 break-all">{st.redirectUri}</span> <Copy className="size-3.5 shrink-0" />
              </button>
            </li>
            <li>Paste the client ID and secret below.</li>
          </ol>
          <Input placeholder="Client ID (…apps.googleusercontent.com)" value={id} onChange={(e) => setId(e.target.value)} className="font-mono text-xs" />
          <Input placeholder="Client secret" value={secret} onChange={(e) => setSecret(e.target.value)} className="font-mono text-xs" type="password" />
          <Button
            disabled={!id || !secret}
            onClick={async () => {
              try {
                await api('/google/config', { method: 'POST', body: JSON.stringify({ clientId: id, clientSecret: secret }) });
                void refetch();
              } catch (e) {
                toast({ message: (e as Error).message });
              }
            }}
          >
            Save credentials
          </Button>
        </div>
      ) : (
        <div className="space-y-3 text-sm text-ink-2">
          <p>Credentials saved. Sign in once to grant calendar access — Google will warn that the app is unverified (it's yours): click <b>Advanced → Go to … (unsafe)</b>.</p>
          {!local && !location.hostname.endsWith('.ts.net') && <p className="text-warn">Open this page on the laptop at http://localhost:4300/routines to sign in.</p>}
          <p className="font-mono text-[11px] text-ink-3">Redirect URI in use: {st.redirectUri}</p>
          <a href="/api/google/auth">
            <Button>
              <ExternalLink className="size-4" /> Connect Google Calendar
            </Button>
          </a>
        </div>
      )}
    </Card>
  );
}

type Draft = { id?: string; name: string; emoji: string; days: number[]; time: string; duration_min: number; steps: string[]; habit_id: string | null; remind: boolean; active: boolean };
const blank: Draft = { name: '', emoji: '⏱️', days: [1, 2, 3, 4, 5], time: '07:00', duration_min: 30, steps: [], habit_id: null, remind: true, active: true };

function Editor({ draft, onClose }: { draft: Draft | null; onClose: () => void }) {
  const { create, update, remove } = useResource<Routine>('routines');
  const habitsApi = useResource<Habit>('habits');
  const { data: habits = [] } = useList<Habit>('habits');
  const toast = useToast();
  const [d, setD] = useState<Draft>(draft ?? blank);
  const [step, setStep] = useState('');
  useEffect(() => {
    if (draft) setD(draft);
  }, [draft]);
  const save = async () => {
    let habit_id = d.habit_id;
    if (habit_id === 'new') habit_id = (await habitsApi.create({ name: d.name, emoji: d.emoji, archived: 0 })).id;
    const row = { name: d.name.trim(), emoji: d.emoji, days: JSON.stringify([...d.days].sort()), time: d.time, duration_min: d.duration_min, steps: JSON.stringify(d.steps), habit_id, remind: d.remind ? 1 : 0, active: d.active ? 1 : 0 };
    if (d.id) update({ id: d.id, ...row });
    else await create(row);
    toast({ message: d.id ? 'Routine updated' : 'Routine added' });
    onClose();
  };
  return (
    <Sheet open={!!draft} onClose={onClose} title={d.id ? 'Edit routine' : 'New routine'}>
      <div className="space-y-4">
        <div className="flex gap-2">
          <input aria-label="Emoji" value={d.emoji} onChange={(e) => setD({ ...d, emoji: [...e.target.value].slice(-1).join('') })} className="field w-14 text-center text-lg" />
          <Input placeholder="Morning walk, DSA practice, Gym…" value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} />
        </div>
        <div className="grid grid-cols-7 gap-1">
          {DAY_LETTERS.map((l, i) => (
            <button key={i} onClick={() => setD({ ...d, days: d.days.includes(i) ? d.days.filter((x) => x !== i) : [...d.days, i] })} aria-pressed={d.days.includes(i)} aria-label={DAY_NAMES[i]} className={cx('h-11 rounded-md text-sm font-black', d.days.includes(i) ? 'bg-accent text-white' : 'bg-surface-2 text-ink-3')}>
              {l}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-[10px] font-black uppercase tracking-widest text-ink-3">
            Start
            <input type="time" value={d.time} onChange={(e) => setD({ ...d, time: e.target.value })} className="field mt-1 w-full" />
          </label>
          <label className="text-[10px] font-black uppercase tracking-widest text-ink-3">
            Minutes
            <Input inputMode="numeric" value={d.duration_min} onChange={(e) => setD({ ...d, duration_min: Number(e.target.value) || 0 })} className="mt-1" />
          </label>
        </div>
        <div>
          <p className="mb-1 text-[10px] font-black uppercase tracking-widest text-ink-3">Steps (optional)</p>
          <ul className="mb-2 space-y-1">
            {d.steps.map((s, i) => (
              <li key={i} className="flex items-center gap-2 rounded bg-bg px-3 py-1.5 text-sm">
                <span className="flex-1">{s}</span>
                <button aria-label="Remove step" onClick={() => setD({ ...d, steps: d.steps.filter((_, j) => j !== i) })} className="text-ink-3 hover:text-danger">
                  <X className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
          <form className="flex gap-2" onSubmit={(e) => (e.preventDefault(), step.trim() && setD({ ...d, steps: [...d.steps, step.trim()] }), setStep(''))}>
            <Input placeholder="e.g. 10 min stretch" value={step} onChange={(e) => setStep(e.target.value)} />
            <Button type="submit" variant="soft">
              Add
            </Button>
          </form>
        </div>
        <label className="block text-[10px] font-black uppercase tracking-widest text-ink-3">
          Counts as habit
          <select value={d.habit_id ?? ''} onChange={(e) => setD({ ...d, habit_id: e.target.value || null })} className="field mt-1 w-full text-sm normal-case tracking-normal">
            <option value="">— none —</option>
            <option value="new">＋ New habit “{d.name || 'this routine'}”</option>
            {habits.filter((h) => !h.archived).map((h) => (
              <option key={h.id} value={h.id}>
                {h.emoji} {h.name}
              </option>
            ))}
          </select>
        </label>
        <div className="flex gap-2">
          <Button size="sm" variant={d.remind ? 'soft' : 'ghost'} onClick={() => setD({ ...d, remind: !d.remind })}>
            {d.remind ? <Bell className="size-4" /> : <BellOff className="size-4" />} {d.remind ? 'Push reminder on' : 'No reminder'}
          </Button>
          <Button size="sm" variant={d.active ? 'soft' : 'ghost'} onClick={() => setD({ ...d, active: !d.active })}>
            {d.active ? 'Active' : 'Paused'}
          </Button>
        </div>
        <div className="flex gap-2">
          <Button className="h-12 flex-1" disabled={!d.name.trim() || !d.days.length} onClick={() => void save()}>
            Save routine
          </Button>
          {d.id && (
            <Button className="h-12" variant="danger" onClick={() => (remove(d.id!), onClose())}>
              <Trash2 className="size-4" />
            </Button>
          )}
        </div>
      </div>
    </Sheet>
  );
}

export function RoutinesPage() {
  const { settings } = useSettings();
  const { data: routines = [] } = useList<Routine>('routines');
  const { data: habits = [] } = useList<Habit>('habits');
  const { data: g } = useQuery({ queryKey: ['google-status'], queryFn: () => api<GStatus>('/google/status') });
  const weekFrom = addDays(today(), -6);
  const { done } = useRoutineLogs(weekFrom);
  const [editing, setEditing] = useState<Draft | null>(null);
  const shift = settings.gymShift ?? 0;
  // The split is 7 days long, so each weekday keeps the same session type — "training days" is a fixed set.
  const gymDays = useMemo(() => [0, 1, 2, 3, 4, 5, 6].filter((wd) => {
    const d = new Date();
    d.setDate(d.getDate() + ((wd - d.getDay() + 7) % 7));
    return dayTypeOn(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`, shift) !== 'rest';
  }), [shift]);
  const templates: Draft[] = [
    { ...blank, name: 'Gym', emoji: '🏋️', days: gymDays, time: '19:00', duration_min: 90, steps: ['Warm-up 10 min', 'Main lifts', 'Accessories', 'Stretch'] },
    { ...blank, name: 'DSA practice', emoji: '💻', days: [1, 2, 3, 4, 5, 6], time: '21:00', duration_min: 75, steps: ["Today's 2 laps", 'Revision queue', 'Notes'] },
    { ...blank, name: 'Morning walk', emoji: '🚶', days: [0, 1, 2, 3, 4, 5, 6], time: '06:30', duration_min: 45 },
    { ...blank, name: 'Badminton', emoji: '🏸', days: [2, 4, 6], time: '18:00', duration_min: 90 },
    { ...blank, name: 'Wind-down', emoji: '🌙', days: [0, 1, 2, 3, 4, 5, 6], time: '22:30', duration_min: 30, steps: ['Phone away', 'Journal', 'Read 15 min'] },
  ];
  const toDraft = (r: Routine): Draft => ({ id: r.id, name: r.name, emoji: r.emoji ?? '⏱️', days: days(r), time: r.time, duration_min: r.duration_min, steps: r.steps ? JSON.parse(r.steps) : [], habit_id: r.habit_id, remind: !!r.remind, active: !!r.active });
  const week = Array.from({ length: 7 }, (_, i) => addDays(weekFrom, i));

  return (
    <Page>
      <PageHeader eyebrow="Paddock · Routines" title="Routines" action={<Button onClick={() => setEditing({ ...blank })}><Plus className="size-4" /> New routine</Button>} />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card>
          <SectionTitle>Today</SectionTitle>
          <TodaySchedule />
        </Card>
        <Rise>
          <GoogleCard />
        </Rise>
      </div>

      <Rise className="mt-4">
        <SectionTitle>Your routines</SectionTitle>
        {routines.length === 0 && (
          <div className="mb-3 rounded-lg border border-dashed border-line p-4">
            <p className="mb-3 text-sm text-ink-2">Start from a template:</p>
            <div className="flex flex-wrap gap-2">
              {templates.map((t) => (
                <Button key={t.name} size="sm" variant="soft" onClick={() => setEditing(t)}>
                  {t.emoji} {t.name}
                </Button>
              ))}
            </div>
          </div>
        )}
        <ul className="grid gap-3 md:grid-cols-2">
          <AnimatePresence initial={false}>
            {routines.map((r) => {
              const hab = habits.find((h) => h.id === r.habit_id);
              return (
                <motion.li key={r.id} layout {...listItem}>
                  <button onClick={() => setEditing(toDraft(r))} className={cx('block w-full rounded-xl border bg-surface p-4 text-left transition hover:border-accent', r.active ? 'border-line' : 'border-line opacity-50')}>
                    <div className="flex items-start gap-3">
                      <span className="text-2xl">{r.emoji}</span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-bold">{r.name}</p>
                        <p className="font-mono text-xs text-ink-3">
                          {r.time} · {r.duration_min} min{hab ? ` · habit: ${hab.name}` : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 text-ink-3">
                        {!!r.remind && <Bell className="size-3.5" />}
                        {r.gcal_event_id && <CalendarCheck className="size-4 text-sky" aria-label="On Google Calendar" />}
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-7 gap-1">
                      {week.map((date) => {
                        const wd = parseDate(date).getDay();
                        const on = days(r).includes(wd);
                        const ok = done(r.id, date);
                        return (
                          <div key={date} className="text-center">
                            <p className="text-[9px] font-bold uppercase text-ink-3">{DAY_LETTERS[wd]}</p>
                            <motion.span initial={false} animate={{ scale: ok ? [1, 1.25, 1] : 1 }} transition={spring} className={cx('mx-auto mt-0.5 grid size-6 place-items-center rounded', !on ? 'bg-transparent' : ok ? 'bg-green text-black' : 'bg-surface-2')}>
                              {ok && <CheckIcon className="size-3.5" />}
                            </motion.span>
                          </div>
                        );
                      })}
                    </div>
                  </button>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
        {routines.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {templates.filter((t) => !routines.some((r) => r.name === t.name)).map((t) => (
              <Button key={t.name} size="sm" variant="ghost" onClick={() => setEditing(t)}>
                <Plus className="size-3.5" /> {t.emoji} {t.name}
              </Button>
            ))}
          </div>
        )}
        {g?.connected === false && routines.length > 0 && <p className="mt-3 text-xs text-ink-3">Connect Google Calendar above to put these on your calendar.</p>}
      </Rise>
      <Editor draft={editing} onClose={() => setEditing(null)} />
    </Page>
  );
}

