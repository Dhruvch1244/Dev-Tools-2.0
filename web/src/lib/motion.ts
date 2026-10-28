import type { Transition, Variants } from 'motion/react';

/** One motion vocabulary for the whole app: physical springs for things you touch, expo easing for things that appear. */
export const spring = { type: 'spring', stiffness: 420, damping: 32, mass: 0.8 } satisfies Transition;
export const softSpring = { type: 'spring', stiffness: 220, damping: 26 } satisfies Transition;
export const bouncy = { type: 'spring', stiffness: 520, damping: 18 } satisfies Transition;
export const easeOut = [0.16, 1, 0.3, 1] as const;

export const stagger: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.055, delayChildren: 0.04 } },
};

export const rise: Variants = {
  hidden: { opacity: 0, y: 18, filter: 'blur(6px)' },
  show: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.55, ease: easeOut } },
};

/** For list rows entering/leaving with AnimatePresence + layout. */
export const listItem = {
  initial: { opacity: 0, y: 10, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1, transition: spring },
  exit: { opacity: 0, x: -24, scale: 0.96, transition: { duration: 0.18 } },
};
