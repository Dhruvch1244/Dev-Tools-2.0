import { useState } from 'react';
import { motion } from 'motion/react';
import { Bell, Briefcase, CalendarClock, Check, Plus, Repeat, Users, X } from 'lucide-react';
import { useResource, useSettings } from '../lib/api';
import { describeDue, type AiAction } from '../core/aiActions';
import { workConfig } from '../core/work';
import type { PersonRow, Routine, Task } from '../lib/types';
import { haptic } from '../lib/format';
import { Button, cx } from './ui';
import { useToast } from './toast';

const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MODE = { office: '🏢 Office', wfh: '🏠 WFH', leave: '🌴 Leave', off: '😴 Off' } as const;

/** Writes one proposed action. Nothing the AI suggests is saved until this runs on a tap. */
export function useApplyAction() {
  const tasks = useResource<Task>('tasks');
  const routines = useResource<Routine>('routines');
  const people = useResource<PersonRow>('people');
  const { settings, save } = useSettings();
  return async (a: AiAction) => {
    if (a.type === 'task') await tasks.create({ title: a.title, due: a.due, repeat: a.repeat, remind_before: a.remind_before || null, priority: a.priority, notes: a.notes, done: 0 });
    else if (a.type === 'person') await people.create({ name: a.name, birthday: a.birthday, every_days: a.every_days, weekday: a.weekday, call_at: '19:00' });
    else if (a.type === 'routine') await routines.create({ name: a.name, emoji: a.emoji, days: JSON.stringify(a.days), time: a.time, duration_min: a.duration_min, remind: 1, active: 1 });
    else save({ workOverrides: { ...settings.workOverrides, [a.date]: { ...(a.mode && { mode: a.mode }), ...(a.shift && { shift: a.shift }) } } });
  };
}

function summary(a: AiAction, shiftLabel: (id: string) => string) {
  if (a.type === 'task') return { icon: a.repeat ? Repeat : a.due?.includes('T') ? Bell : CalendarClock, title: a.title, sub: describeDue(a) + (a.notes ? ` · ${a.notes}` : '') };
  if (a.type === 'person')
    return { icon: Users, title: a.name, sub: ['Pit crew', a.every_days ? (a.weekday != null && a.every_days % 7 === 0 ? `every ${DAY[a.weekday]}` : `every ${a.every_days} days`) : null, a.birthday ? `🎂 ${new Date(`${a.birthday}T12:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}` : null].filter(Boolean).join(' · ') };
  if (a.type === 'routine') return { icon: CalendarClock, title: `${a.emoji ?? ''} ${a.name}`.trim(), sub: `Routine · ${a.days.map((d) => DAY[d]).join(' ')} · ${a.time} · ${a.duration_min} min` };
  const d = new Date(`${a.date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  return { icon: Briefcase, title: `${d} → ${a.mode ? MODE[a.mode] : ''}${a.shift ? ` ${shiftLabel(a.shift)} shift` : ''}`.trim(), sub: 'Office schedule override' };
}

/** Confirm cards for what the AI proposed: Add one, Add all, or dismiss. */
export function ActionCards({ actions, onDone }: { actions: AiAction[]; onDone?: () => void }) {
  const apply = useApplyAction();
  const toast = useToast();
  const { settings } = useSettings();
  const shifts = workConfig(settings.work).shifts;
  const [state, setState] = useState<Record<number, 'added' | 'skipped'>>({});
  const pending = actions.map((_, i) => i).filter((i) => !state[i]);

  const add = async (idxs: number[]) => {
    for (const i of idxs) await apply(actions[i]);
    setState((s) => ({ ...s, ...Object.fromEntries(idxs.map((i) => [i, 'added'])) }));
    haptic(12);
    toast({ message: idxs.length === 1 ? 'Added' : `Added ${idxs.length}` });
    if (pending.length === idxs.length) onDone?.();
  };

  if (!actions.length) return null;
  return (
    <div className="mt-2 space-y-1.5">
      {actions.map((a, i) => {
        const s = summary(a, (id) => shifts.find((x) => x.id === id)?.label ?? id);
        const st = state[i];
        return (
          <motion.div key={i} initial={{ opacity: 0, x: -8 }} animate={{ opacity: st === 'skipped' ? 0.4 : 1, x: 0 }} transition={{ delay: i * 0.05 }} className={cx('flex items-center gap-2.5 rounded-lg border bg-bg p-2.5', st === 'added' ? 'border-green/50' : 'border-line')}>
            <span className={cx('grid size-9 shrink-0 place-items-center rounded-md', st === 'added' ? 'bg-green/15 text-green' : 'bg-accent-soft text-accent')}>{st === 'added' ? <Check className="size-4" /> : <s.icon className="size-4" />}</span>
            <div className="min-w-0 flex-1">
              <p className={cx('break-words font-semibold leading-snug', st === 'skipped' && 'line-through')}>{s.title}</p>
              <p className="break-words text-tiny text-ink-3">{s.sub}</p>
            </div>
            {!st && (
              <>
                <button className="grid size-9 shrink-0 place-items-center text-ink-3" aria-label="Dismiss" onClick={() => setState((x) => ({ ...x, [i]: 'skipped' }))}>
                  <X className="size-4" />
                </button>
                <Button size="sm" className="!px-3" onClick={() => void add([i])}>
                  <Plus className="size-4" /> Add
                </Button>
              </>
            )}
          </motion.div>
        );
      })}
      {pending.length > 1 && (
        <Button size="sm" variant="soft" className="w-full" onClick={() => void add(pending)}>
          <Check className="size-4" /> Add all {pending.length}
        </Button>
      )}
    </div>
  );
}
