import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowUp, Check, Loader2, MapPin, ReceiptIndianRupee, Trash2 } from 'lucide-react';
import { api, useList, useResource } from '../lib/api';
import { daysBetween, haptic, parseDate, today } from '../lib/format';
import type { AiAction } from '../core/aiActions';
import type { Note, Task } from '../lib/types';
import { planPrompt } from '../core/notes';
import { ActionCards } from './AiActions';
import { Mic } from './Mic';
import { Card, SectionTitle, cx } from './ui';
import { useToast } from './toast';

const when = (due: string, t: string) => {
  const n = daysBetween(t, due.slice(0, 10));
  return n < 0 ? `${-n}d late` : n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : n < 7 ? parseDate(due.slice(0, 10)).toLocaleDateString(undefined, { weekday: 'long' }) : `in ${n} days`;
};
const dayLabel = (due: string) => parseDate(due.slice(0, 10)).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }) + (due.length > 10 ? ` · ${due.slice(11, 16)}` : '');

/**
 * What's coming that isn't work or gym: outings you've planned and bills to pay. Say it in plain
 * words ("dinner at Social with Riya on Friday 8", "electricity bill 1200 on the 10th every month")
 * and it becomes a calendar plan or a bill reminder — confirmed with a tap, never saved silently.
 */
export function Upcoming() {
  const t = today();
  const toast = useToast();
  const { data: tasks = [] } = useList<Task>('tasks');
  const { update, remove } = useResource<Task>('tasks');
  const { data: notes = [] } = useList<Note>('notes');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [proposed, setProposed] = useState<AiAction[] | null>(null);

  const plans = tasks.filter((x) => x.kind === 'plan' && !x.done && x.due && daysBetween(t, x.due.slice(0, 10)) >= 0 && daysBetween(t, x.due.slice(0, 10)) <= 45);
  const bills = tasks.filter((x) => x.kind === 'bill' && !x.done && x.due && daysBetween(t, x.due.slice(0, 10)) <= 31);
  const billTotal = bills.reduce((a, b) => a + (b.amount ?? 0), 0);

  // Thu–Sat with nothing planned for the weekend: nudge a place from your Notes list.
  const dow = parseDate(t).getDay();
  const weekendPlanned = plans.some((p) => daysBetween(t, p.due!.slice(0, 10)) <= 7 - dow && [0, 6].includes(parseDate(p.due!.slice(0, 10)).getDay()));
  const places = dow >= 4 && dow <= 6 && !weekendPlanned ? notes.filter((n) => n.list === 'places' && !n.done).slice(0, 3) : [];

  const ask = async (override?: string) => {
    const q = override ?? text;
    if (!q.trim() || busy) return;
    if (override) setText(override);
    setBusy(true);
    setProposed(null);
    try {
      const r = await api<{ actions: AiAction[] }>('/ai/capture', { method: 'POST', body: JSON.stringify({ text: q }) });
      setProposed(r.actions);
      if (!r.actions.length) toast({ message: 'Couldn’t pin that down — add a day?' });
    } catch (e) {
      toast({ message: `AI unavailable: ${(e as Error).message}` });
    } finally {
      setBusy(false);
    }
  };
  const paid = (b: Task) => {
    haptic(12);
    update({ id: b.id, done: 1 });
    toast({ message: b.amount ? `Paid · ₹${b.amount.toLocaleString('en-IN')} logged in Money` : 'Marked paid' });
  };

  return (
    <Card>
      <SectionTitle action={billTotal > 0 && <span className="text-tiny text-ink-3">₹{Math.round(billTotal).toLocaleString('en-IN')} in bills this month</span>}>Coming up</SectionTitle>
      <form onSubmit={(e) => (e.preventDefault(), void ask())} className="flex items-end gap-2">
        <textarea
          rows={1}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && (e.preventDefault(), void ask())}
          placeholder="Say a plan or a bill…"
          enterKeyHint="send"
          className="field min-h-11 flex-1 resize-none text-base"
        />
        <Mic value={text} onChange={setText} />
        <button type="submit" disabled={!text.trim() || busy} aria-label="Plan it" className="grid size-11 shrink-0 place-items-center rounded-md bg-accent text-white disabled:opacity-40">
          {busy ? <Loader2 className="size-5 animate-spin" /> : <ArrowUp className="size-5" />}
        </button>
      </form>
      {!proposed && places.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-tiny text-ink-3">
          Weekend free? From your list:
          {places.map((n) => (
            <button key={n.id} onClick={() => void ask(planPrompt(n.title ?? '', n.body))} className="rounded-md bg-accent-soft px-2 py-1 font-bold text-accent">
              📍 {n.title}
            </button>
          ))}
        </div>
      )}
      {!proposed && !plans.length && !bills.length && <p className="mt-2 text-tiny text-ink-3">e.g. “Lodhi Garden picnic Sunday 4 pm” · “rent 18000 on the 1st every month” · “Goa trip 20–23 Dec”</p>}
      {proposed && <ActionCards actions={proposed} onDone={() => (setProposed(null), setText(''))} />}

      {(plans.length > 0 || bills.length > 0) && (
        <ul className="mt-3 space-y-1.5">
          <AnimatePresence initial={false}>
            {[...plans, ...bills]
              .sort((a, b) => a.due!.localeCompare(b.due!))
              .map((x) => {
                const bill = x.kind === 'bill';
                const n = daysBetween(t, x.due!.slice(0, 10));
                return (
                  <motion.li key={x.id} layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }} className="group flex items-center gap-3 rounded-md bg-bg px-3 py-2.5">
                    <span className={cx('grid size-9 shrink-0 place-items-center rounded-md', bill ? 'bg-amber/15 text-amber' : 'bg-accent-soft text-accent')}>{bill ? <ReceiptIndianRupee className="size-4" /> : <MapPin className="size-4" />}</span>
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 font-semibold leading-snug">
                        {x.title}
                        {bill && x.amount ? <span className="font-mono text-ink-2"> · ₹{x.amount.toLocaleString('en-IN')}</span> : null}
                      </p>
                      <p className="truncate text-tiny text-ink-3">
                        <span className={cx('font-bold uppercase', n <= 0 ? 'text-accent' : n <= 2 ? 'text-amber' : 'text-ink-2')}>{when(x.due!, t)}</span> · {dayLabel(x.due!)}
                        {x.place ? ` · ${x.place}` : ''}
                        {bill && x.repeat ? ` · ${x.repeat}` : ''}
                      </p>
                    </div>
                    {bill ? (
                      <button onClick={() => paid(x)} className="flex h-9 shrink-0 items-center gap-1 rounded-md bg-green/15 px-2 text-mini font-bold uppercase text-green">
                        <Check className="size-3.5" /> Paid
                      </button>
                    ) : (
                      <button onClick={() => (remove(x.id), toast({ message: 'Plan removed' }))} aria-label="Remove plan" className="grid size-9 shrink-0 place-items-center text-ink-3 opacity-60 transition group-hover:opacity-100">
                        <Trash2 className="size-4" />
                      </button>
                    )}
                  </motion.li>
                );
              })}
          </AnimatePresence>
        </ul>
      )}
    </Card>
  );
}
