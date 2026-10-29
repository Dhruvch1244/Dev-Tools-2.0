import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { RotateCw } from 'lucide-react';
import { flushOutbox, queryClient } from '../lib/api';
import { haptic } from '../lib/format';

const TRIGGER = 72;
// Places where a downward drag means something else: sheets, maps, the code editor, the viz scrubber.
const IGNORE = '[role=dialog], .track-map, .cm-editor, input, textarea, select, [data-no-pull]';

/** Pull-to-refresh for touch screens — an installed iPhone web app has no browser reload button. */
export async function refreshAll() {
  void navigator.serviceWorker?.getRegistration().then((r) => r?.update());
  await flushOutbox();
  await queryClient.refetchQueries({ type: 'active' });
}

export function PullRefresh() {
  const [pull, setPull] = useState(0);
  const [busy, setBusy] = useState(false);
  const start = useRef<number | null>(null);
  const pullRef = useRef(0);

  useEffect(() => {
    if (!matchMedia('(pointer: coarse)').matches) return;
    const down = (e: TouchEvent) => {
      const el = e.target as Element;
      start.current = window.scrollY <= 0 && e.touches.length === 1 && !el.closest(IGNORE) ? e.touches[0].clientY : null;
    };
    const move = (e: TouchEvent) => {
      if (start.current == null) return;
      const dy = e.touches[0].clientY - start.current;
      // Scrolling back up past the top cancels; resistance makes it feel attached to the finger.
      const p = dy > 0 && window.scrollY <= 0 ? Math.min(120, dy * 0.5) : 0;
      if ((p >= TRIGGER) !== (pullRef.current >= TRIGGER) && p >= TRIGGER) haptic(8);
      pullRef.current = p;
      setPull(p);
    };
    const up = async () => {
      const p = pullRef.current;
      start.current = null;
      pullRef.current = 0;
      setPull(0);
      if (p < TRIGGER) return;
      setBusy(true);
      const t = Date.now();
      try {
        await refreshAll();
      } finally {
        // Keep the spinner up long enough to register that something happened.
        setTimeout(() => setBusy(false), Math.max(0, 600 - (Date.now() - t)));
      }
    };
    window.addEventListener('touchstart', down, { passive: true });
    window.addEventListener('touchmove', move, { passive: true });
    window.addEventListener('touchend', up);
    window.addEventListener('touchcancel', up);
    return () => {
      window.removeEventListener('touchstart', down);
      window.removeEventListener('touchmove', move);
      window.removeEventListener('touchend', up);
      window.removeEventListener('touchcancel', up);
    };
  }, []);

  const shown = busy ? TRIGGER : pull;
  if (!shown) return null;
  const ready = pull >= TRIGGER;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-[env(safe-area-inset-top)] z-[45] flex justify-center lg:hidden" aria-live="polite">
      <motion.div
        animate={{ y: shown * 0.6, opacity: Math.min(1, shown / 40) }}
        transition={{ duration: 0 }}
        className="slant flex items-center gap-2 bg-accent px-4 py-1.5 text-tiny font-black uppercase italic tracking-wider text-white shadow-[0_10px_24px_-8px_var(--accent)]"
      >
        <motion.span animate={busy ? { rotate: 360 } : { rotate: pull * 3 }} transition={busy ? { repeat: Infinity, duration: 0.7, ease: 'linear' } : { duration: 0 }}>
          <RotateCw className="size-3.5" strokeWidth={3} />
        </motion.span>
        {busy ? 'Box box — syncing' : ready ? 'Release to refresh' : 'Pull to refresh'}
      </motion.div>
    </div>
  );
}
