import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, LayoutGroup, motion } from 'motion/react';
import { Pin, Plus, Search, StickyNote, Trash2, X } from 'lucide-react';
import { useList, useResource } from '../lib/api';
import { NOTE_COLORS } from '../lib/categories';
import { spring } from '../lib/motion';
import { timeAgo } from '../lib/format';
import type { Note } from '../lib/types';
import { useToast } from '../components/toast';
import { Button, Empty, IconButton, Page, PageHeader, Rise, cx } from '../components/ui';

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

export function NotesPage() {
  const { data: notes = [] } = useList<Note>('notes');
  const { create } = useResource<Note>('notes');
  const [q, setQ] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? notes.filter((n) => `${n.title} ${n.body}`.toLowerCase().includes(s)) : notes;
  }, [notes, q]);
  const open = notes.find((n) => n.id === openId);

  const newNote = async () => {
    const n = await create({ title: '', body: '', pinned: 0 });
    setOpenId(n.id);
  };

  return (
    <Page>
      <PageHeader
        eyebrow={`${notes.length} notes`}
        title="Notes"
        action={
          <Button onClick={newNote}>
            <Plus className="size-4" /> <span className="max-sm:hidden">New note</span>
          </Button>
        }
      />
      <Rise className="relative mb-6">
        <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
        <input type="search" enterKeyHint="search" autoCorrect="off" autoCapitalize="off" spellCheck={false} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search notes" className="field h-12 w-full !rounded-full !pl-11" />
      </Rise>
      <LayoutGroup>
        <Rise className="columns-1 gap-3 sm:columns-2 xl:columns-3">
          <AnimatePresence>
            {filtered.map((n) => (n.id === openId ? <div key={n.id} className="mb-3 h-24 break-inside-avoid" /> : <NoteCard key={n.id} note={n} onOpen={() => setOpenId(n.id)} />))}
          </AnimatePresence>
        </Rise>
        {filtered.length === 0 && <Empty icon={<StickyNote className="size-6" />} title={q ? 'No matches' : 'No notes yet'} hint={q ? undefined : 'Ideas, lists, addresses, recipes… capture anything.'} />}
        <AnimatePresence>{open && <NoteEditor key={open.id} note={open} onClose={() => setOpenId(null)} />}</AnimatePresence>
      </LayoutGroup>
    </Page>
  );
}
