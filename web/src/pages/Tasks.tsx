import { useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { CalendarClock, Flag, ListTodo, Trash2 } from 'lucide-react';
import { useList, useResource } from '../lib/api';
import { listItem } from '../lib/motion';
import { dueLabel, today } from '../lib/format';
import type { Task } from '../lib/types';
import { TaskForm, priorityColor } from '../components/forms';
import { useToast } from '../components/toast';
import { Button, Card, Check, Empty, IconButton, Input, Page, PageHeader, Rise, Segmented, Sheet, SwipeRow, Textarea, cx } from '../components/ui';

type Filter = 'today' | 'upcoming' | 'someday' | 'done';

/**
 * Checking a task off keeps it in place briefly so the tick + burst can play before it leaves the list.
 * Returns the effective `done` for rendering and a toggle.
 */
export function useTaskToggle() {
  const { update } = useResource<Task>('tasks');
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const isDone = (t: Task) => pending[t.id] ?? !!t.done;
  const toggle = (t: Task) => {
    const next = !isDone(t);
    setPending((p) => ({ ...p, [t.id]: next }));
    clearTimeout(timers.current[t.id]);
    timers.current[t.id] = setTimeout(() => {
      update({ id: t.id, done: next ? 1 : 0, done_at: next ? new Date().toISOString() : null });
      setPending(({ [t.id]: _, ...rest }) => rest);
    }, 650);
  };
  return { isDone, toggle };
}

export function TaskRow({ task, done, onToggle, onOpen, onDelete }: { task: Task; done: boolean; onToggle: () => void; onOpen?: () => void; onDelete: () => void }) {
  const overdue = !done && task.due && task.due.slice(0, 10) < today();
  return (
    <motion.li layout {...listItem}>
      <SwipeRow onDelete={onDelete}>
        <div className="group flex items-center gap-3 rounded-2xl border border-transparent bg-surface px-4 py-3 transition-colors hover:border-line">
          <Check checked={done} onChange={onToggle} label={`Complete ${task.title}`} color={task.priority ? priorityColor(task.priority) : undefined} />
          <button onClick={onOpen} className="min-w-0 flex-1 text-left">
            <span className="relative inline-block max-w-full">
              <motion.span animate={{ opacity: done ? 0.45 : 1 }} className="block truncate text-[15px]">
                {task.title}
              </motion.span>
              <motion.span
                aria-hidden
                initial={false}
                animate={{ scaleX: done ? 1 : 0 }}
                transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                className="absolute left-0 right-0 top-1/2 h-[1.5px] origin-left bg-ink-2"
              />
            </span>
            {(task.due || task.notes) && (
              <span className="mt-0.5 flex items-center gap-2 text-xs text-ink-3">
                {task.due && (
                  <span className={cx('inline-flex items-center gap-1', overdue && 'font-medium text-danger')}>
                    <CalendarClock className="size-3" />
                    {overdue ? 'Overdue · ' : ''}
                    {dueLabel(task.due)}
                  </span>
                )}
                {task.notes && <span className="truncate">{task.notes}</span>}
              </span>
            )}
          </button>
          {task.priority > 0 && <Flag className="size-3.5 shrink-0" style={{ color: priorityColor(task.priority) }} fill={priorityColor(task.priority)} aria-label={`Priority ${task.priority}`} />}
          <IconButton label="Delete task" onClick={onDelete} className="opacity-0 transition-opacity group-hover:opacity-100 max-sm:hidden">
            <Trash2 className="size-4" />
          </IconButton>
        </div>
      </SwipeRow>
    </motion.li>
  );
}

function EditTask({ task, onClose }: { task: Task | null; onClose: () => void }) {
  const { update } = useResource<Task>('tasks');
  const [draft, setDraft] = useState<Task | null>(task);
  if (task && draft?.id !== task.id) setDraft(task);
  const day = draft?.due?.slice(0, 10) ?? '';
  const time = draft?.due?.includes('T') ? draft.due.slice(11, 16) : '';
  const setDue = (d: string, t: string) => draft && setDraft({ ...draft, due: d ? (t ? `${d}T${t}` : d) : null });

  return (
    <Sheet open={!!task} onClose={onClose} title="Edit task">
      {draft && (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            update({ id: draft.id, title: draft.title, notes: draft.notes, due: draft.due, priority: draft.priority });
            onClose();
          }}
        >
          <Input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} className="text-base" />
          <Textarea rows={3} placeholder="Notes" value={draft.notes ?? ''} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
          <div className="flex gap-2">
            <input type="date" aria-label="Due date" value={day} onChange={(e) => setDue(e.target.value, time)} className="field flex-1" />
            <input type="time" aria-label="Due time" value={time} disabled={!day} onChange={(e) => setDue(day, e.target.value)} className="field w-32" />
          </div>
          <Segmented
            className="w-full"
            value={String(draft.priority)}
            onChange={(p) => setDraft({ ...draft, priority: Number(p) })}
            options={['None', 'Low', 'Medium', 'High'].map((label, i) => ({ value: String(i), label }))}
          />
          <Button type="submit" className="w-full">
            Save
          </Button>
        </form>
      )}
    </Sheet>
  );
}

export function TasksPage() {
  const { data: tasks = [] } = useList<Task>('tasks');
  const { create, remove } = useResource<Task>('tasks');
  const { isDone, toggle } = useTaskToggle();
  const toast = useToast();
  const [filter, setFilter] = useState<Filter>('today');
  const [editing, setEditing] = useState<Task | null>(null);

  const groups = useMemo(() => {
    const t = today();
    return {
      today: tasks.filter((x) => !x.done && x.due && x.due.slice(0, 10) <= t),
      upcoming: tasks.filter((x) => !x.done && x.due && x.due.slice(0, 10) > t),
      someday: tasks.filter((x) => !x.done && !x.due),
      done: tasks.filter((x) => x.done).sort((a, b) => (b.done_at ?? '').localeCompare(a.done_at ?? '')),
    };
  }, [tasks]);

  const del = (t: Task) => {
    remove(t.id);
    const { id: _, created_at: __, updated_at: ___, ...rest } = t;
    toast({ message: 'Task deleted', action: { label: 'Undo', onClick: () => void create(rest) } });
  };

  const list = groups[filter];
  const open = tasks.filter((t) => !t.done).length;

  return (
    <Page>
      <PageHeader eyebrow={`${open} open`} title="Tasks" />
      <Card className="mb-6">
        <TaskForm />
      </Card>
      <Rise className="no-scrollbar -mx-4 mb-4 overflow-x-auto px-4">
        <Segmented
          value={filter}
          onChange={setFilter}
          options={(['today', 'upcoming', 'someday', 'done'] as const).map((f) => ({
            value: f,
            label: (
              <>
                {f[0].toUpperCase() + f.slice(1)}
                <span className="ml-1.5 opacity-60">{groups[f].length}</span>
              </>
            ),
          }))}
        />
      </Rise>
      <Rise>
        <AnimatePresence mode="wait" initial={false}>
          <motion.ul key={filter} className="space-y-2" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.18 }}>
            <AnimatePresence initial={false}>
              {list.map((t) => (
                <TaskRow key={t.id} task={t} done={isDone(t)} onToggle={() => toggle(t)} onOpen={() => setEditing(t)} onDelete={() => del(t)} />
              ))}
            </AnimatePresence>
            {list.length === 0 && (
              <Empty icon={<ListTodo className="size-6" />} title={filter === 'done' ? 'Nothing finished yet' : 'All clear'} hint={filter === 'today' ? 'Nothing due today. Enjoy it, or plan something above.' : undefined} />
            )}
          </motion.ul>
        </AnimatePresence>
      </Rise>
      <p className="mt-6 text-center text-xs text-ink-3 sm:hidden">Swipe a task left to delete it</p>
      <EditTask task={editing} onClose={() => setEditing(null)} />
    </Page>
  );
}
