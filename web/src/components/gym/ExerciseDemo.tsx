import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Pause, Play } from 'lucide-react';
import { api } from '../../lib/api';
import { figureFor, frameOf, isBreathing, joints, parts, poseAt, type Figure, type Pose, type Pt } from '../../core/figures';
import { cx } from '../ui';

type Demo = { id: string; name: string; level: string; equipment: string | null; muscles: string[]; steps: string[]; frames: number };
const img = (id: string, n: number) => `/api/gym/demo-img/${encodeURIComponent(id)}/${n}`;

/** Photos (from the library) for this move, or null while loading / when there are none. */
export function useDemo(name: string, enabled = true) {
  const local = !!figureFor(name) || isBreathing(name);
  return useQuery({ queryKey: ['gym-demo', name], queryFn: () => api<Demo | null>(`/gym/demo?name=${encodeURIComponent(name)}`), enabled: enabled && !local && !!name, staleTime: Infinity, gcTime: Infinity, retry: 1 });
}

/**
 * Start and end photos cross-fading in a slow, eased loop — the movement without a video. Waits
 * until both photos have loaded so the first fades aren't blank flashes.
 */
function PhotoLoop({ id, paused, className }: { id: string; paused?: boolean; className?: string }) {
  const [loaded, setLoaded] = useState(0);
  const ready = loaded >= 2;
  return (
    <span className={cx('relative block overflow-hidden bg-white', className)}>
      {!ready && <span className="absolute inset-0 animate-pulse bg-surface-2" />}
      <img src={img(id, 0)} alt="" loading="lazy" onLoad={() => setLoaded((n) => n + 1)} className={cx('demo-a absolute inset-0 size-full object-cover transition-opacity duration-500', ready ? 'opacity-100' : 'opacity-0')} style={{ animationPlayState: paused || !ready ? 'paused' : 'running' }} />
      <img src={img(id, 1)} alt="" loading="lazy" onLoad={() => setLoaded((n) => n + 1)} className={cx('absolute inset-0 size-full object-cover', ready ? 'demo-flip' : 'opacity-0')} style={{ animationPlayState: paused || !ready ? 'paused' : 'running' }} />
    </span>
  );
}

/** Drives a figure from requestAnimationFrame (only while on screen), so the loop is smooth at any frame rate. */
function useLoopTime(paused: boolean | undefined) {
  const [t, setT] = useState(0);
  const [el, setEl] = useState<Element | null>(null);
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting));
    io.observe(el);
    return () => io.disconnect();
  }, [el]);
  useEffect(() => {
    if (paused || !visible) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      setT((x) => x + Math.min(0.1, (now - last) / 1000));
      last = now;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [paused, visible]);
  return { t, ref: setEl };
}

function Body({ pose, view, ghost }: { pose: Pose; view: Figure['view']; ghost?: boolean }) {
  const near = ghost ? 'var(--ink-3)' : 'var(--accent)';
  const far = ghost ? 'var(--ink-3)' : 'color-mix(in srgb, var(--accent) 50%, var(--bg))';
  return (
    <g opacity={ghost ? 0.16 : 1}>
      {parts(joints(pose, view)).map((p, i) =>
        'd' in p ? (
          <path key={i} d={p.d} stroke={p.near ? near : far} strokeWidth={p.w} strokeLinecap="round" fill="none" />
        ) : (
          <circle key={i} cx={p.circle[0]} cy={p.circle[1]} r={p.r} fill={p.head ? (ghost ? 'var(--ink-3)' : 'var(--ink)') : p.near ? near : far} />
        ),
      )}
    </g>
  );
}

/** A drawn figure on a fixed skeleton, eased through its key poses, with the end pose as a ghost and the phase named. */
export function FigureLoop({ fig, paused, className, labels = true }: { fig: Figure; paused?: boolean; className?: string; labels?: boolean }) {
  const { t, ref } = useLoopTime(paused);
  const box = useMemo(() => frameOf(fig), [fig]);
  const pose = poseAt(fig, t);
  const hip = joints(pose, fig.view).hip;
  return (
    <svg ref={ref} viewBox={box.join(' ')} preserveAspectRatio="xMidYMid meet" className={cx('block bg-bg', className)} role="img" aria-label={fig.cue}>
      {fig.floor !== false && (
        <>
          <line x1={box[0]} y1="72.8" x2={box[0] + box[2]} y2="72.8" stroke="var(--line-strong)" strokeWidth="0.8" />
          <ellipse cx={hip[0]} cy="73.2" rx="16" ry="1.6" fill="black" opacity="0.35" />
        </>
      )}
      {fig.props?.map((p, i) => (p.kind === 'line' ? <line key={i} x1={p.x} y1={p.y} x2={p.x2} y2={p.y2} stroke="var(--ink-3)" strokeWidth="1.6" /> : <rect key={i} x={p.x} y={p.y} width={p.x2 - p.x} height={p.y2 - p.y} rx="1" fill="var(--surface-2)" stroke="var(--ink-3)" strokeWidth="0.6" />))}
      {fig.ghost && fig.keys.length === 2 && <Body pose={fig.keys[1].pose} view={fig.view} ghost />}
      <Body pose={pose} view={fig.view} />
      {labels && pose.label && (
        <text x={box[0] + 3} y={box[1] + 6} className="fill-ink-2 font-display font-black uppercase italic" style={{ fontSize: Math.max(3.2, box[2] / 26) }}>
          {pose.label}
        </text>
      )}
    </svg>
  );
}

const PHASES = ['Breathe in', 'Hold', 'Breathe out', 'Hold'];
/** Box breathing: a dot runs round a square — in 4, hold 4, out 4, hold 4 — with the phase and count. */
export function BreathingGuide({ className, compact }: { className?: string; compact?: boolean }) {
  const [t, setT] = useState(0);
  useEffect(() => {
    const start = Date.now();
    const id = setInterval(() => setT(((Date.now() - start) / 1000) % 16), 100);
    return () => clearInterval(id);
  }, []);
  const phase = Math.floor(t / 4);
  const side = (t % 4) / 4;
  const corners: Pt[] = [[30, 66], [30, 14], [90, 14], [90, 66]];
  const [a, b] = [corners[phase], corners[(phase + 1) % 4]];
  const dot: Pt = [a[0] + (b[0] - a[0]) * side, a[1] + (b[1] - a[1]) * side];
  const scale = phase === 0 ? 0.7 + 0.3 * side : phase === 1 ? 1 : phase === 2 ? 1 - 0.3 * side : 0.7;
  return (
    <svg viewBox="0 0 120 80" className={cx('block bg-bg', className)} role="img" aria-label="Box breathing guide">
      <rect x="30" y="14" width="60" height="52" fill="none" stroke="var(--line-strong)" strokeWidth="1.5" rx="2" />
      <circle cx="60" cy="40" r={16 * scale} fill="color-mix(in srgb, var(--sky) 25%, transparent)" />
      <circle cx={dot[0]} cy={dot[1]} r="3.4" fill="var(--sky)" />
      {!compact && (
        <>
          <text x="60" y="38" textAnchor="middle" className="fill-ink font-display text-[7px] font-black uppercase italic">{PHASES[phase]}</text>
          <text x="60" y="48" textAnchor="middle" className="fill-ink-2 font-mono text-[8px]">{4 - Math.floor(t % 4)}</text>
        </>
      )}
    </svg>
  );
}

/** Small looping preview for a list row; nothing when there's no demo for the move. */
export function DemoThumb({ name, className = 'h-12 w-16' }: { name: string; className?: string }) {
  const fig = figureFor(name);
  const { data } = useDemo(name);
  if (isBreathing(name)) return <BreathingGuide compact className={cx('shrink-0 rounded-md', className)} />;
  if (fig) return <FigureLoop fig={fig} labels={false} className={cx('shrink-0 rounded-md', className)} />;
  if (data?.id) return <PhotoLoop id={data.id} className={cx('shrink-0 rounded-md', className)} />;
  return null;
}

/** The full demo: large loop (tap to pause), level/equipment, and numbered steps. */
export function ExerciseDemo({ name, className }: { name: string; className?: string }) {
  const fig = figureFor(name);
  const { data, isLoading } = useDemo(name);
  const [paused, setPaused] = useState(false);
  if (isBreathing(name))
    return (
      <div className={className}>
        <BreathingGuide className="aspect-[3/2] w-full rounded-lg" />
        <p className="mt-2 text-sm text-ink-2">Follow the dot: in through the nose for 4, hold 4, out slowly for 4, hold 4. The circle grows as you breathe in.</p>
      </div>
    );
  const visual = fig ? <FigureLoop fig={fig} paused={paused} className="aspect-[3/2] w-full rounded-lg" /> : data?.id ? <PhotoLoop id={data.id} paused={paused} className="aspect-[3/2] w-full rounded-lg" /> : null;
  if (!visual) return isLoading ? <div className={cx('aspect-[3/2] w-full animate-pulse rounded-lg bg-surface-2', className)} /> : null;
  return (
    <div className={className}>
      <button onClick={() => setPaused(!paused)} className="relative block w-full" aria-label={paused ? 'Play demo' : 'Pause demo'}>
        {visual}
        <span className="absolute bottom-2 right-2 grid size-8 place-items-center rounded-full bg-black/60 text-white">{paused ? <Play className="size-4" /> : <Pause className="size-4" />}</span>
        {!fig && (
          <span className="absolute left-2 top-2 rounded bg-black/60 px-1.5 py-0.5 text-micro font-bold uppercase text-white">Start ⇄ finish</span>
        )}
      </button>
      {fig ? (
        <p className="mt-2 text-sm text-ink-2">{fig.cue}</p>
      ) : (
        data && (
          <>
            <p className="mt-2 text-micro font-bold uppercase tracking-wider text-ink-3">
              {[data.level, data.equipment, ...data.muscles].filter(Boolean).join(' · ')}
            </p>
            <ol className="mt-1.5 list-decimal space-y-1 pl-5 text-sm text-ink-2">
              {data.steps.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ol>
          </>
        )
      )}
    </div>
  );
}
