import { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { Plus, Search } from 'lucide-react';
import { MUSCLES, searchExercises, type Muscle } from '../core/exercises';
import { Button, Chip, Sheet, cx } from './ui';

/** Searchable exercise library. Opens filtered to `muscles` (today's split); "All" widens it. */
export function ExercisePicker({ open, onClose, onPick, muscles, title = 'Add exercise', exclude = [] }: {
  open: boolean;
  onClose: () => void;
  onPick: (name: string) => void;
  muscles: Muscle[];
  title?: string;
  exclude?: string[];
}) {
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Muscle | 'Today' | 'All'>('Today');
  const list = useMemo(() => {
    const m = filter === 'All' ? null : filter === 'Today' ? muscles : [filter];
    return searchExercises(q, q ? null : m).filter((e) => !exclude.includes(e.name));
  }, [q, filter, muscles, exclude]);
  const pick = (name: string) => {
    onPick(name);
    setQ('');
    onClose();
  };
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <div className="relative mb-3">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search 200+ exercises — e.g. incline db, cable fly" className="field h-12 w-full !pl-9 text-base" />
      </div>
      {!q && (
        <div className="no-scrollbar -mx-1 mb-3 flex gap-1.5 overflow-x-auto px-1">
          {(['Today', 'All', ...MUSCLES] as const).map((m) => (
            <Chip key={m} active={filter === m} onClick={() => setFilter(m)}>
              {m}
            </Chip>
          ))}
        </div>
      )}
      <ul className="max-h-[52vh] space-y-1 overflow-y-auto pr-1">
        {list.map((e, i) => (
          <motion.li key={e.name} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: Math.min(i, 12) * 0.015 }}>
            <button onClick={() => pick(e.name)} className="flex w-full items-center gap-3 rounded-md bg-bg px-3 py-3 text-left active:bg-surface-2">
              <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">{e.name}</span>
              <span className="text-[11px] font-bold uppercase text-ink-3">{e.muscle}</span>
              <span className={cx('slant px-2 text-[10px] font-black uppercase', 'bg-surface-2 text-ink-2')}>{e.equipment}</span>
            </button>
          </motion.li>
        ))}
      </ul>
      {q.trim() && (
        <Button variant="ghost" className="mt-3 w-full" onClick={() => pick(q.trim())}>
          <Plus className="size-4" /> Use “{q.trim()}” as a custom exercise
        </Button>
      )}
    </Sheet>
  );
}
