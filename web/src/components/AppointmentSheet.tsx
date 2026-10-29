import { useState } from 'react';
import { Bell, MapPin, ReceiptIndianRupee, Star, Trash2 } from 'lucide-react';
import { useResource } from '../lib/api';
import { addDays, today } from '../lib/format';
import { REPEATS, type Repeat } from '../core/tasks';
import type { Task } from '../lib/types';
import { Button, Input, Sheet, Textarea, cx } from './ui';
import { useToast } from './toast';

const LEADS = [
  { min: 0, label: 'At time' },
  { min: 30, label: '30 min' },
  { min: 60, label: '1 h' },
  { min: 180, label: '3 h' },
  { min: 1440, label: '1 day' },
];
export type PlanDraft = Partial<Task> & { kind: 'plan' | 'bill' };
export const blankPlan = (): PlanDraft => ({ kind: 'plan', title: '', due: addDays(today(), 1), place: null, duration_min: 60, remind_before: 60, priority: 0, notes: null, amount: null, repeat: null });

/**
 * Add or edit an appointment, outing or bill by hand — no AI needed. Plans go to Google Calendar;
 * reminders come the evening before, the morning of, and `remind_before` ahead; Important adds a
 * heads-up three days out. They show in Coming up on Today and in Tasks.
 */
export function AppointmentSheet({ draft, onClose }: { draft: PlanDraft | null; onClose: () => void }) {
  const { create, update, remove } = useResource<Task>('tasks');
  const toast = useToast();
  const [d, setD] = useState<PlanDraft>(draft ?? blankPlan());
  const [was, setWas] = useState(draft);
  if (draft !== was) (setWas(draft), draft && setD(draft));
  const day = d.due?.slice(0, 10) ?? '';
  const time = d.due && d.due.length > 10 ? d.due.slice(11, 16) : '';
  const setDue = (dd: string, tt: string) => setD({ ...d, due: dd ? (tt ? `${dd}T${tt}` : dd) : null });
  const bill = d.kind === 'bill';
  const label = 'text-micro font-black uppercase tracking-[0.2em] text-ink-3';

  const save = async () => {
    const row = {
      kind: d.kind,
      title: d.title!.trim(),
      due: d.due,
      place: bill ? null : d.place?.trim() || null,
      duration_min: bill || !time ? null : d.duration_min ?? 60,
      remind_before: time ? d.remind_before ?? 0 : null,
      priority: d.priority ?? 0,
      notes: d.notes?.trim() || null,
      amount: bill ? Number(d.amount) || null : null,
      repeat: bill ? d.repeat ?? null : null,
    };
    if (d.id) update({ id: d.id, ...row });
    else await create({ ...row, done: 0 });
    toast({ message: d.id ? 'Updated' : bill ? 'Bill added — reminder set' : 'Plan added — on your calendar with reminders' });
    onClose();
  };

  return (
    <Sheet open={!!draft} onClose={onClose} title={d.id ? `Edit ${bill ? 'bill' : 'plan'}` : bill ? 'New bill' : 'New plan or appointment'}>
      <div className="space-y-4">
        {!d.id && (
          <div className="grid grid-cols-2 gap-1.5">
            {(['plan', 'bill'] as const).map((k) => (
              <button key={k} onClick={() => setD({ ...d, kind: k })} className={cx('flex h-10 items-center justify-center gap-1.5 rounded-md text-mini font-bold uppercase', d.kind === k ? 'bg-accent text-white' : 'bg-surface-2 text-ink-2')}>
                {k === 'plan' ? <MapPin className="size-4" /> : <ReceiptIndianRupee className="size-4" />} {k === 'plan' ? 'Plan / appointment' : 'Bill'}
              </button>
            ))}
          </div>
        )}
        <Input autoFocus={!d.id} value={d.title ?? ''} onChange={(e) => setD({ ...d, title: e.target.value })} placeholder={bill ? 'Electricity, rent, credit card…' : 'Dentist, dinner with Riya, flight to Jaipur…'} className="text-base" />
        <div className="flex gap-2">
          <input type="date" aria-label="Date" value={day} onChange={(e) => setDue(e.target.value, time)} className="field flex-1" />
          <input type="time" aria-label="Time" value={time} disabled={!day} onChange={(e) => setDue(day, e.target.value)} className="field w-32" />
        </div>
        {bill ? (
          <div className="grid grid-cols-2 gap-2">
            <Input inputMode="decimal" value={d.amount ?? ''} onChange={(e) => setD({ ...d, amount: (e.target.value.replace(/[^\d.]/g, '') || null) as unknown as number })} placeholder="₹ amount" />
            <select aria-label="Repeat" value={d.repeat ?? ''} onChange={(e) => setD({ ...d, repeat: (e.target.value || null) as Repeat | null })} className="field text-sm">
              <option value="">Once</option>
              {REPEATS.map((r) => (
                <option key={r.id} value={r.id}>
                  ↻ {r.label}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div className="grid grid-cols-[1fr_7rem] gap-2">
            <Input value={d.place ?? ''} onChange={(e) => setD({ ...d, place: e.target.value })} placeholder="Where (optional)" />
            <select aria-label="How long" value={d.duration_min ?? 60} disabled={!time} onChange={(e) => setD({ ...d, duration_min: Number(e.target.value) })} className="field text-sm disabled:opacity-40">
              {[30, 60, 90, 120, 180, 240].map((m) => (
                <option key={m} value={m}>
                  {m < 60 ? `${m} min` : `${m / 60} h`}
                </option>
              ))}
            </select>
          </div>
        )}
        <div>
          <p className={label}>
            <Bell className="mr-1 inline size-3" /> Remind me before {!time && <span className="normal-case tracking-normal">· add a time to choose</span>}
          </p>
          <div className="mt-1.5 grid grid-cols-5 gap-1">
            {LEADS.map((l) => (
              <button key={l.min} disabled={!time} onClick={() => setD({ ...d, remind_before: l.min })} className={cx('h-9 rounded-md text-tiny font-bold disabled:opacity-40', (d.remind_before ?? 0) === l.min && time ? 'bg-ink text-bg' : 'bg-surface-2 text-ink-2')}>
                {l.label}
              </button>
            ))}
          </div>
          {!bill && <p className="mt-1 text-tiny text-ink-3">Plus the evening before (20:00) and that morning (08:30).</p>}
        </div>
        <button onClick={() => setD({ ...d, priority: (d.priority ?? 0) >= 3 ? 0 : 3 })} className={cx('flex w-full items-center gap-3 rounded-md border px-3 py-2.5 text-left', (d.priority ?? 0) >= 3 ? 'border-yellow bg-yellow/10' : 'border-line')}>
          <Star className={cx('size-5', (d.priority ?? 0) >= 3 ? 'fill-yellow text-yellow' : 'text-ink-3')} />
          <span>
            <span className="block text-sm font-bold">Important</span>
            <span className="block text-tiny text-ink-3">Extra heads-up 3 days and 1 day before, starred on Today</span>
          </span>
        </button>
        <Textarea rows={2} value={d.notes ?? ''} onChange={(e) => setD({ ...d, notes: e.target.value })} placeholder="Notes — what to carry, booking ref, link…" />
        <div className="flex gap-2">
          {d.id && (
            <Button variant="danger" className="h-12" aria-label="Delete" onClick={() => (remove(d.id!), onClose())}>
              <Trash2 className="size-4" />
            </Button>
          )}
          <Button className="h-12 flex-1" disabled={!d.title?.trim() || !day} onClick={() => void save()}>
            Save
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
