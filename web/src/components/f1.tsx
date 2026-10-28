import { useEffect, useRef, useState, type ReactNode } from 'react';
import { motion } from 'motion/react';
import { cx } from './ui';

/**
 * Five-light start sequence. Lights come on one per 450ms, hold, then all go out — the moment
 * they go out is when `onGo` fires. Reduced motion skips straight to `onGo` (dsgn motion.md:
 * every effect needs an off-switch, and a 3s wait is a real cost to someone who opted out).
 */
export function StartLights({ running, onGo, size = 40 }: { running: boolean; onGo: () => void; size?: number }) {
  const [lit, setLit] = useState(0);
  const go = useRef(onGo);
  go.current = onGo;
  useEffect(() => {
    if (!running) return setLit(0);
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return go.current();
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (let i = 1; i <= 5; i++) timers.push(setTimeout(() => setLit(i), i * 450));
    timers.push(
      setTimeout(() => {
        setLit(0);
        go.current();
      }, 5 * 450 + 700 + Math.random() * 500),
    );
    return () => timers.forEach(clearTimeout);
  }, [running]);

  return (
    <div className="inline-flex gap-3 rounded-xl border border-[#23252c] bg-[#0a0a0c] px-4 py-3 shadow-[inset_0_0_0_4px_#121318]" aria-hidden>
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="flex flex-col gap-2 rounded-lg bg-[#060607] px-1.5 py-2">
          {[0, 1].map((r) => (
            <span
              key={r}
              className="block rounded-full transition-[background,box-shadow] duration-75"
              style={{
                width: size,
                height: size,
                background: lit >= i ? '#ff1a12' : '#2a0b0b',
                boxShadow: lit >= i ? '0 0 22px 4px rgba(255,26,18,.75), inset 0 -4px 8px rgba(0,0,0,.35)' : 'none',
              }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export type Sector = 'purple' | 'green' | 'yellow';
const SECTOR_BG: Record<Sector, string> = { purple: 'var(--purple)', green: 'var(--green)', yellow: 'var(--yellow)' };
const SECTOR_LABEL: Record<Sector, string> = { purple: 'All-time best', green: 'Personal best vs last', yellow: 'Below last session' };

export function SectorChip({ sector, children }: { sector: Sector; children: ReactNode }) {
  return (
    <motion.span
      initial={{ scale: 0.6, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 500, damping: 20 }}
      title={SECTOR_LABEL[sector]}
      className="slant inline-flex items-center px-2.5 py-0.5 font-mono text-[12px] font-bold text-black"
      style={{ background: SECTOR_BG[sector] }}
    >
      {children}
      <span className="sr-only"> ({SECTOR_LABEL[sector]})</span>
    </motion.span>
  );
}

export function SectorLegend() {
  return (
    <div className="flex flex-wrap gap-3 text-[11px] font-semibold uppercase tracking-wider text-ink-3">
      {(['purple', 'green', 'yellow'] as Sector[]).map((s) => (
        <span key={s} className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm" style={{ background: SECTOR_BG[s] }} /> {SECTOR_LABEL[s]}
        </span>
      ))}
    </div>
  );
}

export function Chequered({ className }: { className?: string }) {
  return (
    <motion.svg
      viewBox="0 0 60 40"
      className={cx('origin-left', className)}
      initial={{ rotate: -14, scale: 0.6, opacity: 0 }}
      animate={{ rotate: [-14, 8, -6, 4, 0], scale: 1, opacity: 1 }}
      transition={{ duration: 1.1, ease: 'easeOut' }}
      aria-hidden
    >
      <defs>
        <pattern id="chq" width="10" height="10" patternUnits="userSpaceOnUse">
          <rect width="10" height="10" fill="#f3f3f3" />
          <rect width="5" height="5" fill="#111" />
          <rect x="5" y="5" width="5" height="5" fill="#111" />
        </pattern>
      </defs>
      <path d="M4 2 C 20 -2, 36 8, 56 3 L 56 30 C 36 35, 20 25, 4 29 Z" fill="url(#chq)" />
      <rect x="1" y="0" width="3" height="40" fill="#888" />
    </motion.svg>
  );
}

/** A DRS-style countdown bar: shrinks over `seconds`, calls onDone at zero. */
export function CountdownBar({ seconds, onDone, label }: { seconds: number; onDone?: () => void; label?: string }) {
  const [left, setLeft] = useState(seconds);
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    const t0 = Date.now();
    const id = setInterval(() => {
      const l = Math.max(0, seconds - (Date.now() - t0) / 1000);
      setLeft(l);
      if (l === 0) {
        clearInterval(id);
        done.current?.();
      }
    }, 200);
    return () => clearInterval(id);
  }, [seconds]);
  return (
    <div>
      <div className="mb-1.5 flex justify-between text-[11px] font-bold uppercase tracking-widest">
        <span className="text-green">{label ?? 'Rest'}</span>
        <span className="font-mono tabular-nums">
          {Math.floor(left / 60)}:{String(Math.ceil(left % 60) % 60).padStart(2, '0')}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-sm bg-surface-2">
        <motion.div className="h-full bg-green" initial={{ width: '100%' }} animate={{ width: `${(left / seconds) * 100}%` }} transition={{ ease: 'linear', duration: 0.2 }} />
      </div>
    </div>
  );
}

/** Big F1 number that ticks up — the telemetry readout used across stat tiles. */
export function Telemetry({ label, value, unit, accent }: { label: string; value: ReactNode; unit?: string; accent?: string }) {
  return (
    <div className="relative overflow-hidden border-l-[3px] bg-surface px-4 py-3" style={{ borderColor: accent ?? 'var(--accent)' }}>
      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-ink-3">{label}</p>
      <p className="mt-0.5 text-3xl font-black italic leading-none tabular-nums">
        {value}
        {unit && <span className="ml-1 text-sm font-bold not-italic text-ink-3">{unit}</span>}
      </p>
    </div>
  );
}
