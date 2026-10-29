import { useRef, useState } from 'react';
import { BookUser, Check, FileUp, Plus, Search, Smartphone } from 'lucide-react';
import { api, useList, useResource } from '../lib/api';
import { parseVcf, type Contact } from '../core/vcard';
import type { ContactRow, PersonRow } from '../lib/types';
import { Button, Sheet, cx } from './ui';
import { useToast } from './toast';
import { useQueryClient } from '@tanstack/react-query';

type Picker = { select: (props: string[], opts: { multiple: boolean }) => Promise<{ name?: string[]; tel?: string[] }[]> };
const picker = () => (navigator as unknown as { contacts?: Picker }).contacts;

/** Bring your address book in: the native contact picker where the browser has one, else a .vcf export. */
export function ImportContactsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const file = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const send = async (contacts: Contact[]) => {
    if (!contacts.length) return toast({ message: 'No contacts found in that file' });
    setBusy(true);
    try {
      const r = await api<{ added: number; updated: number; total: number }>('/contacts/import', { method: 'POST', body: JSON.stringify({ contacts }) });
      void qc.invalidateQueries({ queryKey: ['contacts'] });
      toast({ message: `${r.added} new, ${r.updated} updated · ${r.total} contacts` });
      onClose();
    } catch (e) {
      toast({ message: `Import failed: ${(e as Error).message}` });
    } finally {
      setBusy(false);
    }
  };
  const fromPhone = async () => {
    try {
      const got = await picker()!.select(['name', 'tel'], { multiple: true });
      await send(got.map((c) => ({ name: c.name?.[0] ?? '', phone: c.tel?.[0] ?? null, birthday: null })).filter((c) => c.name));
    } catch (e) {
      if ((e as Error).name !== 'AbortError') toast({ message: `Picker failed: ${(e as Error).message}` });
    }
  };
  return (
    <Sheet open={open} onClose={onClose} title="Import contacts">
      <div className="space-y-3">
        <input ref={file} type="file" accept=".vcf,text/vcard,text/x-vcard" hidden onChange={async (e) => (e.target.files?.[0] && (await send(parseVcf(await e.target.files[0].text()))), (e.target.value = ''))} />
        {picker() && (
          <Button className="w-full" disabled={busy} onClick={() => void fromPhone()}>
            <Smartphone className="size-4" /> Pick from phone contacts
          </Button>
        )}
        <Button variant={picker() ? 'soft' : 'primary'} className="w-full" disabled={busy} onClick={() => file.current?.click()}>
          <FileUp className="size-4" /> {busy ? 'Importing…' : 'Import a .vcf file'}
        </Button>
        <div className="rounded-lg bg-bg p-3 text-sm text-ink-2">
          <p className="mb-1 font-bold text-ink">On iPhone (iOS 17+)</p>
          <ol className="list-decimal space-y-0.5 pl-5">
            <li>
              Open <b>Contacts</b> → tap <b>Lists</b> (top-left)
            </li>
            <li>
              Long-press <b>All iPhone</b> (or All iCloud) → <b>Export</b>
            </li>
            <li>
              <b>Save to Files</b>, then tap “Import a .vcf file” above and pick it
            </li>
          </ol>
          <p className="mt-2 text-tiny text-ink-3">Or on the laptop: iCloud.com → Contacts → select all → Export vCard. Names, numbers and birthdays are kept on your laptop only. Re-importing just updates.</p>
        </div>
      </div>
    </Sheet>
  );
}

/**
 * Search your Pit crew and address book in one box; picking an address-book contact makes them a
 * person (with their phone and birthday) so bills and reminders can use them.
 */
export function PersonPicker({ selected, onToggle, extra }: { selected: string[]; onToggle: (id: string) => void; extra?: { id: string; name: string; emoji?: string | null }[] }) {
  const { data: people = [] } = useList<PersonRow>('people');
  const { data: contacts = [] } = useList<ContactRow>('contacts');
  const { create } = useResource<PersonRow>('people');
  const [q, setQ] = useState('');
  const [imp, setImp] = useState(false);
  const term = q.trim().toLowerCase();
  const known = new Set(people.map((p) => p.phone ?? `n:${p.name.toLowerCase()}`));
  const matches = term ? contacts.filter((c) => c.name.toLowerCase().includes(term) && !known.has(c.phone ?? `n:${c.name.toLowerCase()}`)).slice(0, 8) : [];
  const shownPeople = [...(extra ?? []), ...people.filter((p) => !term || p.name.toLowerCase().includes(term))];

  const addContact = async (c: { name: string; phone?: string | null; birthday?: string | null }) => {
    const p = await create({ name: c.name, phone: c.phone ?? null, birthday: c.birthday ?? null, every_days: 0 });
    onToggle(p.id);
    setQ('');
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2 rounded-md border border-line bg-bg px-3">
          <Search className="size-4 shrink-0 text-ink-3" />
          <input value={q} onChange={(e) => setQ(e.target.value)} type="search" placeholder={contacts.length ? `Search ${contacts.length} contacts` : 'Search or type a name'} autoCorrect="off" className="h-10 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-ink-3" />
        </div>
        <button type="button" onClick={() => setImp(true)} aria-label="Import contacts" className="grid size-10 shrink-0 place-items-center rounded-md bg-surface-2 text-ink-2">
          <BookUser className="size-4" />
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {shownPeople.map((p) => {
          const on = selected.includes(p.id);
          return (
            <button type="button" key={p.id} onClick={() => onToggle(p.id)} className={cx('flex h-10 items-center gap-1.5 rounded-md px-3 text-sm font-semibold', on ? 'bg-accent text-white' : 'bg-surface-2 text-ink-2')}>
              {on && <Check className="size-3.5" />}
              {p.emoji ?? ''} {p.name}
            </button>
          );
        })}
      </div>
      {term && (
        <ul className="overflow-hidden rounded-md border border-line">
          {matches.map((c) => (
            <li key={c.id}>
              <button type="button" onClick={() => void addContact(c)} className="flex w-full items-center gap-3 border-b border-line bg-bg px-3 py-2.5 text-left last:border-0">
                <BookUser className="size-4 shrink-0 text-ink-3" />
                <span className="min-w-0 flex-1 truncate">{c.name}</span>
                {c.phone && <span className="font-mono text-tiny text-ink-3">{c.phone.slice(-4).padStart(c.phone.length > 4 ? 8 : 4, '•')}</span>}
                <Plus className="size-4 text-accent" />
              </button>
            </li>
          ))}
          {!shownPeople.some((p) => p.name.toLowerCase() === term) && (
            <li>
              <button type="button" onClick={() => void addContact({ name: q.trim() })} className="flex w-full items-center gap-3 bg-bg px-3 py-2.5 text-left text-accent">
                <Plus className="size-4" /> Add “{q.trim()}”
              </button>
            </li>
          )}
        </ul>
      )}
      <ImportContactsSheet open={imp} onClose={() => setImp(false)} />
    </div>
  );
}
