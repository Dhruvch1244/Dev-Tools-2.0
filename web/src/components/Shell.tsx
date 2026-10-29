import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router';
import { AnimatePresence, motion } from 'motion/react';
import { Binary, ChevronLeft, Droplets, Dumbbell, HeartPulse, House, LayoutGrid, ListTodo, Plus, Send, Settings as SettingsIcon, StickyNote, Utensils, Wallet } from 'lucide-react';
import { mealForNow } from '../core/fuel';
import { FoodSearch } from '../pages/Fuel';
import { useHealthToday } from '../pages/Life';
import { useLiveSync, useSettings } from '../lib/api';
import { bouncy, easeOut, spring } from '../lib/motion';
import { haptic, today } from '../lib/format';
import { useReminders } from '../lib/reminders';
import { DAY_META, dayTypeOn } from '../core/gym';
import { ExpenseForm, QuickNoteForm, TaskForm } from './forms';
import { SettingsSheet } from './SettingsSheet';
import { Sheet, Textarea, Button, cx } from './ui';
import { sendDrop } from '../lib/drop';
import { useToast } from './toast';

export const NAV_GROUPS = [
  {
    label: 'Paddock',
    items: [
      { to: '/', label: 'Today', icon: House },
      { to: '/tasks', label: 'Tasks', icon: ListTodo },
      { to: '/notes', label: 'Notes', icon: StickyNote },
      { to: '/money', label: 'Money', icon: Wallet },
      { to: '/drop', label: 'Drop', icon: Send },
    ],
  },
  {
    label: 'Body',
    items: [
      { to: '/gym', label: 'Gym', icon: Dumbbell },
      { to: '/fuel', label: 'Fuel', icon: Utensils },
      { to: '/life', label: 'Life', icon: HeartPulse },
    ],
  },
  { label: 'Mind', items: [{ to: '/dsa', label: 'DSA Season', icon: Binary }] },
];
const NAV = NAV_GROUPS.flatMap((g) => g.items);
const MOBILE_TABS = ['/', '/gym', '/fuel', '/dsa'];

function Logo() {
  return (
    <div className="flex items-center gap-3">
      <motion.div whileHover={{ skewX: -10, scale: 1.05 }} transition={bouncy} className="slant grid h-9 w-14 place-items-center bg-accent text-[15px] font-black italic text-white">
        2.0
      </motion.div>
      <div className="leading-none">
        <p className="text-[17px] font-black italic uppercase tracking-tight">Dev Tools</p>
        <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.2em] text-ink-3">Season 26</p>
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

/** The deck's signature: three skewed stripes sweep across on every section change. */
function Wipe({ k }: { k: string }) {
  return (
    <motion.div key={k} className="wipe" initial={{ x: '110%' }} animate={{ x: '-130%' }} transition={{ duration: 0.75, ease: [0.7, 0, 0.3, 1] }} aria-hidden>
      <i style={{ width: '18vw', background: 'var(--accent)' }} />
      <i style={{ width: '4vw', background: '#f3f3f3' }} />
      <i style={{ width: '10vw', background: 'var(--bg-outer)' }} />
    </motion.div>
  );
}

function Hud() {
  const { settings } = useSettings();
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const day = dayTypeOn(today(), settings.gymShift ?? 0);
  const meta = DAY_META[day];
  return (
    <div className="pointer-events-none sticky top-0 z-30 hidden items-center justify-between px-8 pt-5 lg:flex">
      <NavLink to="/gym" className="pointer-events-auto flex items-center gap-2.5 text-[13px] font-black italic uppercase tracking-wider">
        <span className="slant px-3 py-1 text-white" style={{ background: meta.color === '#6a7080' ? 'var(--line-strong)' : meta.color, color: day === 'legs' ? '#111' : undefined }}>
          {meta.short}
        </span>
        <span>{day === 'rest' ? 'Rest day · pit stop' : `${meta.label} day`}</span>
      </NavLink>
      <div className="flex items-stretch font-mono text-[13px]">
        <span className="bg-ink px-2.5 py-1 font-bold text-bg">{now.toLocaleDateString(undefined, { weekday: 'short' }).toUpperCase()}</span>
        <span className="border border-l-0 border-line bg-surface-2 px-3 py-1 tabular-nums text-ink-2">
          {now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
        </span>
      </div>
    </div>
  );
}

type QuickKind = 'menu' | 'task' | 'expense' | 'note' | 'drop' | 'food';

const QUICK_TILES: { kind: QuickKind | 'water' | 'gym'; label: string; icon: typeof House; color: string }[] = [
  { kind: 'food', label: 'Food', icon: Utensils, color: 'var(--green)' },
  { kind: 'water', label: 'Water +1', icon: Droplets, color: 'var(--sky)' },
  { kind: 'gym', label: 'Gym set', icon: Dumbbell, color: 'var(--yellow)' },
  { kind: 'task', label: 'Task', icon: ListTodo, color: 'var(--accent)' },
  { kind: 'expense', label: 'Expense', icon: Wallet, color: 'var(--purple)' },
  { kind: 'note', label: 'Note', icon: StickyNote, color: 'var(--accent-2)' },
  { kind: 'drop', label: 'Drop', icon: Send, color: 'var(--ink-2)' },
];
const TITLES: Record<QuickKind, string> = { menu: 'Quick add', task: 'New task', expense: 'Money', note: 'Note', drop: 'Drop', food: 'Log food' };

function QuickAdd({ open, onClose, kind, setKind }: { open: boolean; onClose: () => void; kind: QuickKind; setKind: (k: QuickKind) => void }) {
  const [text, setText] = useState('');
  const [meal, setMeal] = useState<string>(mealForNow());
  const toast = useToast();
  const navigate = useNavigate();
  const health = useHealthToday();
  useEffect(() => {
    if (open) setMeal(mealForNow());
  }, [open]);

  const tap = (k: (typeof QUICK_TILES)[number]['kind']) => {
    haptic(10);
    if (k === 'water') {
      const before = health.get('water') ?? 0;
      health.set({ kind: 'water', value: before + 1 });
      toast({ message: `💧 ${before + 1} glasses today`, action: { label: 'Undo', onClick: () => health.set({ kind: 'water', value: before }) } });
      onClose();
    } else if (k === 'gym') {
      navigate('/gym');
      onClose();
    } else setKind(k);
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={
        <span className="flex items-center gap-2">
          {kind !== 'menu' && (
            <button onClick={() => setKind('menu')} className="grid size-8 place-items-center rounded-md bg-surface-2 text-ink-2" aria-label="Back to quick add">
              <ChevronLeft className="size-4" />
            </button>
          )}
          {TITLES[kind]}
        </span>
      }
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={kind} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.18, ease: easeOut }}>
          {kind === 'menu' && (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {QUICK_TILES.map((t, i) => (
                <motion.button
                  key={t.kind}
                  initial={{ opacity: 0, y: 14, scale: 0.92 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ ...spring, delay: i * 0.03 }}
                  whileTap={{ scale: 0.92 }}
                  onClick={() => tap(t.kind)}
                  className="relative flex aspect-square flex-col items-center justify-center gap-2 overflow-hidden rounded-xl border border-line bg-bg"
                >
                  <span className="absolute inset-x-0 top-0 h-[3px]" style={{ background: t.color }} />
                  <t.icon className="size-7" style={{ color: t.color }} />
                  <span className="text-[12px] font-black uppercase italic tracking-wide">{t.label}</span>
                </motion.button>
              ))}
            </div>
          )}
          {kind === 'food' && <FoodSearch date={today()} meal={meal} onMealChange={setMeal} />}
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

function RailLink({ to, label, icon: Icon }: { to: string; label: string; icon: typeof House }) {
  return (
    <NavLink to={to} end={to === '/'} className="relative block">
      {({ isActive }) => (
        <motion.div whileHover={{ x: 4 }} transition={spring} className={cx('relative flex h-10 items-center gap-3 px-4 text-[14px] font-bold uppercase tracking-wide transition-colors', isActive ? 'text-ink' : 'text-ink-3 hover:text-ink')}>
          {isActive && (
            <motion.span layoutId="rail-pill" transition={spring} className="absolute inset-0 bg-gradient-to-r from-accent-soft to-transparent">
              <span className="absolute inset-y-0 left-0 w-[3px] bg-accent" />
            </motion.span>
          )}
          <Icon className="relative size-[17px]" strokeWidth={isActive ? 2.5 : 2} />
          <span className="relative">{label}</span>
        </motion.div>
      )}
    </NavLink>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const online = useLiveSync();
  useReminders();
  const location = useLocation();
  const [quick, setQuick] = useState(false);
  const [quickKind, setQuickKind] = useState<QuickKind>('task');
  const [settings, setSettings] = useState(false);
  const [more, setMore] = useState(false);
  const section = '/' + (location.pathname.split('/')[1] ?? '');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setQuickKind('menu');
        setQuick((q) => !q);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Most pages open the tile menu; a few jump straight to the one thing you add there.
  const defaultKind: Record<string, QuickKind> = { '/fuel': 'food', '/money': 'expense', '/notes': 'note', '/drop': 'drop', '/tasks': 'task' };
  const openQuick = () => {
    haptic(12);
    setQuickKind(defaultKind[section] ?? 'menu');
    setQuick(true);
  };

  return (
    <div className="min-h-dvh lg:pl-60">
      <div className="carbon-bg" aria-hidden>
        <div className="weave" />
        <div className="speedlines" />
        <div className="redglow" />
        <div className="topglow" />
      </div>

      {/* Desktop rail */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-line bg-bg-outer/80 backdrop-blur-xl lg:flex">
        <div className="px-5 pt-6">
          <Logo />
        </div>
        <motion.button
          whileHover={{ y: -2 }}
          whileTap={{ scale: 0.97 }}
          transition={spring}
          onClick={openQuick}
          className="mx-5 mt-7 flex h-10 items-center gap-2 bg-accent px-4 text-[13px] font-black italic uppercase tracking-wide text-white shadow-[0_10px_30px_-10px_var(--accent)]"
        >
          <Plus className="size-4" strokeWidth={3} /> Quick add
          <kbd className="ml-auto rounded bg-black/25 px-1.5 py-0.5 font-mono text-[10px] not-italic">⌘K</kbd>
        </motion.button>
        <nav className="mt-6 flex-1 space-y-5 overflow-y-auto no-scrollbar">
          {NAV_GROUPS.map((g) => (
            <div key={g.label}>
              <p className="mb-1.5 px-5 text-[10px] font-black uppercase tracking-[0.25em] text-ink-3">{g.label}</p>
              {g.items.map((it) => (
                <RailLink key={it.to} {...it} />
              ))}
            </div>
          ))}
        </nav>
        <div className="mx-5 mb-4 flex items-center justify-between border border-line bg-surface px-3 py-2.5 text-xs font-semibold uppercase tracking-wider text-ink-3">
          <span className="flex items-center gap-2">
            <LiveDot online={online} /> {online ? 'Telemetry live' : 'Offline'}
          </span>
          <button onClick={() => setSettings(true)} className="rounded p-1.5 transition hover:bg-surface-2 hover:text-ink" aria-label="Settings">
            <SettingsIcon className="size-4" />
          </button>
        </div>
        <div className="kerb h-[6px] w-full opacity-90" />
      </aside>

      <Hud />

      {/* Mobile top-right status */}
      <div className="fixed right-3 top-[calc(env(safe-area-inset-top)+10px)] z-30 lg:hidden">
        <button onClick={() => setSettings(true)} className="glass-bar flex h-9 items-center gap-2 rounded-full px-3 text-ink-2" aria-label="Settings">
          <LiveDot online={online} />
          <SettingsIcon className="size-4" />
        </button>
      </div>

      <AnimatePresence initial={false}>
        <Wipe k={section} />
      </AnimatePresence>
      <AnimatePresence mode="wait" initial={false}>
        <motion.main
          key={location.pathname}
          initial={{ opacity: 0, scale: 0.992 }}
          animate={{ opacity: 1, scale: 1, transition: { duration: 0.4, delay: 0.16, ease: [0.2, 0.8, 0.2, 1] } }}
          exit={{ opacity: 0, transition: { duration: 0.12 } }}
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
        className="fixed bottom-[calc(env(safe-area-inset-bottom)+84px)] right-4 z-40 grid size-14 place-items-center rounded-2xl bg-accent text-white shadow-[0_14px_34px_-8px_var(--accent)] lg:hidden"
      >
        <Plus className="size-6" strokeWidth={2.5} />
      </motion.button>
      <nav className="glass-bar fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+10px)] z-40 flex h-[64px] items-stretch rounded-2xl px-1.5 lg:hidden">
        {NAV.filter((n) => MOBILE_TABS.includes(n.to)).map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} end={to === '/'} onClick={() => haptic()} className="relative flex flex-1 flex-col items-center justify-center gap-0.5">
            {({ isActive }) => (
              <>
                {isActive && <motion.span layoutId="tab-pill" transition={spring} className="absolute inset-x-1 inset-y-1.5 rounded-xl bg-accent-soft" />}
                <Icon className={cx('relative size-[21px]', isActive ? 'text-accent' : 'text-ink-3')} strokeWidth={isActive ? 2.4 : 2} />
                <span className={cx('relative text-[10px] font-bold uppercase', isActive ? 'text-accent' : 'text-ink-3')}>{label.split(' ')[0]}</span>
              </>
            )}
          </NavLink>
        ))}
        <button onClick={() => setMore(true)} className="relative flex flex-1 flex-col items-center justify-center gap-0.5 text-ink-3">
          <LayoutGrid className="size-[21px]" />
          <span className="text-[10px] font-bold uppercase">More</span>
        </button>
      </nav>
      <Sheet open={more} onClose={() => setMore(false)} title="Everything">
        <div className="grid grid-cols-3 gap-2">
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} end={to === '/'} onClick={() => setMore(false)} className="flex flex-col items-center gap-2 rounded-xl border border-line bg-bg py-4 text-xs font-bold uppercase">
              <Icon className="size-5 text-accent" />
              {label}
            </NavLink>
          ))}
        </div>
      </Sheet>

      <QuickAdd open={quick} onClose={() => setQuick(false)} kind={quickKind} setKind={setQuickKind} />
      <SettingsSheet open={settings} onClose={() => setSettings(false)} />
    </div>
  );
}
