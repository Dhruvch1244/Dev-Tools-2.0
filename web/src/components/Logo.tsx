import { useEffect, useId, useState } from 'react';
import { motion, useAnimate } from 'motion/react';

/** The DT monogram from the app icon (public/icon.svg), as a reusable inline mark. */
export function Mark({ className }: { className?: string }) {
  // Unique per instance: with a shared id, a copy inside a hidden container (the desktop rail on
  // phones) owns the gradient and every other copy renders with no fill.
  const grad = `dt-chrome-${useId().replace(/:/g, '')}`;
  return (
    <svg viewBox="80 160 400 245" className={className} aria-hidden>
      <defs>
        <linearGradient id={grad} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" />
          <stop offset=".55" stopColor="#f1f2f4" />
          <stop offset="1" stopColor="#b9bec8" />
        </linearGradient>
      </defs>
      <g transform="translate(62 0) skewX(-13)">
        <path fill={`url(#${grad})`} fillRule="evenodd" d="M92 168 H226 L284 226 V336 L226 394 H92 Z M146 220 H204 L230 246 V316 L204 342 H146 Z" />
        <path fill={`url(#${grad})`} d="M300 168 H448 V222 H402 V394 H346 V222 H300 Z" />
        <path fill="var(--accent)" d="M92 274 H146 V288 H92 Z M230 274 H284 V288 H230 Z M346 274 H402 V288 H346 Z" />
      </g>
    </svg>
  );
}

/**
 * Animated logo: five start lights come on one by one, go out together ("lights out and away we
 * go"), and the mark whips forward with speed streaks. Replays on hover/tap. Reduced motion is
 * honoured by the app-wide MotionConfig (transforms skipped).
 */
export function Logo({ compact }: { compact?: boolean }) {
  const [scope, animate] = useAnimate();
  const [run, setRun] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const lights = Array.from({ length: 5 }, (_, i) => `[data-light="${i}"]`);
      await animate('[data-light]', { backgroundColor: '#1b1e26', boxShadow: '0 0 0 0 rgba(225,6,0,0)' }, { duration: 0 });
      for (const l of lights) {
        if (cancelled) return;
        await animate(l, { backgroundColor: '#ff1a10', boxShadow: '0 0 10px 2px rgba(255,26,16,.8)' }, { duration: 0.08 });
        await new Promise((r) => setTimeout(r, compact ? 110 : 170));
      }
      await new Promise((r) => setTimeout(r, 260));
      if (cancelled) return;
      void animate('[data-light]', { backgroundColor: '#1b1e26', boxShadow: '0 0 0 0 rgba(225,6,0,0)' }, { duration: 0.05 });
      void animate('[data-streak]', { x: [24, -36], opacity: [0, 1, 0] }, { duration: 0.55, ease: 'easeOut' });
      await animate('[data-mark]', { x: [-14, 3, 0], skewX: [-18, 4, 0], scale: [0.9, 1.06, 1] }, { duration: 0.5, ease: [0.16, 1, 0.3, 1] });
    })();
    return () => {
      cancelled = true;
    };
  }, [run, animate, compact]);

  return (
    <div ref={scope} onMouseEnter={() => setRun((r) => r + 1)} onClick={() => setRun((r) => r + 1)} className="flex select-none items-center gap-3">
      <div className="relative">
        {/* speed streaks trail off to the left when the mark launches */}
        <div className="pointer-events-none absolute -left-3 top-1/2 flex -translate-y-1/2 flex-col gap-[3px]">
          {[18, 26, 12].map((w, i) => (
            <span key={i} data-streak className="block h-[2px] rounded-full bg-white opacity-0" style={{ width: w, marginLeft: i * 4 }} />
          ))}
        </div>
        <motion.div data-mark className={compact ? 'w-10' : 'w-14'}>
          <Mark className="block w-full drop-shadow-[0_4px_10px_rgba(0,0,0,.7)]" />
        </motion.div>
      </div>
      <div className="leading-none">
        <div className="flex items-center gap-1.5">
          <p className={compact ? 'text-[15px] font-black italic uppercase tracking-tight' : 'text-[19px] font-black italic uppercase tracking-tight'}>Dev Tools</p>
          <span className="slant bg-accent px-1.5 text-micro font-black italic text-white">2.0</span>
        </div>
        <div className="mt-1.5 flex items-center gap-[3px]" aria-hidden>
          {Array.from({ length: 5 }, (_, i) => (
            <span key={i} data-light={i} className="size-[7px] rounded-full bg-surface-2" />
          ))}
          {!compact && <span className="ml-1.5 text-micro font-bold uppercase tracking-[0.2em] text-ink-3">Season 26</span>}
        </div>
      </div>
    </div>
  );
}
