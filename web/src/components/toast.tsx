import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { spring } from '../lib/motion';

type Toast = { id: number; message: string; action?: { label: string; onClick: () => void } };
const Ctx = createContext<(t: Omit<Toast, 'id'>) => void>(() => {});
export const useToast = () => useContext(Ctx);

let seq = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const push = useCallback(
    (t: Omit<Toast, 'id'>) => {
      const id = ++seq;
      setToasts((list) => [...list.slice(-2), { ...t, id }]);
      setTimeout(() => dismiss(id), t.action ? 5000 : 2600);
    },
    [dismiss],
  );

  return (
    <Ctx.Provider value={push}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+96px)] z-[60] flex flex-col items-center gap-2 px-4 lg:bottom-8">
        <AnimatePresence mode="popLayout">
          {toasts.map((t) => (
            <motion.div
              layout
              key={t.id}
              initial={{ opacity: 0, y: 24, scale: 0.9, filter: 'blur(6px)' }}
              animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
              exit={{ opacity: 0, y: 10, scale: 0.94, transition: { duration: 0.15 } }}
              transition={spring}
              className="pointer-events-auto flex items-center gap-4 rounded-full border border-line bg-surface-solid py-2 pl-5 pr-2 text-sm shadow-2xl"
            >
              <span>{t.message}</span>
              {t.action ? (
                <button
                  onClick={() => (t.action!.onClick(), dismiss(t.id))}
                  className="rounded-full bg-accent-soft px-3 py-1.5 text-[13px] font-semibold text-accent transition hover:bg-accent/25"
                >
                  {t.action.label}
                </button>
              ) : (
                <span className="w-2" />
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </Ctx.Provider>
  );
}
