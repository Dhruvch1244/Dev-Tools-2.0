import { useEffect, useId, useRef, useState, type ComponentProps, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useMotionValue, useSpring, useTransform, type HTMLMotionProps } from 'motion/react';
import { Trash2, X } from 'lucide-react';
import { bouncy, rise, spring, stagger } from '../lib/motion';
import { haptic } from '../lib/format';

const cx = (...c: (string | number | false | null | undefined)[]) => c.filter(Boolean).join(' ');
export { cx };

// ---------- Layout ----------
export function Page({ children }: { children: ReactNode }) {
  return (
    <motion.div variants={stagger} initial="hidden" animate="show" className="mx-auto w-full max-w-6xl px-4 pb-36 pt-6 sm:px-8 sm:pt-10 lg:pb-16">
      {children}
    </motion.div>
  );
}

export function Rise({ className, ...props }: HTMLMotionProps<'div'>) {
  return <motion.div variants={rise} className={className} {...props} />;
}

export function PageHeader({ eyebrow, title, action }: { eyebrow?: string; title: ReactNode; action?: ReactNode }) {
  return (
    <Rise className="mb-6 flex flex-wrap items-end justify-between gap-4 sm:mb-8">
      <div className="min-w-0">
        {eyebrow && (
          <motion.p initial={{ x: -20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1], delay: 0.2 }} className="slant mb-3 inline-block whitespace-nowrap bg-accent px-3 py-0.5 text-[12px] font-black italic uppercase tracking-[0.12em] text-white">
            {eyebrow}
          </motion.p>
        )}
        <h1 className="font-display text-[clamp(2.2rem,5vw,3.6rem)] leading-[0.95]">{title}</h1>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </Rise>
  );
}

export function Card({ className, children, ...props }: HTMLMotionProps<'div'>) {
  return (
    <motion.div variants={rise} className={cx('glass rounded-3xl p-5', className)} {...props}>
      {children}
    </motion.div>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <h2 className="font-display text-[17px]">{children}</h2>
      {action}
    </div>
  );
}

// ---------- Controls ----------
type ButtonProps = HTMLMotionProps<'button'> & { variant?: 'primary' | 'ghost' | 'soft' | 'danger'; size?: 'sm' | 'md' };
export function Button({ variant = 'primary', size = 'md', className, ...props }: ButtonProps) {
  return (
    <motion.button
      whileHover={{ y: -1 }}
      whileTap={{ scale: 0.95 }}
      transition={spring}
      className={cx(
        'inline-flex shrink-0 items-center justify-center gap-2 rounded-lg font-bold uppercase tracking-wide transition-colors disabled:pointer-events-none disabled:opacity-40',
        size === 'md' ? 'h-11 px-5 text-[13px]' : 'h-9 px-3.5 text-[12px]',
        variant === 'primary' && 'bg-accent text-accent-ink shadow-[0_8px_24px_-8px_var(--accent)] hover:brightness-110',
        variant === 'soft' && 'bg-accent-soft text-accent hover:bg-accent/25',
        variant === 'ghost' && 'text-ink-2 hover:bg-surface-2 hover:text-ink',
        variant === 'danger' && 'bg-danger/15 text-danger hover:bg-danger/25',
        className,
      )}
      {...props}
    />
  );
}

export function IconButton({ label, className, ...props }: HTMLMotionProps<'button'> & { label: string }) {
  return (
    <motion.button
      aria-label={label}
      title={label}
      whileTap={{ scale: 0.85 }}
      transition={bouncy}
      className={cx('grid size-9 shrink-0 place-items-center rounded-full text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink', className)}
      {...props}
    />
  );
}

export function Input(props: ComponentProps<'input'>) {
  return <input {...props} className={cx('field w-full', props.className)} />;
}
export function Textarea(props: ComponentProps<'textarea'>) {
  return <textarea {...props} className={cx('field w-full resize-none', props.className)} />;
}

/** Segmented control with a sliding pill (shared layoutId). */
export function Segmented<T extends string>({ options, value, onChange, className }: {
  options: { value: T; label: ReactNode }[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
}) {
  const id = useId();
  return (
    <div role="tablist" className={cx('glass inline-flex rounded-lg p-1', className)}>
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={value === o.value}
          onClick={() => (haptic(), onChange(o.value))}
          className={cx('relative h-8 flex-1 rounded-md px-3.5 text-[12px] font-bold uppercase tracking-wide transition-colors', value === o.value ? 'text-accent-ink' : 'text-ink-2 hover:text-ink')}
        >
          {value === o.value && <motion.span layoutId={`seg-${id}`} transition={spring} className="absolute inset-0 rounded-md bg-accent" />}
          <span className="relative z-10 whitespace-nowrap">{o.label}</span>
        </button>
      ))}
    </div>
  );
}

/** Round checkbox: the tick draws itself and a ring of sparks bursts outward. */
export function Check({ checked, onChange, label, color = 'var(--accent)' }: { checked: boolean; onChange: () => void; label: string; color?: string }) {
  const [burst, setBurst] = useState(0);
  return (
    <motion.button
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={() => {
        if (!checked) setBurst((b) => b + 1);
        haptic(checked ? 6 : 14);
        onChange();
      }}
      whileTap={{ scale: 0.8 }}
      transition={bouncy}
      className="relative grid size-6 shrink-0 place-items-center rounded-full border-2 transition-colors duration-200"
      style={{ borderColor: checked ? color : 'var(--line-strong)', background: checked ? color : 'transparent' }}
    >
      <svg viewBox="0 0 24 24" className="size-3.5">
        <motion.path
          d="M5 12.5l4.5 4.5L19 7.5"
          fill="none"
          stroke="white"
          strokeWidth={3.2}
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={false}
          animate={{ pathLength: checked ? 1 : 0, opacity: checked ? 1 : 0 }}
          transition={{ duration: 0.28, ease: 'easeOut' }}
        />
      </svg>
      <AnimatePresence>
        {burst > 0 && checked && (
          <motion.span key={burst} className="pointer-events-none absolute inset-0" initial="a" animate="b" exit={{ opacity: 0 }}>
            {Array.from({ length: 8 }, (_, i) => {
              const a = (i / 8) * Math.PI * 2;
              return (
                <motion.span
                  key={i}
                  className="absolute left-1/2 top-1/2 size-1.5 rounded-full"
                  style={{ background: i % 2 ? 'var(--pink)' : color, marginLeft: -3, marginTop: -3 }}
                  variants={{ a: { x: 0, y: 0, opacity: 1, scale: 1 }, b: { x: Math.cos(a) * 20, y: Math.sin(a) * 20, opacity: 0, scale: 0.3 } }}
                  transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
                />
              );
            })}
          </motion.span>
        )}
      </AnimatePresence>
    </motion.button>
  );
}

/** Rolls numbers with a spring instead of snapping. */
export function AnimatedNumber({ value, format = (n) => Math.round(n).toString() }: { value: number; format?: (n: number) => string }) {
  const mv = useSpring(value, { stiffness: 90, damping: 22 });
  const fmt = useRef(format);
  fmt.current = format;
  const [text, setText] = useState(() => format(value));
  useEffect(() => mv.on('change', (v) => setText(fmt.current(v))), [mv]);
  useEffect(() => {
    mv.set(value);
    setText(fmt.current(mv.get()));
  }, [value, mv]);
  return <span className="tabular-nums">{text}</span>;
}

export function ProgressRing({ value, size = 44, stroke = 5, color = 'var(--accent)', children }: { value: number; size?: number; stroke?: number; color?: string; children?: ReactNode }) {
  const r = (size - stroke) / 2;
  return (
    <div className="relative grid shrink-0 place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line-strong)" strokeWidth={stroke} />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: Math.min(1, Math.max(0, value)) }}
          transition={{ type: 'spring', stiffness: 60, damping: 16 }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">{children}</div>
    </div>
  );
}

export function Empty({ icon, title, hint }: { icon: ReactNode; title: string; hint?: string }) {
  return (
    <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={spring} className="flex flex-col items-center px-6 py-10 text-center">
      <motion.div animate={{ y: [0, -6, 0] }} transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }} className="mb-3 grid size-14 place-items-center rounded-2xl bg-accent-soft text-accent">
        {icon}
      </motion.div>
      <p className="font-medium">{title}</p>
      {hint && <p className="mt-1 max-w-xs text-sm text-ink-3">{hint}</p>}
    </motion.div>
  );
}

export function Chip({ active, onClick, children }: { active?: boolean; onClick?: () => void; children: ReactNode }) {
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.92 }}
      transition={bouncy}
      onClick={onClick}
      className={cx(
        'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border px-3 text-[13px] font-semibold transition-colors',
        active ? 'border-transparent bg-accent text-accent-ink' : 'border-line bg-surface text-ink-2 hover:text-ink',
      )}
    >
      {children}
    </motion.button>
  );
}

// ---------- Swipe-to-delete row ----------
export function SwipeRow({ onDelete, children, className }: { onDelete: () => void; children: ReactNode; className?: string }) {
  const x = useMotionValue(0);
  const trashOpacity = useTransform(x, [-100, -30], [1, 0]);
  const trashScale = useTransform(x, [-110, -40], [1.15, 0.6]);
  return (
    <div className={cx('relative overflow-hidden rounded-2xl', className)}>
      <motion.div style={{ opacity: trashOpacity }} className="absolute inset-0 flex items-center justify-end rounded-2xl bg-danger/20 pr-5 text-danger">
        <motion.span style={{ scale: trashScale }}>
          <Trash2 className="size-5" />
        </motion.span>
      </motion.div>
      <motion.div
        drag="x"
        dragDirectionLock
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={{ left: 0.7, right: 0.05 }}
        style={{ x }}
        onDragEnd={(_, i) => {
          if (i.offset.x < -100 || i.velocity.x < -700) (haptic(20), onDelete());
        }}
        className="relative touch-pan-y"
      >
        {children}
      </motion.div>
    </div>
  );
}

// ---------- Sheet: bottom sheet on phones, floating dialog on desktop ----------
export function useIsMobile() {
  const [m, setM] = useState(() => matchMedia('(max-width: 640px)').matches);
  useEffect(() => {
    const mq = matchMedia('(max-width: 640px)');
    const on = () => setM(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return m;
}

export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title?: ReactNode; children: ReactNode }) {
  const mobile = useIsMobile();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div key="sheet" className="fixed inset-0 z-50">
          <motion.div className="absolute inset-0 bg-black/45 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <div className={cx('pointer-events-none absolute inset-0 flex justify-center', mobile ? 'items-end' : 'items-start pt-[10vh]')}>
            <motion.div
              role="dialog"
              aria-modal
              initial={mobile ? { y: '100%' } : { opacity: 0, y: 24, scale: 0.95, filter: 'blur(8px)' }}
              animate={mobile ? { y: 0 } : { opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
              exit={mobile ? { y: '100%' } : { opacity: 0, y: 12, scale: 0.97, filter: 'blur(4px)' }}
              transition={{ type: 'spring', stiffness: 380, damping: 36 }}
              drag={mobile ? 'y' : false}
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={{ top: 0, bottom: 0.7 }}
              onDragEnd={(_, i) => (i.offset.y > 110 || i.velocity.y > 600) && onClose()}
              className={cx(
                'pointer-events-auto relative max-h-[88dvh] w-full overflow-y-auto border border-line bg-surface-solid shadow-2xl',
                mobile ? 'rounded-t-[28px] px-5 pb-[calc(env(safe-area-inset-bottom)+20px)] pt-3' : 'max-w-lg rounded-[28px] p-6',
              )}
            >
              {mobile && <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-line-strong" />}
              {title && (
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="font-display text-xl font-semibold tracking-tight">{title}</h3>
                  <IconButton label="Close" onClick={onClose}>
                    <X className="size-4" />
                  </IconButton>
                </div>
              )}
              {children}
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
