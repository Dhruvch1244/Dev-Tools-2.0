import { motion } from 'motion/react';
import type { Region } from '../core/gymStats';
import { cx } from './ui';

// A front and back figure in the F1 carbon style: muscles are flat panels that fill red with how
// hard they're hit (0..1). Each side is drawn once (the figure's right) and mirrored.

type Panel = { m: Region; d: string };
const FRONT: Panel[] = [
  { m: 'Traps', d: 'M54 34 L45 41 L55 43 Z' },
  { m: 'Shoulders', d: 'M45 42 L35 45 L31 57 L36 65 L43 57 L46 48 Z' },
  { m: 'Chest', d: 'M47 46 L59 46 L59 69 L50 72 L42 66 L44 55 Z' },
  { m: 'Biceps', d: 'M31 60 L37 66 L38 85 L33 90 L28 84 L28 68 Z' },
  { m: 'Forearms', d: 'M28 91 L34 93 L33 117 L27 120 L23 112 L24 97 Z' },
  { m: 'Core', d: 'M51 74 L59 74 L59 119 L52 117 L50 96 Z' },
  { m: 'Core', d: 'M43 70 L49 74 L49 111 L44 107 L41 88 Z' },
  { m: 'Quads', d: 'M41 127 L57 132 L56 169 L50 186 L43 184 L39 160 Z' },
  { m: 'Calves', d: 'M43 193 L52 193 L52 223 L47 239 L43 235 L41 212 Z' },
];
const BACK: Panel[] = [
  { m: 'Traps', d: 'M54 33 L60 34 L60 70 L52 60 L44 44 Z' },
  { m: 'Rear delts', d: 'M44 45 L34 48 L31 58 L37 62 L44 54 Z' },
  { m: 'Back', d: 'M44 55 L52 61 L60 73 L60 100 L50 104 L42 90 L40 70 Z' },
  { m: 'Back', d: 'M50 105 L60 101 L60 118 L52 118 Z' },
  { m: 'Triceps', d: 'M31 60 L37 63 L38 84 L33 90 L28 84 L28 68 Z' },
  { m: 'Forearms', d: 'M28 91 L34 93 L33 117 L27 120 L23 112 L24 97 Z' },
  { m: 'Glutes', d: 'M42 119 L60 121 L60 142 L48 146 L40 136 Z' },
  { m: 'Hamstrings', d: 'M41 145 L57 147 L56 180 L48 186 L42 178 L39 160 Z' },
  { m: 'Calves', d: 'M42 192 L53 192 L54 214 L49 232 L43 228 L40 210 Z' },
];
// Neutral silhouette pieces (head, neck, hands, hips, knees, feet).
const SKIN = ['M54 31 L66 31 L66 40 L54 40 Z', 'M22 121 L29 121 L28 132 L22 130 Z', 'M42 111 L59 121 L59 128 L41 125 Z', 'M43 186 L51 187 L52 192 L43 192 Z', 'M43 240 L48 241 L50 248 L40 248 Z'];

function Figure({ panels, heat, label, pulse }: { panels: Panel[]; heat: Partial<Record<Region, number>>; label: string; pulse?: boolean }) {
  const fill = (m: Region) => {
    const v = heat[m] ?? 0;
    return v <= 0 ? 'var(--surface-2)' : `color-mix(in oklab, var(--accent) ${Math.round(15 + v * 85)}%, var(--surface-2))`;
  };
  const side = (mirror: boolean) => (
    <g transform={mirror ? 'translate(120 0) scale(-1 1)' : undefined}>
      {SKIN.map((d) => (
        <path key={d} d={d} fill="var(--surface)" stroke="var(--line)" strokeWidth="0.6" />
      ))}
      {panels.map((p, i) => {
        const v = heat[p.m] ?? 0;
        return (
          <motion.path
            key={p.d}
            d={p.d}
            fill={fill(p.m)}
            stroke={v > 0 ? 'color-mix(in oklab, var(--accent) 70%, transparent)' : 'var(--line)'}
            strokeWidth="0.7"
            strokeLinejoin="round"
            initial={{ opacity: 0 }}
            animate={pulse && v >= 0.6 ? { opacity: [0.75, 1, 0.75] } : { opacity: 1 }}
            transition={pulse && v >= 0.6 ? { duration: 2.2, repeat: Infinity, delay: i * 0.05 } : { duration: 0.4, delay: i * 0.03 }}
          >
            <title>{p.m}</title>
          </motion.path>
        );
      })}
    </g>
  );
  return (
    <figure className="flex min-w-0 flex-1 flex-col items-center">
      <svg viewBox="16 6 88 246" className="h-full max-h-64 w-full" role="img" aria-label={`${label} muscles`}>
        <circle cx="60" cy="20" r="11" fill="var(--surface)" stroke="var(--line)" strokeWidth="0.6" />
        {side(false)}
        {side(true)}
      </svg>
      <figcaption className="mt-1 text-micro font-black uppercase tracking-[0.25em] text-ink-3">{label}</figcaption>
    </figure>
  );
}

/** Front + back body map. `heat` is 0..1 per muscle; `pulse` breathes the hardest-hit panels. */
export function BodyMap({ heat, pulse, className }: { heat: Partial<Record<Region, number>>; pulse?: boolean; className?: string }) {
  return (
    <div className={cx('flex items-stretch gap-2', className)}>
      <Figure panels={FRONT} heat={heat} label="Front" pulse={pulse} />
      <Figure panels={BACK} heat={heat} label="Back" pulse={pulse} />
    </div>
  );
}
