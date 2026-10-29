import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, LayoutGroup, motion } from 'motion/react';
import { CalendarPlus, Check, Loader2, Pin, Plus, Search, ShoppingCart, Sparkles, StickyNote, Trash2, X } from 'lucide-react';
import { api, useList, useResource } from '../lib/api';
import { NOTE_COLORS } from '../lib/categories';
import { spring } from '../lib/motion';
import { haptic, timeAgo } from '../lib/format';
import { LISTS, LIST_ORDER, planPrompt, type ListId, type Sorted } from '../core/notes';
import type { AiAction } from '../core/aiActions';
import { ActionCards } from '../components/AiActions';
import { Mic } from '../components/Mic';
import type { Note, ShopRow } from '../lib/types';
import { useToast } from '../components/toast';
import { Button, Empty, IconButton, Page, PageHeader, Rise, Sheet, cx } from '../components/ui';

const tint = (c: string | null) => (c ? { background: `color-mix(in oklab, ${c} 14%, var(--surface))`, borderColor: `color-mix(in oklab, ${c} 35%, transparent)` } : undefined);

function NoteCard({ note, onOpen }: { note: Note; onOpen: () => void }) {
  return (
    <motion.button
      layout
      layoutId={`note-${note.id}`}
      onClick={onOpen}
      initial={{ opacity: 0, scale: 0.94 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      whileHover={{ y: -3 }}
      transition={spring}
      style={tint(note.color)}
      className="glass mb-3 block w-full break-inside-avoid rounded-3xl p-4 text-left"
    >
      <motion.div layout="position" className="flex items-start gap-2">
        <h3 className="min-w-0 flex-1 font-display text-[17px] font-semibold leading-snug tracking-tight">{note.title || <span className="text-ink-3">Untitled</span>}</h3>
        {!!note.pinned && <Pin className="mt-1 size-3.5 shrink-0 fill-current text-accent" />}
      </motion.div>
      {note.body && <motion.p layout="position" className="mt-1.5 line-clamp-[8] whitespace-pre-wrap text-sm leading-relaxed text-ink-2">{note.body}</motion.p>}
      <motion.p layout="position" className="mt-3 text-tiny text-ink-3">{timeAgo(note.updated_at)}</motion.p>
    </motion.button>
  );
}

function NoteEditor({ note, onClose }: { note: Note; onClose: () => void }) {
  const { update, remove, create } = useResource<Note>('notes');
  const toast = useToast();
  const [draft, setDraft] = useState(note);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const latest = useRef(draft);
  latest.current = draft;

  const flush = () => {
    clearTimeout(timer.current);
    const d = latest.current;
    if (d.title !== note.title || d.body !== note.body) update({ id: d.id, title: d.title, body: d.body });
  };
  const edit = (patch: Partial<Note>) => {
    setDraft((d) => ({ ...d, ...patch }));
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, 500);
  };
  const close = () => {
    flush();
    if (!latest.current.title?.trim() && !latest.current.body?.trim()) remove(note.id);
    onClose();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return createPortal(
    <div className="fixed inset-0 z-50 grid place-items-center p-3 sm:p-8">
      <motion.div className="absolute inset-0 bg-black/50 backdrop-blur-md" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={close} />
      <motion.div
        layoutId={`note-${note.id}`}
        transition={spring}
        style={tint(draft.color)}
        className="relative flex h-[min(720px,86dvh)] w-full max-w-2xl flex-col rounded-[28px] border border-line bg-surface-solid p-5 shadow-2xl sm:p-7"
      >
        <div className="flex items-center gap-1">
          {NOTE_COLORS.map((c) => (
            <motion.button
              key={c.name}
              whileTap={{ scale: 0.8 }}
              aria-label={`Color ${c.name}`}
              onClick={() => (setDraft((d) => ({ ...d, color: c.value })), update({ id: note.id, color: c.value }))}
              className={cx('grid size-7 place-items-center rounded-full transition', draft.color === c.value && 'ring-2 ring-ink/40')}
            >
              <span className="size-4 rounded-full border border-line-strong" style={{ background: c.value ?? 'transparent' }} />
            </motion.button>
          ))}
          <div className="ml-auto flex items-center gap-1">
            <IconButton label={draft.pinned ? 'Unpin' : 'Pin'} onClick={() => (setDraft((d) => ({ ...d, pinned: d.pinned ? 0 : 1 })), update({ id: note.id, pinned: draft.pinned ? 0 : 1 }))}>
              <Pin className={cx('size-4', draft.pinned && 'fill-current text-accent')} />
            </IconButton>
            <IconButton
              label="Delete note"
              onClick={() => {
                remove(note.id);
                onClose();
                const { id: _, created_at: __, updated_at: ___, ...rest } = latest.current;
                toast({ message: 'Note deleted', action: { label: 'Undo', onClick: () => void create(rest) } });
              }}
            >
              <Trash2 className="size-4" />
            </IconButton>
            <IconButton label="Close" onClick={close}>
              <X className="size-4" />
            </IconButton>
          </div>
        </div>
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1, transition: { delay: 0.12 } }} className="mt-4 flex min-h-0 flex-1 flex-col">
          <input
            value={draft.title ?? ''}
            onChange={(e) => edit({ title: e.target.value })}
            placeholder="Title"
            autoFocus={!note.title}
            className="bg-transparent font-display text-3xl font-semibold tracking-tight outline-none placeholder:text-ink-3"
          />
          <textarea
            value={draft.body ?? ''}
            onChange={(e) => edit({ body: e.target.value })}
            placeholder="Start writing…"
            className="mt-3 min-h-0 flex-1 resize-none bg-transparent text-[15px] leading-relaxed text-ink outline-none placeholder:text-ink-3"
          />
          <p className="pt-2 text-right text-tiny text-ink-3">Saves automatically</p>
        </motion.div>
      </motion.div>
    </div>,
    document.body,
  );
}

/** Turn a "places" item into calendar plan cards, in a sheet. */
function PlanItSheet({ note, onClose }: { note: Note | null; onClose: () => void }) {
  const [actions, setActions] = useState<AiAction[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const { update } = useResource<Note>('notes');
  useEffect(() => {
    if (!note) return;
    setActions(null);
    setErr(null);
    api<{ actions: AiAction[] }>('/ai/capture', { method: 'POST', body: JSON.stringify({ text: planPrompt(note.title ?? '', note.body) }) })
      .then((r) => setActions(r.actions))
      .catch((e: Error) => setErr(e.message));
  }, [note]);
  return (
    <Sheet open={!!note} onClose={onClose} title={note ? `Plan it · ${note.title}` : ''}>
      {!actions && !err && <p className="py-4 text-sm text-ink-3">Finding a slot this weekend…</p>}
      {err && <p className="text-sm text-accent">{err}</p>}
      {actions && (
        <>
          <p className="mb-2 text-tiny text-ink-3">Not the right day? Dismiss it and say it your way in Today → Coming up (“Bukhara Saturday 8pm”).</p>
          <ActionCards actions={actions} onDone={() => (note && update({ id: note.id, done: 1 }), onClose())} />
        </>
      )}
    </Sheet>
  );
}

function ListRow({ note, onOpen, onPlan }: { note: Note; onOpen: () => void; onPlan: () => void }) {
  const { update } = useResource<Note>('notes');
  const shop = useResource<ShopRow>('shopping');
  const toast = useToast();
  const done = !!note.done;
  const list = (note.list ?? 'note') as ListId;
  return (
    <motion.li layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: done ? 0.5 : 1, y: 0 }} exit={{ opacity: 0, height: 0 }} className="flex items-center gap-3 rounded-xl bg-bg px-3 py-2.5">
      <motion.button whileTap={{ scale: 0.8 }} onClick={() => (haptic(8), update({ id: note.id, done: done ? 0 : 1 }))} aria-label={done ? 'Mark not done' : 'Mark done'} className={cx('grid size-6 shrink-0 place-items-center rounded-full border-2', done ? 'border-green bg-green text-black' : 'border-line-strong')}>
        {done && <Check className="size-3.5" />}
      </motion.button>
      <button onClick={onOpen} className="min-w-0 flex-1 text-left">
        <p className={cx('truncate font-semibold', done && 'line-through')}>{note.title}</p>
        {(note.body || note.person) && (
          <p className="truncate text-tiny text-ink-3">
            {note.person && <span className="mr-1 rounded bg-pink/15 px-1 font-bold text-pink">for {note.person}</span>}
            {note.body}
          </p>
        )}
      </button>
      {!done && list === 'places' && (
        <Button size="sm" variant="soft" onClick={onPlan}>
          <CalendarPlus className="size-4" /> Plan it
        </Button>
      )}
      {!done && list === 'buy' && (
        <Button size="sm" variant="soft" onClick={() => (void shop.create({ name: note.title ?? '', qty: null, done: 0, source: 'manual', trip: 'minor' }), update({ id: note.id, done: 1 }), toast({ message: 'Added to the shopping top-up' }))}>
          <ShoppingCart className="size-4" /> List
        </Button>
      )}
    </motion.li>
  );
}

/** Jot anything; AI files it into lists (instantly) and dated things into confirm cards. */
function JotBar() {
  const { create, remove } = useResource<Note>('notes');
  const toast = useToast();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [filed, setFiled] = useState<{ list: ListId; title: string }[]>([]);
  const [actions, setActions] = useState<AiAction[]>([]);
  const go = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    try {
      const r = await api<Sorted>('/notes/sort', { method: 'POST', body: JSON.stringify({ text }) });
      const made: Note[] = [];
      for (const it of r.items) made.push(await create({ title: it.title, body: it.body, list: it.list === 'note' ? 'note' : it.list, person: it.person, pinned: 0, done: 0 }));
      setFiled(r.items.map((i) => ({ list: i.list, title: i.title })));
      setActions(r.actions);
      setText('');
      haptic(15);
      if (made.length) toast({ message: `Filed ${made.length}`, action: { label: 'Undo', onClick: () => made.forEach((n) => remove(n.id)) } });
      if (!made.length && !r.actions.length) toast({ message: 'Nothing to file there' });
    } catch (e) {
      toast({ message: `AI unavailable: ${(e as Error).message}` });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="mb-5 rounded-2xl border border-line bg-surface p-3">
      <form onSubmit={(e) => (e.preventDefault(), void go())} className="flex items-end gap-2">
        <textarea
          rows={2}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && (e.preventDefault(), void go())}
          placeholder="Jot anything — a place to try, a film, a gift idea for Mom, stuff to buy, an idea, a dentist visit Tuesday 6pm…"
          className="min-h-14 flex-1 resize-none bg-transparent px-1 py-1 text-base outline-none placeholder:text-ink-3"
        />
        <Mic value={text} onChange={setText} />
        <button type="submit" disabled={!text.trim() || busy} aria-label="File it" className="grid size-11 shrink-0 place-items-center rounded-md bg-accent text-white disabled:opacity-40">
          {busy ? <Loader2 className="size-5 animate-spin" /> : <Sparkles className="size-5" />}
        </button>
      </form>
      <AnimatePresence>
        {filed.length > 0 && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="mt-2 flex flex-wrap gap-1.5">
            {filed.map((f, i) => (
              <motion.span key={f.title + i} initial={{ opacity: 0, scale: 0.7 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.06 }} className="rounded-md bg-bg px-2 py-1 text-tiny">
                {LISTS[f.list].emoji} {f.title} <span className="text-ink-3">→ {LISTS[f.list].label}</span>
              </motion.span>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
      {actions.length > 0 && <ActionCards actions={actions} onDone={() => setActions([])} />}
    </div>
  );
}

export function NotesPage() {
  const { data: notes = [] } = useList<Note>('notes');
  const { create } = useResource<Note>('notes');
  const [q, setQ] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [filter, setFilter] = useState<ListId | 'all'>('all');
  const [planning, setPlanning] = useState<Note | null>(null);
  const [showDone, setShowDone] = useState(false);

  const matches = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? notes.filter((n) => `${n.title} ${n.body} ${n.person ?? ''}`.toLowerCase().includes(s)) : notes;
  }, [notes, q]);
  const listOf = (n: Note): ListId => (n.list as ListId | null) ?? 'note';
  const plain = matches.filter((n) => listOf(n) === 'note' && (filter === 'all' || filter === 'note'));
  const lists = LIST_ORDER.filter((l) => l !== 'note' && (filter === 'all' || filter === l));
  const open = notes.find((n) => n.id === openId);
  const count = (l: ListId) => notes.filter((n) => listOf(n) === l && !n.done).length;
  const doneCount = matches.filter((n) => listOf(n) !== 'note' && n.done).length;

  const newNote = async () => {
    const n = await create({ title: '', body: '', pinned: 0, list: 'note' });
    setOpenId(n.id);
  };

  return (
    <Page>
      <PageHeader
        eyebrow={`${notes.filter((n) => !n.done).length} open`}
        title="Notes"
        action={
          <Button variant="ghost" onClick={newNote}>
            <Plus className="size-4" /> <span className="max-sm:hidden">Plain note</span>
          </Button>
        }
      />
      <Rise>
        <JotBar />
      </Rise>
      <Rise className="no-scrollbar -mx-1 mb-4 flex gap-1.5 overflow-x-auto px-1">
        {(['all', ...LIST_ORDER] as const).map((l) => (
          <button key={l} onClick={() => setFilter(l)} className={cx('flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-mini font-bold', filter === l ? 'bg-ink text-bg' : 'bg-surface-2 text-ink-2')}>
            {l === 'all' ? 'All' : `${LISTS[l].emoji} ${LISTS[l].label}`}
            {l !== 'all' && count(l) > 0 && <span className={cx('font-mono', filter === l ? 'text-bg/70' : 'text-ink-3')}>{count(l)}</span>}
          </button>
        ))}
      </Rise>
      <Rise className="relative mb-5">
        <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
        <input type="search" enterKeyHint="search" autoCorrect="off" autoCapitalize="off" spellCheck={false} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search everything" className="field h-11 w-full !rounded-full !pl-11" />
      </Rise>

      {lists.map((l) => {
        const items = matches.filter((n) => listOf(n) === l && (showDone || !n.done));
        if (!items.length && filter !== l) return null;
        return (
          <Rise key={l} className="mb-5">
            <p className="mb-2 flex items-center gap-2 text-micro font-black uppercase tracking-[0.2em]" style={{ color: LISTS[l].color }}>
              {LISTS[l].emoji} {LISTS[l].label}
            </p>
            {items.length ? (
              <ul className="space-y-1.5">
                <AnimatePresence initial={false}>
                  {items.map((n) => (
                    <ListRow key={n.id} note={n} onOpen={() => setOpenId(n.id)} onPlan={() => setPlanning(n)} />
                  ))}
                </AnimatePresence>
              </ul>
            ) : (
              <p className="rounded-xl bg-bg px-3 py-3 text-sm text-ink-3">{LISTS[l].hint}</p>
            )}
          </Rise>
        );
      })}
      {doneCount > 0 && (
        <button onClick={() => setShowDone(!showDone)} className="mb-5 text-mini font-bold uppercase text-ink-3">
          {showDone ? 'Hide done' : `Show ${doneCount} done`}
        </button>
      )}

      {(filter === 'all' || filter === 'note') && (
        <LayoutGroup>
          {plain.length > 0 && <p className="mb-2 text-micro font-black uppercase tracking-[0.2em] text-ink-3">📝 Notes</p>}
          <Rise className="columns-1 gap-3 sm:columns-2 xl:columns-3">
            <AnimatePresence>
              {plain.map((n) => (n.id === openId ? <div key={n.id} className="mb-3 h-24 break-inside-avoid" /> : <NoteCard key={n.id} note={n} onOpen={() => setOpenId(n.id)} />))}
            </AnimatePresence>
          </Rise>
        </LayoutGroup>
      )}
      {notes.length === 0 && <Empty icon={<StickyNote className="size-6" />} title="Nothing jotted yet" hint="Dump anything in the box above — it gets filed into lists, plans and reminders for you." />}
      <AnimatePresence>{open && <NoteEditor key={open.id} note={open} onClose={() => setOpenId(null)} />}</AnimatePresence>
      <PlanItSheet note={planning} onClose={() => setPlanning(null)} />
    </Page>
  );
}
