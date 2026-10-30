import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Pause, Play } from 'lucide-react';
import { api } from '../../lib/api';
import { figureFor, frameOf, isBreathing, toes, type Figure, type Pose, type Pt } from '../../core/figures';
import { cx } from '../ui';

type Demo = { id: string; name: string; level: string; equipment: string | null; muscles: string[]; steps: string[]; frames: number };
const img = (id: string, n: number) => `/api/gym/demo-img/${encodeURIComponent(id)}/${n}`;

/** Photos (from the library) for this move, or null while loading / when there are none. */
export function useDemo(name: string, enabled = true) {
  const local = !!figureFor(name) || isBreathing(name);
  return useQuery({ queryKey: ['gym-demo', name], queryFn: () => api<Demo | null>(`/gym/demo?name=${encodeURIComponent(name)}`), enabled: enabled && !local && !!name, staleTime: Infinity, gcTime: Infinity, retry: 1 });
}

/** Start and end photos cross-fading in a loop: the movement, without a video. */
function PhotoLoop({ id, paused, className }: { id: string; paused?: boolean; className?: string }) {
  return (
    <span className={cx('relative block overflow-hidden bg-white', className)}>
      <img src={img(id, 0)} alt="" loading="lazy" className="absolute inset-0 size-full object-cover" />
      <img src={img(id, 1)} alt="" loading="lazy" className="demo-flip absolute inset-0 size-full object-cover" style={{ animationPlayState: paused ? 'paused' : 'running' }} />
    </span>
  );
}

const SEGMENTS: [keyof Pose | 'toeF' | 'toeB', keyof Pose | 'toeF' | 'toeB', boolean][] = [
  ['neck', 'elbowB', false], ['elbowB', 'handB', false], ['hip', 'kneeB', false], ['kneeB', 'footB', false], ['footB', 'toeB', false],
  ['neck', 'hip', true], ['hip', 'kneeF', true], ['kneeF', 'footF', true], ['footF', 'toeF', true], ['neck', 'elbowF', true], ['elbowF', 'handF', true],
];

/** A drawn stick figure tweening through its poses (SVG SMIL, no JS per frame). */
export function FigureLoop({ fig, paused, className }: { fig: Figure; paused?: boolean; className?: string }) {
  const frames = [...fig.poses, fig.poses[0]].map((p) => ({ ...p, ...toes(p) }) as Record<string, Pt>);
  const n = frames.length - 1;
  const keyTimes = frames.map((_, i) => (i / n).toFixed(3)).join(';');
  const splines = Array.from({ length: n }, () => '0.45 0 0.55 1').join(';');
  const anim = (attr: string, vals: number[]) => <animate attributeName={attr} values={vals.join(';')} keyTimes={keyTimes} calcMode="spline" keySplines={splines} dur={`${fig.secs}s`} repeatCount="indefinite" />;
  const [svg, setSvg] = useState<SVGSVGElement | null>(null);
  useEffect(() => void (svg && (paused ? svg.pauseAnimations() : svg.unpauseAnimations())), [svg, paused]);
  const f0 = frames[0];
  const box = frameOf(fig);
  return (
    <svg ref={setSvg} viewBox={box.join(' ')} preserveAspectRatio="xMidYMid meet" className={cx('block bg-bg', className)} role="img" aria-label={fig.cue}>
      {fig.floor !== false && <line x1={box[0]} y1="72.8" x2={box[0] + box[2]} y2="72.8" stroke="var(--line-strong)" strokeWidth="1" />}
      {fig.props?.map((p, i) => (p.kind === 'line' ? <line key={i} x1={p.x} y1={p.y} x2={p.x2} y2={p.y2} stroke="var(--ink-3)" strokeWidth="1.6" /> : <rect key={i} x={p.x} y={p.y} width={p.x2 - p.x} height={p.y2 - p.y} rx="1" fill="var(--surface-2)" stroke="var(--ink-3)" strokeWidth="0.8" />))}
      {SEGMENTS.map(([a, b, near], i) => (
        <line key={i} x1={f0[a][0]} y1={f0[a][1]} x2={f0[b][0]} y2={f0[b][1]} stroke={near ? 'var(--accent)' : 'color-mix(in srgb, var(--accent) 45%, transparent)'} strokeWidth={a === 'neck' && b === 'hip' ? 4.2 : 3.2} strokeLinecap="round">
          {anim('x1', frames.map((f) => f[a][0]))}
          {anim('y1', frames.map((f) => f[a][1]))}
          {anim('x2', frames.map((f) => f[b][0]))}
          {anim('y2', frames.map((f) => f[b][1]))}
        </line>
      ))}
      <circle cx={f0.head[0]} cy={f0.head[1]} r="5" fill="var(--ink)">
        {anim('cx', frames.map((f) => f.head[0]))}
        {anim('cy', frames.map((f) => f.head[1]))}
      </circle>
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
  if (fig) return <FigureLoop fig={fig} className={cx('shrink-0 rounded-md', className)} />;
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
