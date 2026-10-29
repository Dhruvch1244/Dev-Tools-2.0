import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, LayoutGroup, motion } from 'motion/react';
import { ChevronLeft, ChevronRight, Pause, Play, RotateCcw } from 'lucide-react';
import type { ArrayState, Frame, GraphState, Mark, TableState, TreeState } from '../core/dsa/viz';
import { cx } from './ui';

const MARK_BG: Record<Mark, string> = {
  active: 'var(--accent)',
  done: 'var(--green)',
  hit: 'var(--purple)',
  queued: 'var(--yellow)',
  swap: 'var(--sky)',
  dim: 'var(--bg)',
  wall: 'var(--bg-outer)',
};
const MARK_INK: Partial<Record<Mark, string>> = { queued: '#111', done: '#06140b', swap: '#04121f' };
const cellStyle = (m?: Mark) => (m ? { background: MARK_BG[m], color: MARK_INK[m] ?? (m === 'dim' ? 'var(--ink-3)' : '#fff'), borderColor: m === 'dim' ? 'var(--line)' : 'transparent' } : undefined);

const spring = { type: 'spring', stiffness: 520, damping: 34 } as const;

function ArrayView({ a, id }: { a: ArrayState; id: string }) {
  const n = a.values.length;
  return (
    <div>
      <p className="mb-1.5 text-micro font-black uppercase tracking-[0.2em] text-ink-3">{a.name}</p>
      <div className="no-scrollbar overflow-x-auto pb-7">
        <div className="relative inline-flex gap-1">
          {a.window && a.window[1] >= a.window[0] && (
            <motion.div
              layout
              transition={spring}
              className="pointer-events-none absolute -inset-y-1 rounded-md border-2 border-accent bg-accent/10"
              style={{ left: `calc(${a.window[0]} * (2.75rem + 0.25rem) - 4px)`, width: `calc(${a.window[1] - a.window[0] + 1} * (2.75rem + 0.25rem) + 4px)` }}
            />
          )}
          {a.values.map((v, i) => (
            <div key={i} className="relative">
              <motion.div
                key={`${String(v)}`}
                initial={{ scale: 0.7, opacity: 0.4 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={spring}
                className="grid h-11 w-11 place-items-center rounded-md border border-line bg-surface-2 font-mono text-label font-bold transition-colors duration-200"
                style={cellStyle(a.marks?.[i])}
              >
                {v === null ? '·' : String(v)}
              </motion.div>
              <span className="absolute -top-3.5 left-0 right-0 text-center font-mono text-micro text-ink-3">{i}</span>
            </div>
          ))}
          {n === 0 && <span className="h-11 text-sm italic text-ink-3">empty</span>}
          {(a.pointers ?? []).map((p, k) => (
            <motion.div
              key={p.name}
              layoutId={`${id}-${a.name}-ptr-${p.name}`}
              transition={spring}
              className="absolute top-12 flex flex-col items-center"
              style={{ left: `calc(${p.index} * (2.75rem + 0.25rem))`, width: '2.75rem', zIndex: 2 }}
            >
              <span className="h-0 w-0 border-x-[5px] border-b-[6px] border-x-transparent" style={{ borderBottomColor: PTR_COLORS[k % PTR_COLORS.length] }} />
              <span className="slant px-1.5 font-mono text-micro font-bold text-black" style={{ background: PTR_COLORS[k % PTR_COLORS.length], marginTop: (k % 2) * 13 }}>
                {p.name}
              </span>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}
const PTR_COLORS = ['#ffd23f', '#4fb3ff', '#ff5747', '#2bd46b', '#b26bff'];

function TableView({ t }: { t: TableState }) {
  return (
    <div>
      <p className="mb-1.5 text-micro font-black uppercase tracking-[0.2em] text-ink-3">{t.name}</p>
      <div className="no-scrollbar overflow-x-auto">
        <table className="border-separate border-spacing-1 font-mono text-mini">
          {t.colLabels && (
            <thead>
              <tr>
                {t.rowLabels && <th />}
                {t.colLabels.map((c, j) => (
                  <th key={j} className="px-1 text-center font-bold text-ink-3">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
          )}
          <tbody>
            {t.rows.map((row, i) => (
              <tr key={i}>
                {t.rowLabels && <th className="pr-1.5 text-right font-bold text-ink-3">{t.rowLabels[i]}</th>}
                {row.map((v, j) => {
                  const m = t.marks?.[`${i},${j}`];
                  return (
                    <td key={j} className="p-0">
                      <motion.div
                        key={String(v)}
                        initial={{ scale: v === null || v === '' ? 1 : 0.6 }}
                        animate={{ scale: 1 }}
                        transition={spring}
                        className="grid h-9 min-w-9 place-items-center rounded border border-line bg-surface-2 px-1 font-bold transition-colors duration-200"
                        style={cellStyle(m)}
                      >
                        {v === null ? '' : String(v)}
                      </motion.div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function GraphView({ g }: { g: GraphState }) {
  const pos = Object.fromEntries(g.nodes.map((n) => [n.id, n]));
  return (
    <svg viewBox="-8 -8 116 116" className="mx-auto aspect-square w-full max-w-[420px]">
      <defs>
        <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill="var(--ink-3)" />
        </marker>
      </defs>
      {g.edges.map((e) => {
        const a = pos[e.a];
        const b = pos[e.b];
        if (!a || !b) return null;
        const m = g.edgeMarks?.[`${e.a}|${e.b}`] ?? g.edgeMarks?.[`${e.b}|${e.a}`];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len = Math.hypot(dx, dy) || 1;
        const r = 7;
        const x1 = a.x + (dx / len) * r;
        const y1 = a.y + (dy / len) * r;
        const x2 = b.x - (dx / len) * (r + (e.directed ? 1.5 : 0));
        const y2 = b.y - (dy / len) * (r + (e.directed ? 1.5 : 0));
        return (
          <g key={`${e.a}-${e.b}`}>
            <motion.line
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1, stroke: m ? MARK_BG[m] : 'var(--line-strong)', strokeWidth: m && m !== 'dim' ? 1.6 : 0.8, opacity: m === 'dim' ? 0.35 : 1 }}
              transition={{ duration: 0.4 }}
              markerEnd={e.directed ? 'url(#arrow)' : undefined}
            />
            {e.w !== undefined && (
              <text x={(a.x + b.x) / 2} y={(a.y + b.y) / 2 - 1.5} textAnchor="middle" className="fill-ink-2 font-mono" fontSize="4">
                {e.w}
              </text>
            )}
          </g>
        );
      })}
      {g.nodes.map((n) => {
        const m = g.nodeMarks?.[n.id];
        return (
          <g key={n.id}>
            <motion.circle cx={n.x} cy={n.y} r={7} animate={{ fill: m ? MARK_BG[m] : 'var(--surface-2)', scale: m === 'active' ? 1.15 : 1 }} transition={spring} stroke="var(--line-strong)" strokeWidth={0.6} style={{ transformOrigin: `${n.x}px ${n.y}px` }} />
            <text x={n.x} y={n.y + 1.6} textAnchor="middle" fontSize="5" fontWeight="800" fill={m && MARK_INK[m] ? MARK_INK[m] : '#fff'} className="font-mono">
              {n.label ?? n.id}
            </text>
            {g.badges?.[n.id] && (
              <text x={n.x} y={n.y - 9.5} textAnchor="middle" fontSize="3.8" fontWeight="700" className="fill-yellow font-mono">
                {g.badges[n.id]}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

/** Tidy-ish layout: x from in-order position, y from depth. */
function layoutTree(t: TreeState) {
  const kids = (id: string) => {
    const ch = t.nodes.filter((n) => n.parent === id);
    return [...ch.filter((c) => c.side !== 'R'), ...ch.filter((c) => c.side === 'R')];
  };
  const root = t.nodes.find((n) => n.parent === null);
  const pos: Record<string, { x: number; y: number }> = {};
  let x = 0;
  let maxDepth = 0;
  const walk = (id: string, d: number) => {
    const ch = kids(id);
    const half = Math.ceil(ch.length / 2);
    ch.slice(0, half).forEach((c) => walk(c.id, d + 1));
    pos[id] = { x: x++, y: d };
    maxDepth = Math.max(maxDepth, d);
    ch.slice(half).forEach((c) => walk(c.id, d + 1));
  };
  if (root) walk(root.id, 0);
  return { pos, w: Math.max(1, x - 1), h: Math.max(1, maxDepth) };
}

function TreeView({ t }: { t: TreeState }) {
  const { pos, w, h } = useMemo(() => layoutTree(t), [t]);
  const X = (x: number) => 6 + (x / w) * 88;
  const Y = (y: number) => 8 + (y / h) * 80;
  return (
    <svg viewBox="0 0 100 96" className="mx-auto w-full max-w-[560px]">
      {t.nodes.map((n) =>
        n.parent && pos[n.parent] && pos[n.id] ? (
          <motion.line key={`e${n.id}`} initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} x1={X(pos[n.parent].x)} y1={Y(pos[n.parent].y)} x2={X(pos[n.id].x)} y2={Y(pos[n.id].y)} stroke="var(--line-strong)" strokeWidth={0.6} />
        ) : null,
      )}
      {t.nodes.map((n) => {
        const p = pos[n.id];
        if (!p) return null;
        const m = t.marks?.[n.id];
        return (
          <motion.g key={n.id} initial={{ opacity: 0, scale: 0.4 }} animate={{ opacity: 1, scale: 1, x: X(p.x), y: Y(p.y) }} transition={spring}>
            <motion.circle r={4.6} animate={{ fill: m ? MARK_BG[m] : 'var(--surface-2)' }} stroke="var(--line-strong)" strokeWidth={0.4} />
            <text y={1.3} textAnchor="middle" fontSize={n.label.length > 3 ? 2.6 : 3.4} fontWeight="800" fill={m && MARK_INK[m] ? MARK_INK[m] : '#fff'} className="font-mono">
              {n.label}
            </text>
          </motion.g>
        );
      })}
    </svg>
  );
}

export function FrameView({ frame, id = 'v' }: { frame: Frame; id?: string }) {
  return (
    <LayoutGroup id={id}>
      <div className="space-y-5">
        {frame.graph && <GraphView g={frame.graph} />}
        {frame.tree && <TreeView t={frame.tree} />}
        {frame.tables?.map((t) => <TableView key={t.name} t={t} />)}
        {frame.arrays?.map((a) => <ArrayView key={a.name} a={a} id={id} />)}
        {frame.vars && Object.keys(frame.vars).length > 0 && (
          <div className="flex flex-wrap gap-2">
            {Object.entries(frame.vars).map(([k, v]) => (
              <span key={k} className="flex items-stretch overflow-hidden rounded font-mono text-mini">
                <span className="bg-ink px-2 py-0.5 font-bold text-bg">{k}</span>
                <motion.span key={String(v)} initial={{ backgroundColor: 'rgba(225,6,0,.5)' }} animate={{ backgroundColor: 'rgba(27,30,38,1)' }} transition={{ duration: 0.6 }} className="border border-l-0 border-line px-2 py-0.5">
                  {v === null ? '—' : String(v)}
                </motion.span>
              </span>
            ))}
          </div>
        )}
      </div>
    </LayoutGroup>
  );
}

const SPEEDS = [0.5, 1, 2, 4];

/** Playback: space = play/pause, ←/→ = step. Reduced motion starts paused and never autoplays. */
export function usePlayer(count: number) {
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  useEffect(() => setI(0), [count]);
  useEffect(() => {
    if (!playing) return;
    if (i >= count - 1) return setPlaying(false);
    const id = setTimeout(() => setI((x) => Math.min(count - 1, x + 1)), 900 / speed);
    return () => clearTimeout(id);
  }, [playing, i, count, speed]);
  return { i, setI, playing, setPlaying, speed, setSpeed };
}

export function PlayerBar({ p, count, msg }: { p: ReturnType<typeof usePlayer>; count: number; msg?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.closest('input, textarea, .cm-editor');
      if (tag) return;
      if (e.key === ' ') (e.preventDefault(), p.setPlaying((x) => !x));
      if (e.key === 'ArrowRight') p.setI((x) => Math.min(count - 1, x + 1));
      if (e.key === 'ArrowLeft') p.setI((x) => Math.max(0, x - 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [p, count]);
  return (
    <div ref={ref} className="space-y-3">
      <AnimatePresence mode="wait">
        <motion.p key={`${p.i}-${msg}`} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} transition={{ duration: 0.18 }} className="min-h-[2.75rem] border-l-[3px] border-accent bg-bg px-3 py-2 text-[14px] leading-snug">
          {msg}
        </motion.p>
      </AnimatePresence>
      <div className="flex items-center gap-2">
        <button aria-label="Restart" onClick={() => (p.setI(0), p.setPlaying(false))} className="grid size-9 place-items-center rounded-md bg-surface-2 text-ink-2 hover:text-ink">
          <RotateCcw className="size-4" />
        </button>
        <button aria-label="Previous step" onClick={() => p.setI(Math.max(0, p.i - 1))} className="grid size-9 place-items-center rounded-md bg-surface-2 text-ink-2 hover:text-ink">
          <ChevronLeft className="size-4" />
        </button>
        <motion.button whileTap={{ scale: 0.9 }} aria-label={p.playing ? 'Pause' : 'Play'} onClick={() => (p.i >= count - 1 && p.setI(0), p.setPlaying(!p.playing))} className="grid size-11 place-items-center rounded-md bg-accent text-white shadow-[0_6px_20px_-6px_var(--accent)]">
          {p.playing ? <Pause className="size-5" /> : <Play className="size-5 fill-current" />}
        </motion.button>
        <button aria-label="Next step" onClick={() => p.setI(Math.min(count - 1, p.i + 1))} className="grid size-9 place-items-center rounded-md bg-surface-2 text-ink-2 hover:text-ink">
          <ChevronRight className="size-4" />
        </button>
        <input type="range" aria-label="Scrub" min={0} max={Math.max(0, count - 1)} value={p.i} onChange={(e) => (p.setI(Number(e.target.value)), p.setPlaying(false))} className="mx-2 flex-1 accent-[var(--accent)]" />
        <span className="w-16 text-right font-mono text-xs tabular-nums text-ink-3">
          {count ? p.i + 1 : 0}/{count}
        </span>
        <div className="flex overflow-hidden rounded-md border border-line">
          {SPEEDS.map((s) => (
            <button key={s} onClick={() => p.setSpeed(s)} className={cx('px-2 py-1 font-mono text-tiny font-bold', p.speed === s ? 'bg-accent text-white' : 'text-ink-3 hover:text-ink')}>
              {s}×
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
