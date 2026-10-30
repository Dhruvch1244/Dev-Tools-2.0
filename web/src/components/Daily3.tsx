import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BookOpen, Check, Loader2, RefreshCw, Shuffle, Sparkles } from 'lucide-react';
import { api, useSettings } from '../lib/api';
import { haptic, relativeDay, today } from '../lib/format';
import { md } from '../lib/dsa';
import { CHAPTERS, chapterOf, progress, storyStreak, type StoryQ } from '../core/story';
import { Button, Card, Sheet, cx } from './ui';
import { useToast } from './toast';

export function useStory() {
  const t = today();
  const qc = useQueryClient();
  const { data: qs = [], isLoading } = useQuery({ queryKey: ['story', 'today', t], queryFn: () => api<StoryQ[]>(`/story/today?date=${t}`) });
  const { data: days = [] } = useQuery({ queryKey: ['story', 'days'], queryFn: () => api<string[]>('/story/days') });
  const save = async (id: string, a: string) => {
    qc.setQueryData<StoryQ[]>(['story', 'today', t], (old = []) => old.map((x) => (x.id === id ? { ...x, a } : x)));
    await api(`/story/${id}`, { method: 'PUT', body: JSON.stringify({ a }) });
    void qc.invalidateQueries({ queryKey: ['story', 'days'] });
  };
  const swap = async (id: string) => {
    await api(`/story/${id}/swap`, { method: 'POST' });
    await qc.invalidateQueries({ queryKey: ['story'] });
  };
  const answered = qs.filter((x) => x.a?.trim()).length;
  return { qs, isLoading, save, swap, answered, streak: storyStreak(days, t), days };
}

const KIND_LABEL = (x: StoryQ) => {
  if (x.kind === 'follow') return { emoji: '↪️', label: 'Follow-up' };
  if (x.kind === 'everyday') return { emoji: '☕', label: 'Everyday' };
  const ch = CHAPTERS.find((c) => c.id === x.chapter) ?? chapterOf(x.q);
  return { emoji: ch?.emoji ?? '📖', label: ch?.title ?? 'Your story' };
};

/** One question: tap to write; saves as you pause and when you leave the box. */
function Question({ x, n, onSave, onSwap }: { x: StoryQ; n: number; onSave: (a: string) => Promise<void>; onSwap: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(x.a ?? '');
  const [busy, setBusy] = useState(false);
  const saved = useRef(x.a ?? '');
  const box = useRef<HTMLTextAreaElement>(null);
  const saveRef = useRef(onSave);
  saveRef.current = onSave;
  // Another device answered it: show theirs unless we're mid-edit.
  useEffect(() => {
    if (!open && (x.a ?? '') !== saved.current) (setText(x.a ?? ''), (saved.current = x.a ?? ''));
  }, [x.a, open]);
  useEffect(() => {
    if (!open || text === saved.current) return;
    const id = setTimeout(() => ((saved.current = text), void saveRef.current(text)), 1200);
    return () => clearTimeout(id);
  }, [text, open]);
  useEffect(() => {
    const el = box.current;
    if (el) (el.style.height = 'auto'), (el.style.height = `${Math.max(96, el.scrollHeight)}px`);
  }, [text, open]);
  const done = !!x.a?.trim();
  const k = KIND_LABEL(x);
  const close = () => {
    if (text !== saved.current) (saved.current = text), void onSave(text);
    setOpen(false);
  };
  return (
    <li className={cx('rounded-xl border bg-bg transition-colors', open ? 'border-accent' : 'border-line')}>
      <button onClick={() => (open ? close() : (setOpen(true), setTimeout(() => box.current?.focus(), 60)))} className="flex w-full items-start gap-3 p-3 text-left">
        <span className={cx('slant grid h-7 w-9 shrink-0 place-items-center font-display text-sm font-black italic', done ? 'bg-green text-black' : 'bg-surface-2 text-ink-2')}>{done ? <Check className="size-4" /> : `0${n}`}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-micro font-bold uppercase tracking-wider text-ink-3">
            {k.emoji} {k.label}
          </span>
          <span className="mt-0.5 block text-[15px] font-semibold leading-snug">{x.q}</span>
          {!open && done && <span className="mt-1.5 line-clamp-2 block text-sm text-ink-2">{x.a}</span>}
        </span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="px-3 pb-3">
              <textarea
                ref={box}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onBlur={() => text !== saved.current && ((saved.current = text), void onSave(text))}
                placeholder="Write like you're telling a friend. A few lines is plenty."
                className="field w-full resize-none py-2.5 text-[15px] leading-relaxed"
              />
              <div className="mt-2 flex items-center gap-2">
                {!done && (
                  <button
                    disabled={busy}
                    onClick={async () => {
                      setBusy(true);
                      await onSwap().finally(() => setBusy(false));
                    }}
                    className="flex items-center gap-1 rounded-md bg-surface-2 px-2.5 py-1.5 text-tiny font-bold uppercase text-ink-2"
                  >
                    {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Shuffle className="size-3.5" />} Another question
                  </button>
                )}
                <span className="ml-auto text-tiny text-ink-3">{text.trim() ? `${text.trim().split(/\s+/).length} words` : ''}</span>
                <Button size="sm" onClick={() => (haptic(10), close())}>
                  Done
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </li>
  );
}

/** Ten chapters of your story, each a strip that fills as you answer; the current one named. */
function Journey({ rows }: { rows: { q: string; a: string | null }[] }) {
  const p = progress(rows);
  const cur = p.find((c) => c.done < c.total);
  const i = cur ? p.indexOf(cur) : p.length;
  return (
    <div>
      <p className="mb-2 text-tiny text-ink-3">
        {cur ? (
          <>
            Chapter {i + 1} of {p.length} · <b className="text-ink">{cur.emoji} {cur.title}</b> — {cur.blurb.toLowerCase()} · {cur.done}/{cur.total}
          </>
        ) : (
          'Every chapter written — follow-ups and everyday questions from here.'
        )}
      </p>
      <div className="flex gap-1">
        {p.map((c) => (
          <div key={c.id} title={`${c.title}: ${c.done}/${c.total}`} className="min-w-0 flex-1 text-center">
            <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
              <div className="h-full rounded-full" style={{ width: `${(c.done / c.total) * 100}%`, background: c.done === c.total ? 'var(--green)' : 'var(--accent)' }} />
            </div>
            <span className={cx('mt-1 block text-xs', c.id !== cur?.id && !c.done && 'opacity-40 grayscale')}>{c.emoji}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Everything you've written, by chapter, and the AI's portrait of you built from it. */
function StorySheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { settings } = useSettings();
  const qc = useQueryClient();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const { data: rows = [] } = useQuery({ queryKey: ['story', 'all'], queryFn: () => api<StoryQ[]>('/story'), enabled: open });
  const portrait = settings.storyPortrait;
  const groups = [...CHAPTERS.map((c) => ({ id: c.id, title: `${c.emoji} ${c.title}`, rows: rows.filter((r) => r.chapter === c.id) })), { id: 'more', title: '☕ Everyday & follow-ups', rows: rows.filter((r) => !r.chapter) }].filter((g) => g.rows.length);
  const paint = async () => {
    setBusy(true);
    try {
      await api('/story/portrait', { method: 'POST' });
      await qc.invalidateQueries({ queryKey: ['settings'] });
    } catch (e) {
      toast({ message: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet open={open} onClose={onClose} title="Your story">
      <div className="space-y-5">
        <section className="rounded-xl border border-line bg-bg p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="flex items-center gap-2 text-micro font-black uppercase tracking-[0.2em] text-accent">
              <Sparkles className="size-3.5" /> What I’m learning about you
            </p>
            <Button size="sm" variant="soft" disabled={busy || rows.length < 5} onClick={paint}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />} {portrait ? 'Refresh' : 'Write it'}
            </Button>
          </div>
          {portrait ? (
            <>
              <div className="prose-f1 mt-3 text-sm leading-relaxed" dangerouslySetInnerHTML={{ __html: md(portrait.text) }} />
              <p className="mt-2 text-tiny text-ink-3">
                From {portrait.n} answers · {relativeDay(portrait.at.slice(0, 10))}
                {rows.length > portrait.n && ` · ${rows.length - portrait.n} new since`}
              </p>
            </>
          ) : (
            <p className="mt-2 text-sm text-ink-3">{rows.length < 5 ? `Answer ${5 - rows.length} more question${5 - rows.length === 1 ? '' : 's'} and I’ll write a portrait of you from what you’ve shared.` : 'Ready — tap “Write it”.'}</p>
          )}
        </section>
        {groups.map((g) => (
          <section key={g.id}>
            <p className="mb-2 font-display text-sm font-black uppercase italic">{g.title}</p>
            <ul className="space-y-3">
              {g.rows.map((r) => (
                <li key={r.id} className="border-l-2 border-line pl-3">
                  <p className="text-sm font-semibold">{r.q}</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-ink-2">{r.a}</p>
                  <p className="mt-1 text-tiny text-ink-3">{relativeDay(r.date)}</p>
                </li>
              ))}
            </ul>
          </section>
        ))}
        {!rows.length && <p className="text-sm text-ink-3">Nothing yet — your answers will collect here, chapter by chapter.</p>}
      </div>
    </Sheet>
  );
}

/**
 * Daily 3: three questions about your life — the next one in your story, an easy everyday one, and
 * (once you've written a bit) a follow-up on something you said. Builds a memoir over months.
 */
export function Daily3({ className, compact }: { className?: string; compact?: boolean }) {
  const { qs, isLoading, save, swap, answered, streak } = useStory();
  const [sheet, setSheet] = useState(false);
  const { data: all = [] } = useQuery({ queryKey: ['story', 'all'], queryFn: () => api<StoryQ[]>('/story') });
  return (
    // Animates itself in: inside the shutdown sheet there's no page-level stagger to trigger it.
    <Card className={className} initial="hidden" animate="show">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-micro font-black uppercase tracking-[0.25em] text-accent">Daily 3 · your story</p>
          <h2 className="font-display text-xl font-black uppercase italic leading-tight">{answered === 3 ? 'All three done' : answered ? `${3 - answered} to go` : 'Three questions for you'}</h2>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {streak > 0 && <span className="slant bg-surface-2 px-2 py-0.5 font-mono text-tiny font-bold">🔥 {streak}d</span>}
          <button onClick={() => setSheet(true)} className="flex items-center gap-1 rounded-md bg-surface-2 px-2.5 py-1.5 text-tiny font-bold uppercase text-ink-2" aria-label="Read your story">
            <BookOpen className="size-3.5" /> {all.length}
          </button>
        </div>
      </div>
      {isLoading ? (
        <div className="h-40 animate-pulse rounded-xl bg-surface-2" />
      ) : (
        <ul className="space-y-2">
          {qs.map((x, i) => (
            <Question key={x.id} x={x} n={i + 1} onSave={(a) => save(x.id, a)} onSwap={() => swap(x.id)} />
          ))}
        </ul>
      )}
      {!compact && (
        <div className="mt-4 border-t border-line pt-3">
          <Journey rows={all} />
        </div>
      )}
      <StorySheet open={sheet} onClose={() => setSheet(false)} />
    </Card>
  );
}
