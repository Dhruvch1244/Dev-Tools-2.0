import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router';
import { AnimatePresence, motion } from 'motion/react';
import { HeartPulse, House, ListTodo, Plus, Send, Settings as SettingsIcon, StickyNote, Wallet } from 'lucide-react';
import { useLiveSync } from '../lib/api';
import { bouncy, easeOut, spring } from '../lib/motion';
import { haptic } from '../lib/format';
import { useReminders } from '../lib/reminders';
import { ExpenseForm, QuickNoteForm, TaskForm } from './forms';
import { SettingsSheet } from './SettingsSheet';
import { Segmented, Sheet, Textarea, Button, cx } from './ui';
import { sendDrop } from '../lib/drop';
import { useToast } from './toast';

export const NAV = [
  { to: '/', label: 'Today', icon: House },
  { to: '/tasks', label: 'Tasks', icon: ListTodo },
  { to: '/notes', label: 'Notes', icon: StickyNote },
  { to: '/money', label: 'Money', icon: Wallet },
  { to: '/drop', label: 'Drop', icon: Send },
  { to: '/life', label: 'Life', icon: HeartPulse },
];

function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <motion.div
        whileHover={{ rotate: 12, scale: 1.08 }}
        transition={bouncy}
        className="grid size-9 place-items-center rounded-xl bg-[conic-gradient(from_200deg,var(--accent),var(--pink),var(--mint),var(--accent))] font-display text-sm font-bold text-white shadow-[0_8px_24px_-6px_var(--accent)]"
      >
        2.0
      </motion.div>
      <div className="leading-tight">
        <p className="font-display text-[15px] font-semibold tracking-tight">Dev Tools</p>
        <p className="text-[11px] text-ink-3">personal edition</p>
      </div>
    </div>
  );
}

function LiveDot({ online }: { online: boolean }) {
  return (
    <span className="relative inline-flex size-2" title={online ? 'Live — synced across devices' : 'Reconnecting…'}>
      {online && <span className="absolute inset-0 animate-ping rounded-full bg-good opacity-60" />}
      <span className={cx('relative size-2 rounded-full', online ? 'bg-good' : 'bg-warn')} />
    </span>
  );
}

type QuickKind = 'task' | 'expense' | 'note' | 'drop';

function QuickAdd({ open, onClose, kind, setKind }: { open: boolean; onClose: () => void; kind: QuickKind; setKind: (k: QuickKind) => void }) {
  const [text, setText] = useState('');
  const toast = useToast();
  return (
    <Sheet open={open} onClose={onClose} title="Quick add">
      <Segmented
        className="mb-5 w-full"
        value={kind}
        onChange={setKind}
        options={[
          { value: 'task', label: 'Task' },
          { value: 'expense', label: 'Money' },
          { value: 'note', label: 'Note' },
          { value: 'drop', label: 'Drop' },
        ]}
      />
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={kind} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.2, ease: easeOut }}>
          {kind === 'task' && <TaskForm autoFocus onDone={onClose} />}
          {kind === 'expense' && <ExpenseForm autoFocus onDone={onClose} />}
          {kind === 'note' && <QuickNoteForm autoFocus onDone={onClose} />}
          {kind === 'drop' && (
            <form
              className="space-y-3"
              onSubmit={async (e) => {
                e.preventDefault();
                if (!text.trim()) return;
                await sendDrop({ text });
                setText('');
                toast({ message: 'Dropped to all devices' });
                onClose();
              }}
            >
              <Textarea autoFocus rows={4} placeholder="Paste a link, OTP, address… it appears on your other devices instantly." value={text} onChange={(e) => setText(e.target.value)} />
              <Button type="submit" className="w-full" disabled={!text.trim()}>
                <Send className="size-4" /> Send
              </Button>
            </form>
          )}
        </motion.div>
      </AnimatePresence>
    </Sheet>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const online = useLiveSync();
  useReminders();
  const location = useLocation();
  const [quick, setQuick] = useState(false);
  const [quickKind, setQuickKind] = useState<QuickKind>('task');
  const [settings, setSettings] = useState(false);

  // ⌘K / Ctrl+K anywhere opens quick add.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setQuick((q) => !q);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const defaultKind: Record<string, QuickKind> = { '/money': 'expense', '/notes': 'note', '/drop': 'drop' };
  const openQuick = () => {
    haptic(12);
    setQuickKind(defaultKind[location.pathname] ?? 'task');
    setQuick(true);
  };

  return (
    <div className="min-h-dvh lg:pl-64">
      <div className="aurora" aria-hidden>
        <span />
        <span />
        <span />
      </div>
      <div className="grain" aria-hidden />

      {/* Desktop rail */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-line px-4 py-6 backdrop-blur-xl lg:flex">
        <div className="px-2">
          <Logo />
        </div>
        <motion.button
          whileHover={{ y: -2 }}
          whileTap={{ scale: 0.97 }}
          transition={spring}
          onClick={openQuick}
          className="mt-8 flex h-11 items-center gap-2 rounded-2xl bg-accent px-4 text-sm font-semibold text-accent-ink shadow-[0_10px_30px_-10px_var(--accent)]"
        >
          <Plus className="size-4" /> Quick add
          <kbd className="ml-auto rounded-md bg-white/20 px-1.5 py-0.5 font-mono text-[10px]">⌘K</kbd>
        </motion.button>
        <nav className="mt-6 flex flex-col gap-1">
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} end={to === '/'} className="relative">
              {({ isActive }) => (
                <motion.div whileHover={{ x: 3 }} transition={spring} className={cx('relative flex h-11 items-center gap-3 rounded-2xl px-4 text-sm font-medium transition-colors', isActive ? 'text-ink' : 'text-ink-3 hover:text-ink')}>
                  {isActive && <motion.span layoutId="rail-pill" transition={spring} className="absolute inset-0 rounded-2xl border border-line bg-surface-2" />}
                  <Icon className="relative size-[18px]" strokeWidth={isActive ? 2.4 : 2} />
                  <span className="relative">{label}</span>
                </motion.div>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto flex items-center justify-between rounded-2xl border border-line px-4 py-3 text-xs text-ink-3">
          <span className="flex items-center gap-2">
            <LiveDot online={online} /> {online ? 'Live sync' : 'Offline'}
          </span>
          <button onClick={() => setSettings(true)} className="rounded-full p-1.5 transition hover:bg-surface-2 hover:text-ink" aria-label="Settings">
            <SettingsIcon className="size-4" />
          </button>
        </div>
      </aside>

      {/* Mobile top-right status */}
      <div className="fixed right-3 top-[calc(env(safe-area-inset-top)+10px)] z-30 lg:hidden">
        <button onClick={() => setSettings(true)} className="glass-bar flex h-9 items-center gap-2 rounded-full px-3 text-ink-2" aria-label="Settings">
          <LiveDot online={online} />
          <SettingsIcon className="size-4" />
        </button>
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.main
          key={location.pathname}
          initial={{ opacity: 0, y: 14, filter: 'blur(8px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          exit={{ opacity: 0, y: -10, filter: 'blur(6px)' }}
          transition={{ duration: 0.32, ease: easeOut }}
          className="pt-[env(safe-area-inset-top)]"
        >
          {children}
        </motion.main>
      </AnimatePresence>

      {/* Mobile tab bar + FAB */}
      <motion.button
        aria-label="Quick add"
        onClick={openQuick}
        whileTap={{ scale: 0.88, rotate: 90 }}
        transition={bouncy}
        className="fixed bottom-[calc(env(safe-area-inset-bottom)+84px)] right-4 z-40 grid size-14 place-items-center rounded-2xl bg-accent text-accent-ink shadow-[0_14px_34px_-8px_var(--accent)] lg:hidden"
      >
        <Plus className="size-6" strokeWidth={2.5} />
      </motion.button>
      <nav className="glass-bar fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+10px)] z-40 flex h-[64px] items-stretch rounded-[26px] px-1.5 lg:hidden">
        {NAV.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} end={to === '/'} onClick={() => haptic()} className="relative flex flex-1 flex-col items-center justify-center gap-0.5">
            {({ isActive }) => (
              <>
                {isActive && <motion.span layoutId="tab-pill" transition={spring} className="absolute inset-x-1 inset-y-1.5 rounded-[20px] bg-accent-soft" />}
                <motion.span animate={{ y: isActive ? -1 : 0, scale: isActive ? 1.08 : 1 }} transition={bouncy} className="relative">
                  <Icon className={cx('size-[21px]', isActive ? 'text-accent' : 'text-ink-3')} strokeWidth={isActive ? 2.4 : 2} />
                </motion.span>
                <span className={cx('relative text-[10px] font-semibold', isActive ? 'text-accent' : 'text-ink-3')}>{label}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <QuickAdd open={quick} onClose={() => setQuick(false)} kind={quickKind} setKind={setQuickKind} />
      <SettingsSheet open={settings} onClose={() => setSettings(false)} />
    </div>
  );
}
