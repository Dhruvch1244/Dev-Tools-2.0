import { useState, type FormEvent } from 'react';
import { motion } from 'motion/react';
import { Flag } from 'lucide-react';
import { useResource, useSettings } from '../lib/api';
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from '../lib/categories';
import { addDays, today } from '../lib/format';
import type { Expense, Task } from '../lib/types';
import { Button, Chip, Input, Segmented, Textarea, cx } from './ui';
import { useToast } from './toast';

const PRIORITIES = [
  { value: 0, label: 'None', color: 'var(--ink-3)' },
  { value: 1, label: 'Low', color: 'var(--mint)' },
  { value: 2, label: 'Med', color: 'var(--amber)' },
  { value: 3, label: 'High', color: 'var(--danger)' },
];
export const priorityColor = (p: number) => PRIORITIES[p]?.color ?? 'var(--ink-3)';

export function TaskForm({ onDone, autoFocus }: { onDone?: () => void; autoFocus?: boolean }) {
  const { create } = useResource<Task>('tasks');
  const toast = useToast();
  const [title, setTitle] = useState('');
  const [day, setDay] = useState<string | null>(today());
  const [time, setTime] = useState('');
  const [priority, setPriority] = useState(0);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    const due = day ? (time ? `${day}T${time}` : day) : null;
    await create({ title: title.trim(), due, priority, done: 0 });
    setTitle('');
    toast({ message: 'Task added' });
    onDone?.();
  };

  const days = [
    { label: 'Today', v: today() },
    { label: 'Tomorrow', v: addDays(today(), 1) },
    { label: 'Next week', v: addDays(today(), 7) },
    { label: 'Someday', v: null },
  ];

  return (
    <form onSubmit={submit} className="space-y-3">
      <Input autoFocus={autoFocus} placeholder="What needs doing?" value={title} onChange={(e) => setTitle(e.target.value)} className="h-12 text-base" />
      <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1">
        {days.map((d) => (
          <Chip key={d.label} active={day === d.v} onClick={() => setDay(d.v)}>
            {d.label}
          </Chip>
        ))}
        <input type="date" aria-label="Pick a date" value={day ?? ''} onChange={(e) => setDay(e.target.value || null)} className="field h-8 !rounded-full !py-0 text-[13px]" />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input type="time" aria-label="Remind me at" value={time} onChange={(e) => setTime(e.target.value)} disabled={!day} className="field h-9 w-32 !py-0 text-sm" />
        <div className="flex items-center gap-1">
          {PRIORITIES.map((p) => (
            <motion.button
              type="button"
              key={p.value}
              whileTap={{ scale: 0.85 }}
              onClick={() => setPriority(p.value)}
              aria-label={`Priority ${p.label}`}
              aria-pressed={priority === p.value}
              className={cx('grid size-9 place-items-center rounded-full transition', priority === p.value ? 'bg-surface-2 ring-1 ring-line-strong' : 'opacity-60 hover:opacity-100')}
            >
              <Flag className="size-4" style={{ color: p.color }} fill={priority === p.value && p.value ? p.color : 'none'} />
            </motion.button>
          ))}
        </div>
        <Button type="submit" className="ml-auto" disabled={!title.trim()}>
          Add task
        </Button>
      </div>
    </form>
  );
}

export function ExpenseForm({ onDone, autoFocus }: { onDone?: () => void; autoFocus?: boolean }) {
  const { create } = useResource<Expense>('expenses');
  const { settings } = useSettings();
  const toast = useToast();
  const [kind, setKind] = useState<'expense' | 'income'>('expense');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('Food');
  const [note, setNote] = useState('');
  const [date, setDate] = useState(today());
  const cats = kind === 'expense' ? EXPENSE_CATEGORIES : INCOME_CATEGORIES;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const n = Number(amount);
    if (!n || n <= 0) return;
    await create({ amount: n, kind, category, note: note.trim() || null, date });
    setAmount('');
    setNote('');
    toast({ message: kind === 'expense' ? 'Expense logged' : 'Income logged' });
    onDone?.();
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <Segmented
        className="w-full"
        value={kind}
        onChange={(k) => {
          setKind(k);
          setCategory(k === 'expense' ? 'Food' : 'Salary');
        }}
        options={[
          { value: 'expense', label: 'Spent' },
          { value: 'income', label: 'Received' },
        ]}
      />
      <label className="flex items-baseline justify-center gap-2 py-2">
        <span className="font-display text-3xl text-ink-3">{settings.currency ?? 'INR'}</span>
        <input
          autoFocus={autoFocus}
          inputMode="decimal"
          placeholder="0"
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))}
          className={cx('w-48 bg-transparent text-center font-display text-6xl font-semibold tracking-tight outline-none placeholder:text-ink-3', kind === 'income' && 'text-good')}
          aria-label="Amount"
        />
      </label>
      <div className="flex flex-wrap gap-2">
        {cats.map((c) => (
          <Chip key={c.name} active={category === c.name} onClick={() => setCategory(c.name)}>
            <span>{c.emoji}</span>
            {c.name}
          </Chip>
        ))}
      </div>
      <div className="flex gap-2">
        <Input placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
        <input type="date" aria-label="Date" value={date} onChange={(e) => setDate(e.target.value)} className="field w-40 shrink-0" />
      </div>
      <Button type="submit" className="w-full" disabled={!Number(amount)}>
        Save
      </Button>
    </form>
  );
}

export function QuickNoteForm({ onDone, autoFocus }: { onDone?: () => void; autoFocus?: boolean }) {
  const { create } = useResource('notes');
  const toast = useToast();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (!title.trim() && !body.trim()) return;
        await create({ title: title.trim() || null, body, pinned: 0 } as never);
        toast({ message: 'Note saved' });
        onDone?.();
      }}
      className="space-y-3"
    >
      <Input autoFocus={autoFocus} placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} className="font-display text-lg font-semibold" />
      <Textarea rows={6} placeholder="Write anything…" value={body} onChange={(e) => setBody(e.target.value)} />
      <Button type="submit" className="w-full" disabled={!title.trim() && !body.trim()}>
        Save note
      </Button>
    </form>
  );
}
