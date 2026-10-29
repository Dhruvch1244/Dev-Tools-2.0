import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router';
import { Flag, MapPin, Pause, Play, Plus, Square, Trash2 } from 'lucide-react';
import { api, useList, useResource, useSettings } from '../lib/api';
import { addDays, isoDate, parseDate, relativeDay, today } from '../lib/format';
import { listItem } from '../lib/motion';
import { SPORTS, acceptFix, estimateKcal, fmtDuration, pace, projectTrack, splits, trackDistanceKm, type BadmintonDetails, type Pt, type SportType } from '../core/sport';
import type { Activity, Habit, HabitLog, Health } from '../lib/types';
import type { MapInfo } from '../components/TrackMap';
import { Telemetry } from '../components/f1';
import { useToast } from '../components/toast';
import { AnimatedNumber, Button, Card, Chip, IconButton, Input, Page, PageHeader, Rise, SectionTitle, Segmented, Sheet, Textarea, cx } from '../components/ui';

// maplibre (~1 MB) loads only when a map is actually shown.
const TrackMap = lazy(() => import('../components/TrackMap'));

/** Body weight for calorie estimates: Fuel profile, else the latest logged weight, else 70 kg. */
export function useWeight() {
  const { settings } = useSettings();
  const { data: health = [] } = useList<Health>('health', { from: addDays(today(), -90) });
  return settings.fuel?.weight ?? health.find((h) => h.kind === 'weight')?.value ?? 70;
}

/** Tick a habit whose name mentions the sport ("Run", "Badminton 3x/week", "Long walk"). */
function useHabitAutolink() {
  const { data: habits = [] } = useList<Habit>('habits');
  const qc = useQueryClient();
  return async (type: SportType, date: string) => {
    const words: Record<string, string[]> = { run: ['run', 'jog'], walk: ['walk', 'steps'], badminton: ['badminton'], cycle: ['cycl', 'bike'], swim: ['swim'], yoga: ['yoga'], football: ['football'], cricket: ['cricket'] };
    const habit = habits.find((h) => !h.archived && (words[type] ?? [type]).some((w) => h.name.toLowerCase().includes(w)));
    if (!habit) return null;
    const logs = await api<HabitLog[]>(`/habit_logs?from=${date}`);
    if (!logs.some((l) => l.habit_id === habit.id && l.date === date)) await api('/habit_logs/toggle', { method: 'POST', body: JSON.stringify({ habit_id: habit.id, date }) });
    void qc.invalidateQueries({ queryKey: ['habit_logs'] });
    return habit.name;
  };
}

/** F1 circuit-style route drawing; the line draws itself in. */
export function CircuitMap({ pts, live, className }: { pts: Pt[]; live?: boolean; className?: string }) {
  const d = useMemo(() => projectTrack(pts), [pts]);
  const last = d.split(' ').at(-1)?.split(',').map(Number);
  const first = d.split(' ')[0]?.split(',').map(Number);
  return (
    <svg viewBox="0 0 100 100" className={cx('aspect-square w-full', className)} aria-label="Route map">
      {d ? (
        <>
          <polyline points={d} fill="none" stroke="var(--line-strong)" strokeWidth={4.2} strokeLinejoin="round" strokeLinecap="round" />
          <motion.polyline points={d} fill="none" stroke="var(--accent)" strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" initial={live ? false : { pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.6, ease: 'easeInOut' }} />
          {first && <rect x={first[0] - 2} y={first[1] - 2} width={4} height={4} fill="url(#chk)" />}
          {last && (
            <circle cx={last[0]} cy={last[1]} r={2.2} fill="var(--accent)" stroke="#fff" strokeWidth={0.8}>
              {live && <animate attributeName="r" values="2.2;3.4;2.2" dur="1.2s" repeatCount="indefinite" />}
            </circle>
          )}
          <defs>
            <pattern id="chk" width="2" height="2" patternUnits="userSpaceOnUse">
              <rect width="2" height="2" fill="#fff" />
              <rect width="1" height="1" fill="#111" />
              <rect x="1" y="1" width="1" height="1" fill="#111" />
            </pattern>
          </defs>
        </>
      ) : (
        <text x="50" y="52" textAnchor="middle" fontSize="5" className="fill-ink-3">
          {live ? 'Waiting for GPS…' : 'No route'}
        </text>
      )}
    </svg>
  );
}

// ---------- Live GPS tracker ----------
type Draft = { type: SportType; pts: Pt[]; movingMs: number; startedAt: string; status: 'running' | 'paused' };
const DRAFT_KEY = 'sport-draft';
const loadDraft = (): Draft | null => {
  try {
    return JSON.parse(localStorage.getItem(DRAFT_KEY) ?? 'null');
  } catch {
    return null;
  }
};
const saveDraft = (d: Draft | null) => {
  try {
    if (d) localStorage.setItem(DRAFT_KEY, JSON.stringify(d));
    else localStorage.removeItem(DRAFT_KEY);
  } catch {}
};

function LiveTracker({ draft, onExit }: { draft: Draft; onExit: () => void }) {
  const weight = useWeight();
  const { create } = useResource<Activity>('activities');
  const autolink = useHabitAutolink();
  const toast = useToast();
  const [d, setD] = useState<Draft>(draft);
  const [acc, setAcc] = useState<number | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  // The 3D map is GPU-heavy; on a long walk the plain outline saves battery. Remembered per device.
  const [simple, setSimpleState] = useState(() => {
    try {
      return localStorage.getItem('tracker-simple') === '1';
    } catch {
      return false;
    }
  });
  const setSimple = (v: boolean) => {
    setSimpleState(v);
    try {
      localStorage.setItem('tracker-simple', v ? '1' : '0');
    } catch {}
  };
  const [, tick] = useState(0);
  const segStart = useRef<number | null>(draft.status === 'running' ? Date.now() : null);
  const lock = useRef<{ release: () => Promise<void> } | null>(null);

  // Moving time = banked time + current running segment.
  const moving = d.movingMs + (d.status === 'running' && segStart.current ? Date.now() - segStart.current : 0);
  const km = trackDistanceKm(d.pts);
  const sp = splits(d.pts);

  useEffect(() => {
    const t = setInterval(() => tick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, []);

  // Screen wake lock: browsers stop GPS callbacks when the screen sleeps.
  useEffect(() => {
    const req = () =>
      (navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } }).wakeLock
        ?.request('screen')
        .then((l) => (lock.current = l))
        .catch(() => {});
    void req();
    const onVis = () => document.visibilityState === 'visible' && void req();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      void lock.current?.release();
    };
  }, []);

  useEffect(() => {
    if (!('geolocation' in navigator)) return setGpsError('This browser has no GPS access.');
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        setAcc(Math.round(pos.coords.accuracy));
        setGpsError(null);
        setD((cur) => {
          if (cur.status !== 'running') return cur;
          const p: Pt = [pos.coords.latitude, pos.coords.longitude, Date.now()];
          if (!acceptFix(cur.pts.at(-1), p, pos.coords.accuracy, cur.type)) return cur;
          const next = { ...cur, pts: [...cur.pts, p] };
          saveDraft({ ...next, movingMs: cur.movingMs + (segStart.current ? Date.now() - segStart.current : 0) });
          return next;
        });
      },
      (e) => setGpsError(e.code === 1 ? 'Location permission denied — allow it for this site in your phone settings.' : 'GPS unavailable — move outdoors for a clearer sky.'),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20_000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  const toggle = () => {
    navigator.vibrate?.(20);
    setD((cur) => {
      if (cur.status === 'running') {
        const banked = cur.movingMs + (segStart.current ? Date.now() - segStart.current : 0);
        segStart.current = null;
        const next = { ...cur, status: 'paused' as const, movingMs: banked };
        saveDraft(next);
        return next;
      }
      segStart.current = Date.now();
      const next = { ...cur, status: 'running' as const };
      saveDraft(next);
      return next;
    });
  };

  const finish = async () => {
    const minutes = moving / 60000;
    if (minutes < 0.5) {
      saveDraft(null);
      return onExit();
    }
    const date = isoDate(new Date(d.startedAt)); // a run that crosses midnight belongs to the day it started
    await create({
      date,
      type: d.type,
      started_at: d.startedAt,
      duration_min: +minutes.toFixed(2),
      distance_km: +km.toFixed(3),
      kcal: estimateKcal(d.type, minutes, weight, km),
      route: JSON.stringify(d.pts),
      details: JSON.stringify({ splits: sp }),
    });
    const h = await autolink(d.type, date);
    saveDraft(null);
    toast({ message: `${SPORTS[d.type].label} saved · ${km.toFixed(2)} km${h ? ` · ✓ ${h}` : ''}` });
    onExit();
  };

  return createPortal(
    <motion.div initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 40 }} className="fixed inset-0 z-[80] flex flex-col bg-bg-outer px-5 pb-[calc(env(safe-area-inset-bottom)+16px)] pt-[calc(env(safe-area-inset-top)+16px)]">
      <div className="flex items-center justify-between">
        <span className="slant bg-accent px-3 py-0.5 text-mini font-black italic uppercase tracking-widest text-white">
          {SPORTS[d.type].emoji} {SPORTS[d.type].label} · {d.status === 'running' ? 'Live' : 'Paused'}
        </span>
        <span className={cx('flex items-center gap-1 font-mono text-xs', acc === null ? 'text-ink-3' : acc <= 15 ? 'text-green' : acc <= 30 ? 'text-yellow' : 'text-danger')}>
          <MapPin className="size-3.5" /> {acc === null ? 'GPS…' : `±${acc} m`}
        </span>
      </div>
      <div className="mt-4 text-center">
        <p className="text-tiny font-black uppercase tracking-[0.3em] text-ink-3">Moving time</p>
        <p className="font-mono text-6xl font-bold tabular-nums">{fmtDuration(moving / 60000)}</p>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2">
        <Telemetry label="Distance" value={km.toFixed(2)} unit="km" />
        <Telemetry label="Avg pace" value={pace(moving / 60000, km)} unit="/km" accent="var(--sky)" />
        <Telemetry label="kcal" value={estimateKcal(d.type, moving / 60000, weight, km)} accent="var(--yellow)" />
      </div>
      <div className="relative my-4 w-full flex-1">
        {simple ? (
          <CircuitMap pts={d.pts} live className="h-full max-h-[40vh]" />
        ) : (
          <Suspense fallback={<CircuitMap pts={d.pts} live className="h-full max-h-[40vh]" />}>
            <TrackMap pts={d.pts} mode="live" height="min(46vh, 420px)" fallback={<CircuitMap pts={d.pts} live className="h-full max-h-[40vh]" />} />
          </Suspense>
        )}
        <button onClick={() => setSimple(!simple)} className="absolute right-2 top-2 z-10 rounded-md bg-bg/80 px-2 py-1 text-micro font-black uppercase tracking-widest text-ink-2 backdrop-blur">
          {simple ? '3D map' : 'Simple · saves battery'}
        </button>
      </div>
      {sp.length > 0 && (
        <div className="no-scrollbar mb-3 flex gap-1.5 overflow-x-auto">
          {sp.map((m, i) => (
            <span key={i} className="slant shrink-0 bg-surface-2 px-2.5 py-0.5 font-mono text-tiny font-bold">
              KM{i + 1} {fmtDuration(m)}
            </span>
          ))}
        </div>
      )}
      {gpsError && <p className="mb-3 text-center text-sm text-warn">{gpsError}</p>}
      <div className="grid grid-cols-2 gap-3">
        <Button className="h-16 text-base" variant={d.status === 'running' ? 'soft' : 'primary'} onClick={toggle}>
          {d.status === 'running' ? <Pause className="size-5" /> : <Play className="size-5 fill-current" />} {d.status === 'running' ? 'Pause' : 'Resume'}
        </Button>
        <Button className="h-16 text-base" variant="danger" onClick={() => void finish()}>
          <Square className="size-5 fill-current" /> Finish
        </Button>
      </div>
      <p className="mt-2 text-center text-tiny text-ink-3">Keep the screen on — browsers pause GPS when the phone sleeps.</p>
    </motion.div>,
    document.body,
  );
}

// ---------- Manual logging ----------
function LogSheet({ open, onClose, initialType }: { open: boolean; onClose: () => void; initialType: SportType }) {
  const weight = useWeight();
  const { create } = useResource<Activity>('activities');
  const autolink = useHabitAutolink();
  const toast = useToast();
  const [type, setType] = useState<SportType>(initialType);
  const [date, setDate] = useState(today());
  const [mins, setMins] = useState('60');
  const [km, setKm] = useState('');
  const [rpe, setRpe] = useState(6);
  const [notes, setNotes] = useState('');
  const [bd, setBd] = useState<BadmintonDetails>({ format: 'doubles', games: 4, won: 2, level: 'casual', partner: '' });
  useEffect(() => {
    if (open) setType(initialType);
  }, [open, initialType]);
  const minutes = Number(mins) || 0;
  const dist = SPORTS[type].distance ? Number(km) || null : null;
  const kcal = estimateKcal(type, minutes, weight, dist, type === 'badminton' ? bd : undefined);

  return (
    <Sheet open={open} onClose={onClose} title="Log activity">
      <div className="space-y-4">
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(SPORTS) as SportType[]).map((t) => (
            <Chip key={t} active={type === t} onClick={() => setType(t)}>
              {SPORTS[t].emoji} {SPORTS[t].label}
            </Chip>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <label className="text-micro font-black uppercase tracking-widest text-ink-3">
            Minutes
            <Input inputMode="numeric" value={mins} onChange={(e) => setMins(e.target.value.replace(/[^\d.]/g, ''))} className="mt-1 font-mono text-base" />
          </label>
          {SPORTS[type].distance && (
            <label className="text-micro font-black uppercase tracking-widest text-ink-3">
              Distance km
              <Input inputMode="decimal" value={km} onChange={(e) => setKm(e.target.value.replace(/[^\d.]/g, ''))} className="mt-1 font-mono text-base" placeholder="5.0" />
            </label>
          )}
          <label className="text-micro font-black uppercase tracking-widest text-ink-3">
            Date
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="field mt-1 w-full" />
          </label>
        </div>
        {type === 'badminton' && (
          <div className="space-y-3 rounded-lg border border-line p-3">
            <div className="grid grid-cols-2 gap-2">
              <Segmented value={bd.format} onChange={(format) => setBd({ ...bd, format })} options={[{ value: 'singles', label: 'Singles' }, { value: 'doubles', label: 'Doubles' }]} />
              <Segmented value={bd.level} onChange={(level) => setBd({ ...bd, level })} options={[{ value: 'casual', label: 'Casual' }, { value: 'competitive', label: 'Match' }]} />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <label className="text-micro font-black uppercase tracking-widest text-ink-3">
                Games
                <Input inputMode="numeric" value={bd.games} onChange={(e) => setBd({ ...bd, games: Number(e.target.value) || 0 })} className="mt-1 font-mono" />
              </label>
              <label className="text-micro font-black uppercase tracking-widest text-ink-3">
                Won
                <Input inputMode="numeric" value={bd.won} onChange={(e) => setBd({ ...bd, won: Math.min(bd.games, Number(e.target.value) || 0) })} className="mt-1 font-mono" />
              </label>
              <label className="text-micro font-black uppercase tracking-widest text-ink-3">
                Partner
                <Input value={bd.partner} onChange={(e) => setBd({ ...bd, partner: e.target.value })} className="mt-1" placeholder="optional" />
              </label>
            </div>
          </div>
        )}
        <div>
          <p className="mb-1 flex justify-between text-micro font-black uppercase tracking-widest text-ink-3">
            <span>Effort (RPE)</span>
            <span className="font-mono text-ink">{rpe}/10</span>
          </p>
          <input type="range" min={1} max={10} value={rpe} onChange={(e) => setRpe(Number(e.target.value))} className="w-full accent-[var(--accent)]" />
        </div>
        <Textarea rows={2} placeholder="Notes (court, route, how it felt…)" value={notes} onChange={(e) => setNotes(e.target.value)} />
        <div className="flex items-center justify-between rounded-md bg-bg px-3 py-2 text-sm">
          <span className="text-ink-3">Estimated burn</span>
          <span className="font-mono font-bold text-yellow">{kcal} kcal</span>
        </div>
        <Button
          className="h-12 w-full"
          disabled={!minutes}
          onClick={async () => {
            await create({ date, type, duration_min: minutes, distance_km: dist, kcal, rpe, notes: notes.trim() || null, details: type === 'badminton' ? JSON.stringify(bd) : null });
            const h = await autolink(type, date);
            toast({ message: `${SPORTS[type].emoji} ${SPORTS[type].label} logged${h ? ` · ✓ ${h}` : ''}` });
            setNotes('');
            onClose();
          }}
        >
          Save
        </Button>
      </div>
    </Sheet>
  );
}

/** Elevation along the route — single series, so no legend; the title carries it. */
function ElevationProfile({ profile, climbM }: { profile: number[]; climbM: { up: number; down: number } }) {
  if (profile.length < 3) return null;
  const lo = Math.min(...profile);
  const hi = Math.max(...profile);
  const span = Math.max(4, hi - lo);
  const pts = profile.map((e, i) => `${(i / (profile.length - 1)) * 100},${38 - ((e - lo) / span) * 32}`).join(' ');
  return (
    <div>
      <p className="mb-1 flex justify-between text-micro font-black uppercase tracking-widest text-ink-3">
        <span>Elevation</span>
        <span className="font-mono normal-case tracking-normal">
          ▲ {climbM.up} m · ▼ {climbM.down} m · {Math.round(lo)}–{Math.round(hi)} m
        </span>
      </p>
      <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="h-20 w-full" aria-label={`Elevation from ${Math.round(lo)} to ${Math.round(hi)} metres`}>
        <defs>
          <linearGradient id="elev" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#e10600" stopOpacity="0.45" />
            <stop offset="1" stopColor="#e10600" stopOpacity="0" />
          </linearGradient>
        </defs>
        <motion.polygon points={`0,40 ${pts} 100,40`} fill="url(#elev)" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.8 }} />
        <motion.polyline points={pts} fill="none" stroke="var(--accent)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.2 }} />
      </svg>
    </div>
  );
}

function Detail({ a, onClose }: { a: Activity | null; onClose: () => void }) {
  const pts: Pt[] = useMemo(() => (a?.route ? JSON.parse(a.route) : []), [a?.route]);
  const det = a?.details ? JSON.parse(a.details) : {};
  const t = (a?.type ?? 'other') as SportType;
  const [fly, setFly] = useState(0);
  const [mapInfo, setMapInfo] = useState<MapInfo>({});
  useEffect(() => (setFly(0), setMapInfo({})), [a?.id]);
  return (
    <Sheet open={!!a} onClose={onClose} title={a ? `${SPORTS[t]?.emoji ?? ''} ${SPORTS[t]?.label ?? a.type} · ${relativeDay(a.date)}` : ''}>
      {a && (
        <div className="space-y-4">
          {pts.length > 1 && (
            <div className="space-y-3">
              <div className="relative">
                <Suspense fallback={<CircuitMap pts={pts} className="mx-auto max-w-xs" />}>
                  <TrackMap key={a.id} pts={pts} mode="replay" height={360} flyKey={fly} onInfo={setMapInfo} fallback={<CircuitMap pts={pts} className="mx-auto max-w-xs" />} />
                </Suspense>
                <Button size="sm" className="absolute left-3 top-3 z-10" onClick={() => setFly((f) => f + 1)}>
                  <Play className="size-3.5 fill-current" /> Flyover replay
                </Button>
              </div>
              {mapInfo.profile && mapInfo.climb && <ElevationProfile profile={mapInfo.profile} climbM={mapInfo.climb} />}
              {mapInfo.landmarks && mapInfo.landmarks.length > 0 && (
                <div>
                  <p className="mb-1.5 text-micro font-black uppercase tracking-widest text-ink-3">You passed</p>
                  <div className="flex flex-wrap gap-1.5">
                    {mapInfo.landmarks.map((n) => (
                      <span key={n} className="slant bg-surface-2 px-2.5 py-0.5 text-tiny font-bold">
                        📍 {n}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          <div className="grid grid-cols-3 gap-2">
            <Telemetry label="Time" value={fmtDuration(a.duration_min)} />
            {a.distance_km ? <Telemetry label="Distance" value={a.distance_km.toFixed(2)} unit="km" accent="var(--sky)" /> : <Telemetry label="Effort" value={a.rpe ?? '—'} unit="/10" accent="var(--sky)" />}
            <Telemetry label="kcal" value={Math.round(a.kcal ?? 0)} accent="var(--yellow)" />
          </div>
          {a.distance_km ? <p className="text-sm text-ink-2">Average pace <b className="font-mono text-ink">{pace(a.duration_min, a.distance_km)} /km</b></p> : null}
          {det.splits?.length > 0 && (
            <div>
              <p className="mb-1.5 text-micro font-black uppercase tracking-widest text-ink-3">Splits</p>
              <div className="space-y-1">
                {(det.splits as number[]).map((m, i, arr) => {
                  const best = Math.min(...arr);
                  return (
                    <div key={i} className="flex items-center gap-2 font-mono text-xs">
                      <span className="w-10 text-ink-3">KM {i + 1}</span>
                      <div className="h-2 flex-1 overflow-hidden rounded-sm bg-surface-2">
                        <motion.div className="h-full" style={{ background: m === best ? 'var(--purple)' : 'var(--accent)' }} initial={{ width: 0 }} animate={{ width: `${(best / m) * 100}%` }} transition={{ delay: i * 0.05 }} />
                      </div>
                      <span className={cx('w-12 text-right', m === best && 'text-purple')}>{fmtDuration(m)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {a.type === 'badminton' && det.games ? (
            <p className="text-sm text-ink-2">
              {det.format} · {det.level === 'competitive' ? 'match play' : 'casual'} · won <b className="text-ink">{det.won}</b> of {det.games} games{det.partner ? ` · with ${det.partner}` : ''}
            </p>
          ) : null}
          {a.notes && <p className="whitespace-pre-wrap text-sm text-ink-2">{a.notes}</p>}
        </div>
      )}
    </Sheet>
  );
}

export function SportPage() {
  const { data: acts = [] } = useList<Activity>('activities', { from: addDays(today(), -120) });
  const { create, remove } = useResource<Activity>('activities');
  const toast = useToast();
  const [draft, setDraft] = useState<Draft | null>(loadDraft);
  const [logType, setLogType] = useState<SportType | null>(null);
  const [detail, setDetail] = useState<Activity | null>(null);
  const weekStart = addDays(today(), -6);
  const week = acts.filter((a) => a.date >= weekStart);
  const sum = (xs: Activity[], f: (a: Activity) => number) => xs.reduce((s, a) => s + f(a), 0);

  const start = (type: SportType) => {
    const d: Draft = { type, pts: [], movingMs: 0, startedAt: new Date().toISOString(), status: 'running' };
    saveDraft(d);
    setDraft(d);
  };
  const [params, setParams] = useSearchParams();
  useEffect(() => {
    const t = params.get('start') as SportType | null;
    if (t && SPORTS[t]?.gps && !draft) start(t);
    if (t) setParams({}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);
  const del = (a: Activity) => {
    remove(a.id);
    const { id: _, created_at: __, updated_at: ___, ...rest } = a;
    toast({ message: 'Activity deleted', action: { label: 'Undo', onClick: () => void create(rest) } });
  };

  const weeks = Array.from({ length: 8 }, (_, i) => {
    const end = addDays(today(), -7 * (7 - i));
    const s = addDays(end, -6);
    return { label: parseDate(s).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }), v: sum(acts.filter((a) => a.date >= s && a.date <= end), (a) => a.duration_min) };
  });
  const max = Math.max(60, ...weeks.map((w) => w.v));

  return (
    <Page>
      <PageHeader eyebrow="Body · Sport" title="Sport" action={<Button variant="ghost" onClick={() => setLogType('badminton')}><Plus className="size-4" /> Log activity</Button>} />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { t: 'run' as SportType, label: 'Start run', sub: 'Live GPS · pace · splits', live: true },
          { t: 'walk' as SportType, label: 'Start walk', sub: 'Live GPS · long walks', live: true },
          { t: 'badminton' as SportType, label: 'Badminton', sub: 'Games, partner, effort', live: false },
          { t: 'cycle' as SportType, label: 'Start ride', sub: 'Live GPS · cycling', live: true },
        ].map((x, i) => (
          <motion.button
            key={x.t}
            initial={{ opacity: 0, y: 20, skewX: -8 }}
            animate={{ opacity: 1, y: 0, skewX: 0 }}
            transition={{ delay: 0.15 + i * 0.06, type: 'spring', stiffness: 280, damping: 24 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => (x.live ? start(x.t) : setLogType(x.t))}
            className="group relative overflow-hidden rounded-xl border border-line bg-surface p-4 text-left transition hover:border-accent"
          >
            <span className="pointer-events-none absolute -right-2 -top-3 text-6xl opacity-20 transition group-hover:scale-110 group-hover:opacity-40">{SPORTS[x.t].emoji}</span>
            {x.live && <span className="mb-2 inline-flex items-center gap-1 text-micro font-black uppercase tracking-widest text-accent-2"><span className="size-1.5 animate-pulse rounded-full bg-accent" /> GPS</span>}
            <p className="text-xl font-black italic uppercase leading-tight">{x.label}</p>
            <p className="text-xs text-ink-3">{x.sub}</p>
          </motion.button>
        ))}
      </div>

      <div className="mb-4 grid grid-cols-2 gap-2 lg:grid-cols-5">
        <Telemetry label="Active · 7 days" value={<AnimatedNumber value={Math.round(sum(week, (a) => a.duration_min))} />} unit="min" />
        <Telemetry label="Run" value={sum(week.filter((a) => a.type === 'run'), (a) => a.distance_km ?? 0).toFixed(1)} unit="km" accent="var(--sky)" />
        <Telemetry label="Walk" value={sum(week.filter((a) => a.type === 'walk'), (a) => a.distance_km ?? 0).toFixed(1)} unit="km" accent="var(--green)" />
        <Telemetry label="Badminton" value={week.filter((a) => a.type === 'badminton').length} unit="sessions" accent="var(--yellow)" />
        <Telemetry label="Burned · 7 days" value={<AnimatedNumber value={Math.round(sum(week, (a) => a.kcal ?? 0))} />} unit="kcal" accent="var(--purple)" />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <Card>
          <SectionTitle>Active minutes / week</SectionTitle>
          <div className="flex h-40 items-end gap-2">
            {weeks.map((w, i) => (
              <div key={i} className="flex h-full flex-1 flex-col items-center justify-end gap-1" title={`${w.label}: ${Math.round(w.v)} min`}>
                <span className="font-mono text-micro text-ink-3">{w.v ? Math.round(w.v) : ''}</span>
                <motion.span className="w-full rounded-t-[4px]" style={{ background: i === weeks.length - 1 ? 'var(--accent)' : 'var(--line-strong)' }} initial={{ height: 0 }} animate={{ height: w.v ? `${(w.v / max) * 100}%` : '2px' }} transition={{ type: 'spring', stiffness: 80, damping: 16, delay: i * 0.04 }} />
                <span className="text-micro font-bold uppercase text-ink-3">{w.label}</span>
              </div>
            ))}
          </div>
        </Card>
        <Card>
          <SectionTitle>Logbook</SectionTitle>
          {acts.length === 0 && <p className="py-6 text-center text-sm text-ink-3">Start a run or walk above, or log a badminton session.</p>}
          <ul className="space-y-1.5">
            <AnimatePresence initial={false}>
              {acts.slice(0, 30).map((a) => {
                const t = (SPORTS[a.type as SportType] ? a.type : 'other') as SportType;
                const det = a.details ? JSON.parse(a.details) : {};
                return (
                  <motion.li key={a.id} layout {...listItem} className="group flex items-center gap-3 rounded-md bg-bg px-3 py-2.5">
                    <span className="text-xl">{SPORTS[t].emoji}</span>
                    <button onClick={() => setDetail(a)} className="min-w-0 flex-1 text-left">
                      <p className="truncate text-sm font-bold">
                        {SPORTS[t].label}
                        {a.route && <MapPin className="ml-1 inline size-3 text-accent-2" />}
                      </p>
                      <p className="text-xs text-ink-3">
                        {relativeDay(a.date)} · {fmtDuration(a.duration_min)}
                        {a.distance_km ? ` · ${a.distance_km.toFixed(2)} km · ${pace(a.duration_min, a.distance_km)}/km` : ''}
                        {t === 'badminton' && det.games ? ` · ${det.won}/${det.games} games` : ''}
                      </p>
                    </button>
                    <span className="font-mono text-xs font-bold text-yellow">{Math.round(a.kcal ?? 0)} kcal</span>
                    <IconButton label="Delete activity" onClick={() => del(a)} className="opacity-0 transition group-hover:opacity-100 max-sm:opacity-60">
                      <Trash2 className="size-4" />
                    </IconButton>
                  </motion.li>
                );
              })}
            </AnimatePresence>
          </ul>
        </Card>
      </div>

      <LogSheet open={!!logType} onClose={() => setLogType(null)} initialType={logType ?? 'badminton'} />
      <Detail a={detail} onClose={() => setDetail(null)} />
      <AnimatePresence>{draft && <LiveTracker key={draft.startedAt} draft={draft} onExit={() => setDraft(null)} />}</AnimatePresence>
      <Rise className="mt-4 flex items-center justify-center gap-2 text-tiny text-ink-3">
        <Flag className="size-3.5" /> Calories burned are shown on Fuel for reference — your target stays the same.
      </Rise>
    </Page>
  );
}
