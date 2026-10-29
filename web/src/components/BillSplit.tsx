import { useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Camera, Check, ImagePlus, Plus, ReceiptText, Share2, Sparkles, Users, X } from 'lucide-react';
import { api, useList, useResource, useSettings } from '../lib/api';
import { haptic, today } from '../lib/format';
import { emojiFor } from '../lib/categories';
import { ME, RECEIPT_CATEGORIES, balances, balancesSummary, settleMessage, splitShares, type Receipt } from '../core/money';
import type { Expense, PersonRow, SplitRow } from '../lib/types';
import { shrink } from './AiSnap';
import { PersonPicker } from './Contacts';
import { Button, Input, Sheet, cx } from './ui';
import { useToast } from './toast';

// Math.abs also turns -0 into 0, so an empty "you owe" reads ₹0, not ₹-0.
const inr = (n: number) => `${n < -0.5 ? '−' : ''}₹${Math.abs(Math.round(n)).toLocaleString('en-IN')}`;

/** Photo of a bill → AI reads it → pick who was in → log my share, track what others owe. */
export function BillSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data: people = [] } = useList<PersonRow>('people');
  const { create } = useResource<Expense>('expenses');
  const splitsApi = useResource<SplitRow>('splits');
  const toast = useToast();
  const camera = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [r, setR] = useState<Receipt | null>(null);
  const [who, setWho] = useState<string[]>([ME]);
  const [mode, setMode] = useState<'equal' | 'items'>('equal');
  const [assign, setAssign] = useState<Record<number, string[]>>({});
  const [payer, setPayer] = useState<string>(ME);

  const reset = () => (setPhoto(null), setR(null), setErr(''), setWho([ME]), setMode('equal'), setAssign({}), setPayer(ME));
  const manual = () => setR({ merchant: '', date: today(), items: [], extras: 0, total: 0, category: 'Food', note: '' });
  const read = async (f?: File) => {
    if (!f) return;
    setErr('');
    setBusy(true);
    try {
      const img = await shrink(f, 1600);
      setPhoto(img);
      const res = await api<Receipt>('/money/receipt', { method: 'POST', body: JSON.stringify({ image: img }) });
      if (!res.total) setErr(res.note || "Couldn't read a total — type it in below.");
      setR({ ...res, date: res.date ?? today() });
      haptic(12);
    } catch (e) {
      setErr((e as Error).message.includes('fetch') ? 'Needs the laptop — AI runs there.' : (e as Error).message);
      manual();
    } finally {
      setBusy(false);
    }
  };

  const nameOf = (id: string) => (id === ME ? 'Me' : (people.find((p) => p.id === id)?.name ?? '?'));
  const shares = r ? splitShares(r, who, mode, assign) : {};
  const toggleWho = (id: string) => setWho((w) => (w.includes(id) ? w.filter((x) => x !== id) : [...w, id]));

  const save = async () => {
    if (!r || r.total <= 0) return;
    const note = r.merchant || r.category;
    const mine = shares[ME] ?? 0;
    // My share is what I actually spent; the rest becomes "owes me" (or "I owe" when someone else paid).
    const exp = mine > 0 ? await create({ amount: mine, kind: 'expense', category: r.category, note: who.length > 1 ? `${note} (my share of ${inr(r.total)})` : note, date: r.date ?? today() }) : null;
    for (const [pid, amt] of Object.entries(shares)) {
      if (pid === ME || !amt) continue;
      // What they had (by-item split), else everything on the bill — it flavours the "pay me" message.
      const mine_ = r.items.filter((_, i) => (assign[i] ?? []).includes(pid)).map((i) => i.name);
      const items = JSON.stringify((mode === 'items' && mine_.length ? mine_ : r.items.map((i) => i.name)).slice(0, 12));
      if (payer === ME) await splitsApi.create({ expense_id: exp?.id ?? null, person_id: pid, amount: amt, note, date: r.date ?? today(), settled_at: null, items });
      else if (pid === payer) await splitsApi.create({ expense_id: exp?.id ?? null, person_id: pid, amount: -mine, note, date: r.date ?? today(), settled_at: null });
    }
    toast({ message: who.length > 1 ? (payer === ME ? `Logged ${inr(mine)} · others owe you ${inr(r.total - mine)}` : `Logged ${inr(mine)} · you owe ${nameOf(payer)}`) : `Logged ${inr(r.total)}` });
    reset();
    onClose();
  };

  return (
    <Sheet open={open} onClose={onClose} title="Bill & split">
      <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={(e) => (void read(e.target.files?.[0]), (e.target.value = ''))} />
      <input ref={gallery} type="file" accept="image/*" hidden onChange={(e) => (void read(e.target.files?.[0]), (e.target.value = ''))} />
      {!r ? (
        <div className="space-y-3">
          {busy ? (
            <div className="relative overflow-hidden rounded-xl border border-line">
              {photo && <img src={photo} alt="Bill" className="max-h-72 w-full object-cover opacity-70" />}
              <motion.div className="absolute inset-x-0 h-1 bg-accent shadow-[0_0_24px_4px_var(--accent)]" animate={{ top: ['0%', '100%', '0%'] }} transition={{ duration: 2.2, repeat: Infinity }} />
              <p className="absolute inset-x-0 bottom-3 text-center text-sm font-bold">Reading the bill…</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <motion.button whileTap={{ scale: 0.96 }} onClick={() => camera.current?.click()} className="flex h-28 flex-col items-center justify-center gap-2 rounded-xl bg-accent font-black uppercase italic text-white">
                <Camera className="size-8" /> Snap bill
              </motion.button>
              <motion.button whileTap={{ scale: 0.96 }} onClick={() => gallery.current?.click()} className="flex h-28 flex-col items-center justify-center gap-2 rounded-xl border border-line bg-bg font-black uppercase italic text-ink-2">
                <ImagePlus className="size-8" /> Screenshot
              </motion.button>
            </div>
          )}
          <Button variant="ghost" className="w-full" onClick={manual} disabled={busy}>
            Enter the amount myself
          </Button>
          <p className="text-center text-tiny text-ink-3">Restaurant bills, Swiggy/Zomato or cab screenshots, grocery receipts — AI reads items, taxes and the total.</p>
          {err && <p className="text-sm text-warn">{err}</p>}
        </div>
      ) : (
        <div className="space-y-4">
          {err && <p className="rounded-md border border-yellow/40 bg-yellow/10 px-3 py-2 text-sm">{err}</p>}
          <div className="grid grid-cols-[1fr_8rem] gap-2">
            <Input value={r.merchant} onChange={(e) => setR({ ...r, merchant: e.target.value })} placeholder="Where — Toit, Swiggy, Uber…" />
            <Input type="number" inputMode="decimal" value={r.total || ''} onChange={(e) => setR({ ...r, total: Number(e.target.value) || 0 })} placeholder="Total ₹" className="text-right font-mono" />
          </div>
          <input type="date" value={r.date ?? today()} onChange={(e) => setR({ ...r, date: e.target.value })} className="field" aria-label="Date" />
          <div className="-mx-1 px-1">
            <div className="no-scrollbar flex gap-1.5 overflow-x-auto">
              {RECEIPT_CATEGORIES.map((c) => (
                <button key={c} onClick={() => setR({ ...r, category: c })} className={cx('h-10 shrink-0 rounded-md px-2.5 text-mini font-bold', r.category === c ? 'bg-accent text-white' : 'bg-surface-2 text-ink-2')}>
                  {emojiFor(c)} {c}
                </button>
              ))}
            </div>
          </div>
          {r.items.length > 0 && (
            <details className="rounded-lg border border-line bg-bg p-3" open={mode === 'items'}>
              <summary className="cursor-pointer text-mini font-black uppercase tracking-[0.2em] text-ink-3">
                {r.items.length} items · extras {inr(r.extras)} {r.note && <span className="font-normal normal-case tracking-normal">· {r.note}</span>}
              </summary>
              <ul className="mt-2 space-y-1.5">
                {r.items.map((it, i) => (
                  <li key={i} className="text-sm">
                    <div className="flex justify-between gap-2">
                      <span className="min-w-0 truncate">{it.name}</span>
                      <span className="font-mono text-ink-2">{inr(it.amount)}</span>
                    </div>
                    {mode === 'items' && who.length > 1 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {who.map((p) => {
                          const on = (assign[i] ?? []).includes(p);
                          return (
                            <button key={p} onClick={() => setAssign((a) => ({ ...a, [i]: on ? (a[i] ?? []).filter((x) => x !== p) : [...(a[i] ?? []), p] }))} className={cx('h-7 rounded px-2 text-tiny font-bold', on ? 'bg-sky text-black' : 'bg-surface-2 text-ink-3')}>
                              {nameOf(p)}
                            </button>
                          );
                        })}
                        {!(assign[i] ?? []).length && <span className="self-center text-tiny text-ink-3">shared by all</span>}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </details>
          )}

          <div>
            <p className="mb-2 flex items-center gap-1.5 text-micro font-black uppercase tracking-[0.2em] text-ink-3">
              <Users className="size-3.5" /> Who was in?
            </p>
            <PersonPicker selected={who} onToggle={(id) => id !== ME && toggleWho(id)} extra={[{ id: ME, name: 'Me', emoji: '🙋' }]} />
          </div>

          {who.length > 1 && (
            <>
              <div className="grid grid-cols-2 gap-2">
                {(['equal', 'items'] as const).map((m) => (
                  <button key={m} disabled={m === 'items' && !r.items.length} onClick={() => setMode(m)} className={cx('h-10 rounded-md text-mini font-bold uppercase disabled:opacity-30', mode === m ? 'bg-ink text-bg' : 'bg-surface-2 text-ink-2')}>
                    {m === 'equal' ? 'Split equally' : 'By items'}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-1.5 text-sm">
                <span className="text-tiny font-bold uppercase text-ink-3">Paid by</span>
                {who.map((p) => (
                  <button key={p} onClick={() => setPayer(p)} className={cx('h-9 rounded-md px-3 text-mini font-bold', payer === p ? 'bg-green text-black' : 'bg-surface-2 text-ink-2')}>
                    {nameOf(p)}
                  </button>
                ))}
              </div>
              <ul className="space-y-1 rounded-lg border border-line bg-bg p-3">
                {who.map((p) => (
                  <li key={p} className="flex justify-between text-sm">
                    <span>{nameOf(p)}</span>
                    <span className="font-mono font-bold">{inr(shares[p] ?? 0)}</span>
                  </li>
                ))}
              </ul>
            </>
          )}

          <div className="flex gap-2">
            <Button variant="ghost" onClick={reset}>
              <X className="size-4" />
            </Button>
            <Button className="flex-1" disabled={r.total <= 0} onClick={() => void save()}>
              <Check className="size-4" /> {who.length > 1 ? `Log my ${inr(shares[ME] ?? 0)} · split ${who.length} ways` : `Log ${inr(r.total)}`}
            </Button>
          </div>
        </div>
      )}
    </Sheet>
  );
}

async function share(text: string, toast: ReturnType<typeof useToast>) {
  try {
    if (navigator.share) return void (await navigator.share({ text }));
  } catch (e) {
    if ((e as Error).name === 'AbortError') return;
  }
  await navigator.clipboard?.writeText(text).catch(() => {});
  toast({ message: 'Copied — paste it in WhatsApp' });
}

/** Who owes me what (and whom I owe), with a ready-to-send tally per person. */
export function OwedCard({ onScan }: { onScan: () => void }) {
  const { settings, save } = useSettings();
  const { data: splits = [] } = useList<SplitRow>('splits');
  const { data: people = [] } = useList<PersonRow>('people');
  const { update } = useResource<SplitRow>('splits');
  const toast = useToast();
  const [open, setOpen] = useState<string | null>(null);
  // A new random opener each time a tally is opened; 🎲 reshuffles.
  const [seed, setSeed] = useState(Math.random());
  const bs = balances(splits);
  const nameOf = (id: string) => people.find((p) => p.id === id)?.name ?? 'Someone';
  const sum = balancesSummary(bs, nameOf);
  const settle = (pid: string) => {
    const ids = bs.find((b) => b.person_id === pid)?.open.map((s) => s.id) ?? [];
    const at = new Date().toISOString();
    ids.forEach((id) => update({ id, settled_at: at }));
    haptic(14);
    toast({ message: `Settled up with ${nameOf(pid)}`, action: { label: 'Undo', onClick: () => ids.forEach((id) => update({ id, settled_at: null })) } });
  };

  return (
    <div className="min-w-0 rounded-3xl border border-line bg-surface p-5">
      <div className="mb-3 flex items-start justify-between gap-2">
        <p className="flex items-center gap-2 pt-2 text-micro font-black uppercase tracking-[0.25em] text-ink-3">
          <ReceiptText className="size-3.5 text-accent" /> Shared bills
        </p>
        <Button size="sm" onClick={onScan}>
          <Sparkles className="size-4" /> Scan bill
        </Button>
      </div>
      {bs.length > 0 ? (
        <div className="mb-3 grid grid-cols-2 gap-2">
          <div className="rounded-lg bg-green/10 px-3 py-2">
            <p className="text-micro font-bold uppercase tracking-wider text-ink-3">To collect</p>
            <p className="font-mono text-xl font-bold text-green">{inr(sum.owed)}</p>
          </div>
          <div className={cx('rounded-lg px-3 py-2', sum.owe > 0 ? 'bg-accent/10' : 'bg-bg')}>
            <p className="text-micro font-bold uppercase tracking-wider text-ink-3">You owe</p>
            <p className={cx('font-mono text-xl font-bold', sum.owe > 0 ? 'text-accent-2' : 'text-ink-3')}>{inr(sum.owe)}</p>
          </div>
        </div>
      ) : (
        <p className="mb-2 text-2xl font-black italic">All square ✓</p>
      )}
      <ul className="space-y-2">
        {bs.map((b) => {
          const p = people.find((x) => x.id === b.person_id);
          const msg = settleMessage(p?.name ?? 'there', b, settings.upi, seed);
          return (
            <li key={b.person_id} className="rounded-lg border border-line bg-bg">
              <button onClick={() => (setOpen(open === b.person_id ? null : b.person_id), setSeed(Math.random()))} className="flex w-full items-center gap-3 p-3 text-left">
                <span className="grid size-9 place-items-center rounded-full bg-surface-2">{p?.emoji || (p?.name ?? '?').slice(0, 1)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block font-bold">{p?.name ?? 'Someone'}</span>
                  <span className="block text-tiny text-ink-3">{b.open.length} bill{b.open.length > 1 ? 's' : ''} · since {new Date(`${b.open[0].date}T12:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</span>
                </span>
                <span className={cx('font-mono font-bold', b.net > 0 ? 'text-green' : 'text-accent-2')}>
                  {b.net > 0 ? '+' : '−'}
                  {inr(Math.abs(b.net))}
                </span>
              </button>
              <AnimatePresence>
                {open === b.person_id && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                    <pre className="mx-3 whitespace-pre-wrap [overflow-wrap:anywhere] rounded-md bg-surface p-3 font-sans text-sm text-ink-2">{msg}</pre>
                    <div className="flex gap-2 p-3">
                      {b.net > 0 && (
                        <Button size="sm" variant="ghost" aria-label="Another message" onClick={() => (haptic(8), setSeed(Math.random()))}>
                          🎲
                        </Button>
                      )}
                      <Button size="sm" variant="soft" className="flex-1" onClick={() => void share(msg, toast)}>
                        <Share2 className="size-4" /> Send
                      </Button>
                      <Button size="sm" className="flex-1" onClick={() => settle(b.person_id)}>
                        <Check className="size-4" /> Settled
                      </Button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </li>
          );
        })}
      </ul>
      {bs.length === 0 && <p className="text-sm text-ink-3">Scan a bill, pick who was in, and it keeps a running tally per person — with a message ready to send.</p>}
      {bs.length > 1 && (
        <Button size="sm" variant="ghost" className="mt-2" onClick={() => void share(['Pending:', ...bs.map((b) => `• ${b.net > 0 ? `${nameOf(b.person_id)} owes ${inr(b.net)}` : `I owe ${nameOf(b.person_id)} ${inr(-b.net)}`}`)].join('\n'), toast)}>
          <Share2 className="size-4" /> Share full summary
        </Button>
      )}
      <label className="mt-3 flex items-center gap-2 text-tiny text-ink-3">
        Your UPI id
        <input defaultValue={settings.upi ?? ''} onBlur={(e) => e.target.value.trim() !== (settings.upi ?? '') && save({ upi: e.target.value.trim() })} placeholder="name@okhdfc" className="field h-8 min-w-0 flex-1 !py-0 text-sm" autoCapitalize="off" autoCorrect="off" />
      </label>
    </div>
  );
}
