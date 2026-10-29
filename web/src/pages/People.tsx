import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Cake, Check, Phone, Plus, Trash2, Users } from 'lucide-react';
import { useList, useResource } from '../lib/api';
import { haptic, relativeDay, today } from '../lib/format';
import { listItem } from '../lib/motion';
import { nextBirthday, nextContact, overdueDays, rhythmLabel } from '../core/people';
import type { PersonRow } from '../lib/types';
import { useToast } from '../components/toast';
import { Button, Card, Empty, Input, Page, PageHeader, Rise, Sheet, Textarea, cx } from '../components/ui';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const RHYTHMS = [
  { label: 'None', every: 0 },
  { label: 'Weekly', every: 7 },
  { label: '2 weeks', every: 14 },
  { label: 'Monthly', every: 30 },
];
const BLANK: Partial<PersonRow> = { name: '', emoji: null, phone: null, birthday: null, every_days: 7, weekday: 0, call_at: '19:00', last_contact: null, notes: null };

/** Pit crew: the people you keep in touch with, who's due a call and whose birthday is coming. */
export function PeoplePage() {
  const { data: people = [] } = useList<PersonRow>('people');
  const { update, remove, create } = useResource<PersonRow>('people');
  const toast = useToast();
  const [editing, setEditing] = useState<Partial<PersonRow> | null>(null);
  const t = today();
  const sorted = [...people].sort((a, b) => (nextContact(a, t) ?? '9999').localeCompare(nextContact(b, t) ?? '9999'));
  const dueNow = sorted.filter((p) => nextContact(p, t) === t);
  const bdays = people.map((p) => ({ p, b: nextBirthday(p, t) })).filter((x) => x.b && x.b.inDays <= 30).sort((a, b) => a.b!.inDays - b.b!.inDays);

  const talked = (p: PersonRow) => {
    haptic(14);
    const prev = p.last_contact;
    update({ id: p.id, last_contact: t });
    toast({ message: `Logged a chat with ${p.name}`, action: { label: 'Undo', onClick: () => update({ id: p.id, last_contact: prev }) } });
  };

  return (
    <Page>
      <PageHeader
        eyebrow={dueNow.length ? `${dueNow.length} to call today` : 'Keep in touch'}
        title="Pit crew"
        action={
          <Button onClick={() => setEditing({ ...BLANK })}>
            <Plus className="size-4" /> Person
          </Button>
        }
      />

      {bdays.length > 0 && (
        <Rise className="mb-4 flex gap-2 overflow-x-auto no-scrollbar">
          {bdays.map(({ p, b }) => (
            <div key={p.id} className={cx('shrink-0 rounded-xl border px-4 py-3', b!.inDays === 0 ? 'border-yellow bg-yellow/10' : 'border-line bg-surface')}>
              <p className="flex items-center gap-1.5 text-micro font-black uppercase tracking-[0.2em] text-ink-3">
                <Cake className="size-3.5 text-yellow" /> {b!.inDays === 0 ? 'Today!' : relativeDay(b!.date)}
              </p>
              <p className="font-bold">
                {p.emoji} {p.name} {b!.age ? <span className="text-ink-3">· {b!.age}</span> : null}
              </p>
            </div>
          ))}
        </Rise>
      )}

      <Card>
        {people.length === 0 ? (
          <Empty icon={<Users className="size-6" />} title="Nobody yet" hint="Add Mom, Dad, friends — set a rhythm like every Sunday and add birthdays. You'll get a push with Call and ✓ Talked buttons." />
        ) : (
          <ul className="space-y-2">
            <AnimatePresence initial={false}>
              {sorted.map((p) => {
                const next = nextContact(p, t);
                const od = overdueDays(p, t);
                const due = next === t;
                return (
                  <motion.li key={p.id} layout {...listItem} className={cx('flex items-center gap-3 rounded-lg border bg-bg p-3', due ? 'border-accent/60' : 'border-line')}>
                    <button onClick={() => setEditing(p)} className="grid size-11 shrink-0 place-items-center rounded-full bg-surface-2 text-xl">
                      {p.emoji || p.name.slice(0, 1).toUpperCase()}
                    </button>
                    <button onClick={() => setEditing(p)} className="min-w-0 flex-1 text-left">
                      <p className="truncate font-bold">{p.name}</p>
                      <p className="line-clamp-2 text-tiny text-ink-3">
                        {rhythmLabel(p)}
                        {next && ` · ${due ? (od > 0 ? `${od} d overdue` : 'due today') : `next ${relativeDay(next)}`}`}
                        {p.last_contact && ` · last ${relativeDay(p.last_contact)}`}
                      </p>
                    </button>
                    {p.phone && (
                      <a href={`tel:${p.phone}`} aria-label={`Call ${p.name}`} className="grid size-10 shrink-0 place-items-center rounded-md bg-surface-2 text-green">
                        <Phone className="size-4" />
                      </a>
                    )}
                    <button onClick={() => talked(p)} aria-label={`Talked to ${p.name}`} className={cx('flex h-10 shrink-0 items-center gap-1 rounded-md px-3 text-mini font-bold uppercase', due ? 'bg-accent text-white' : 'bg-surface-2 text-ink-2')}>
                      <Check className="size-4" /> Talked
                    </button>
                  </motion.li>
                );
              })}
            </AnimatePresence>
          </ul>
        )}
      </Card>

      <PersonSheet
        person={editing}
        onClose={() => setEditing(null)}
        onSave={(p) => (p.id ? update(p as PersonRow) : void create(p), setEditing(null))}
        onDelete={(id) => (remove(id), setEditing(null))}
      />
    </Page>
  );
}

function PersonSheet({ person, onClose, onSave, onDelete }: { person: Partial<PersonRow> | null; onClose: () => void; onSave: (p: Partial<PersonRow>) => void; onDelete: (id: string) => void }) {
  const [d, setD] = useState<Partial<PersonRow>>(person ?? BLANK);
  const [was, setWas] = useState(person);
  if (person !== was) (setWas(person), person && setD(person));
  const label = 'text-micro font-black uppercase tracking-[0.2em] text-ink-3';
  const weekly = (d.every_days ?? 0) > 0 && (d.every_days ?? 0) % 7 === 0;
  return (
    <Sheet open={!!person} onClose={onClose} title={d.id ? d.name : 'Add a person'}>
      <form className="space-y-4" onSubmit={(e) => (e.preventDefault(), d.name?.trim() && onSave({ ...d, name: d.name.trim() }))}>
        <div className="grid grid-cols-[4rem_1fr] gap-2">
          <Input value={d.emoji ?? ''} onChange={(e) => setD({ ...d, emoji: e.target.value || null })} placeholder="👩" className="text-center text-xl" aria-label="Emoji" />
          <Input value={d.name ?? ''} onChange={(e) => setD({ ...d, name: e.target.value })} placeholder="Name — Mom, Rahul…" autoFocus={!d.id} />
        </div>
        <Input type="tel" inputMode="tel" value={d.phone ?? ''} onChange={(e) => setD({ ...d, phone: e.target.value || null })} placeholder="Phone (for the Call button)" />
        <label className="block">
          <span className={label}>Birthday</span>
          <input type="date" value={d.birthday?.length === 10 ? d.birthday : ''} onChange={(e) => setD({ ...d, birthday: e.target.value || null })} className="field mt-2" />
          <span className="mt-1 block text-tiny text-ink-3">Year unknown? Pick any year — only the day and month matter.</span>
        </label>
        <div>
          <p className={label}>Talk every</p>
          <div className="mt-2 grid grid-cols-4 gap-1.5">
            {RHYTHMS.map((r) => (
              <button type="button" key={r.label} onClick={() => setD({ ...d, every_days: r.every })} className={cx('h-10 rounded-md text-mini font-bold uppercase', (d.every_days ?? 0) === r.every ? 'bg-accent text-white' : 'bg-surface-2 text-ink-2')}>
                {r.label}
              </button>
            ))}
          </div>
          {weekly && (
            <div className="mt-2 grid grid-cols-8 gap-1">
              <button type="button" onClick={() => setD({ ...d, weekday: null })} className={cx('h-9 rounded-md text-tiny font-bold', d.weekday == null ? 'bg-ink text-bg' : 'bg-surface-2 text-ink-3')}>
                Any
              </button>
              {DAYS.map((x, i) => (
                <button type="button" key={x} onClick={() => setD({ ...d, weekday: i })} className={cx('h-9 rounded-md text-tiny font-bold', d.weekday === i ? 'bg-ink text-bg' : 'bg-surface-2 text-ink-3')}>
                  {x}
                </button>
              ))}
            </div>
          )}
          {(d.every_days ?? 0) > 0 && (
            <label className="mt-2 flex items-center gap-2 text-sm text-ink-2">
              Remind at <input type="time" value={d.call_at ?? '19:00'} onChange={(e) => setD({ ...d, call_at: e.target.value })} className="field h-9 w-28 !py-0" />
            </label>
          )}
        </div>
        <Textarea rows={2} value={d.notes ?? ''} onChange={(e) => setD({ ...d, notes: e.target.value || null })} placeholder="Notes — ask about her knee, his new job…" />
        <div className="flex gap-2">
          {d.id && (
            <Button type="button" variant="danger" onClick={() => onDelete(d.id!)}>
              <Trash2 className="size-4" />
            </Button>
          )}
          <Button type="submit" className="flex-1" disabled={!d.name?.trim()}>
            Save
          </Button>
        </div>
      </form>
    </Sheet>
  );
}
