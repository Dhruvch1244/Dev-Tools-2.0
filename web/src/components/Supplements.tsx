import { useState } from 'react';
import { motion } from 'motion/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Pill, Plus, Trash2 } from 'lucide-react';
import { api, useSettings, wasQueued } from '../lib/api';
import { haptic, today } from '../lib/format';
import { Button, Input, Sheet, cx } from './ui';

type Supp = { id: string; name: string; at: string; dose?: string };
/** Common picks for a vegetarian diet — check doses with a doctor; iron only if prescribed. */
const SUGGEST: Omit<Supp, 'id'>[] = [
  { name: 'Vitamin B12', at: '09:00', dose: '500 µg' },
  { name: 'Vitamin D3', at: '13:30', dose: 'with lunch' },
  { name: 'Omega-3 (algal)', at: '13:30' },
  { name: 'Creatine', at: '09:00', dose: '5 g' },
  { name: 'Multivitamin', at: '09:00' },
];

export function useChecks(kind: string, date: string) {
  const qc = useQueryClient();
  const { data = [] } = useQuery({ queryKey: ['checks', kind, date], queryFn: () => api<{ ref: string; date: string }[]>(`/checks?kind=${kind}&from=${date}`) });
  const toggle = useMutation({
    mutationFn: (ref: string) => api('/checks/toggle', { method: 'POST', body: JSON.stringify({ kind, ref, date }) }),
    onMutate: (ref) => qc.setQueryData<{ ref: string; date: string }[]>(['checks', kind, date], (old = []) => (old.some((c) => c.ref === ref && c.date === date) ? old.filter((c) => !(c.ref === ref && c.date === date)) : [...old, { ref, date }])),
    onSettled: (d) => (wasQueued(d) ? undefined : qc.invalidateQueries({ queryKey: ['checks'] })),
  });
  return { done: (ref: string) => data.some((c) => c.ref === ref && c.date === date), toggle: (ref: string) => (haptic(12), toggle.mutate(ref)) };
}

/** Today's supplements as tap-to-take chips, with a push at each one's time. */
export function SupplementsCard() {
  const { settings, save } = useSettings();
  const list = [...(settings.supplements ?? [])].sort((a, b) => a.at.localeCompare(b.at));
  const { done, toggle } = useChecks('supp', today());
  const [edit, setEdit] = useState(false);
  const taken = list.filter((s) => done(s.id)).length;
  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <div className="mb-2 flex items-center justify-between">
        <p className="flex items-center gap-2 text-micro font-black uppercase tracking-[0.25em] text-ink-3">
          <Pill className="size-3.5 text-accent" /> Supplements {list.length > 0 && `· ${taken}/${list.length}`}
        </p>
        <button onClick={() => setEdit(true)} className="text-mini font-bold uppercase text-accent">
          {list.length ? 'Edit' : 'Set up'}
        </button>
      </div>
      {list.length === 0 ? (
        <p className="text-sm text-ink-3">Add B12, D3 or anything you take daily — you'll get a push at its time with a ✓ Taken button.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {list.map((s) => {
            const on = done(s.id);
            return (
              <motion.button key={s.id} whileTap={{ scale: 0.92 }} onClick={() => toggle(s.id)} aria-pressed={on} className={cx('flex h-10 items-center gap-2 rounded-md border px-3 text-sm font-semibold', on ? 'border-green bg-green/15 text-green' : 'border-line bg-bg text-ink-2')}>
                {on ? <Check className="size-4" /> : <span className="font-mono text-tiny text-ink-3">{s.at}</span>}
                {s.name}
              </motion.button>
            );
          })}
        </div>
      )}
      <SuppSheet open={edit} onClose={() => setEdit(false)} list={settings.supplements ?? []} onSave={(supplements) => save({ supplements })} />
    </div>
  );
}

function SuppSheet({ open, onClose, list, onSave }: { open: boolean; onClose: () => void; list: Supp[]; onSave: (l: Supp[]) => void }) {
  const [name, setName] = useState('');
  const [at, setAt] = useState('09:00');
  const [dose, setDose] = useState('');
  const add = (s: Omit<Supp, 'id'>) => onSave([...list, { ...s, id: Math.random().toString(36).slice(2, 10) }]);
  return (
    <Sheet open={open} onClose={onClose} title="Supplements">
      <div className="space-y-4">
        <ul className="space-y-1.5">
          {list.map((s) => (
            <li key={s.id} className="flex items-center gap-2 rounded-md bg-bg p-2">
              <input type="time" value={s.at} onChange={(e) => onSave(list.map((x) => (x.id === s.id ? { ...x, at: e.target.value } : x)))} className="field h-9 w-28 !py-0 text-sm" aria-label={`${s.name} time`} />
              <span className="min-w-0 flex-1 truncate font-semibold">
                {s.name} {s.dose && <span className="text-tiny font-normal text-ink-3">· {s.dose}</span>}
              </span>
              <button onClick={() => onSave(list.filter((x) => x.id !== s.id))} aria-label={`Remove ${s.name}`} className="grid size-9 place-items-center text-ink-3">
                <Trash2 className="size-4" />
              </button>
            </li>
          ))}
        </ul>
        <form onSubmit={(e) => (e.preventDefault(), name.trim() && (add({ name: name.trim(), at, dose: dose.trim() || undefined }), setName(''), setDose('')))} className="grid grid-cols-[1fr_auto] gap-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name, e.g. Vitamin B12" />
          <input type="time" value={at} onChange={(e) => setAt(e.target.value)} className="field w-28" aria-label="Time" />
          <Input value={dose} onChange={(e) => setDose(e.target.value)} placeholder="Dose / note (optional)" />
          <Button type="submit" disabled={!name.trim()}>
            <Plus className="size-4" /> Add
          </Button>
        </form>
        <div>
          <p className="mb-2 text-micro font-black uppercase tracking-[0.2em] text-ink-3">Common for vegetarians</p>
          <div className="flex flex-wrap gap-1.5">
            {SUGGEST.filter((x) => !list.some((s) => s.name === x.name)).map((x) => (
              <button key={x.name} onClick={() => add(x)} className="rounded-md border border-line px-2.5 py-1.5 text-mini text-ink-2">
                + {x.name}
              </button>
            ))}
          </div>
          <p className="mt-2 text-tiny text-ink-3">Doses are only a starting note — confirm with your doctor (especially iron).</p>
        </div>
      </div>
    </Sheet>
  );
}
