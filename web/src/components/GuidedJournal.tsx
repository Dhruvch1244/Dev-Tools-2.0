import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, BookOpen, Feather, Pencil, PenLine, Sparkles } from 'lucide-react';
import { api, useList } from '../lib/api';
import { addDays, haptic, parseDate, relativeDay, today } from '../lib/format';
import { md } from '../lib/dsa';
import { anotherQuestion, FREE_WRITE, questionsFor, type Answer, type DayFacts } from '../core/journal';
import type { Journal } from '../lib/types';
import { JournalWriter } from './JournalWriter';
import { Button, Card, cx } from './ui';
import { useToast } from './toast';

const parse = (s: string | null | undefined): Answer[] => {
  try {
    return JSON.parse(s ?? '[]');
  } catch {
    return [];
  }
};

/**
 * Tonight's journal as a short interview: one question at a time (typed or spoken), skip or
 * shuffle any of them, and when you're done the AI writes the day up as a story in your voice.
 */
export function GuidedJournal({ autoStart }: { autoStart?: boolean }) {
  const t = today();
  const toast = useToast();
  const qc = useQueryClient();
  const { data: entries = [], isSuccess: entriesLoaded } = useList<Journal>('journal', { from: addDays(t, -60) });
  const todays = entries.find((e) => e.date === t);
  const { data: facts } = useQuery({ queryKey: ['journal-facts', t], queryFn: () => api<DayFacts>(`/journal/${t}/facts`), staleTime: 5 * 60_000 });
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [i, setI] = useState(0);
  // Writing happens full screen (ask = one question a page, free = a blank page); the card shows the rest.
  const [mode, setMode] = useState<'ask' | 'free' | 'story' | 'idle'>(autoStart ? 'ask' : 'idle');
  const [writing, setWriting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const loaded = useRef(false);
  // From the evening push the journal sits at the bottom of Life on a phone — bring it into view.
  useEffect(() => {
    if (autoStart) setTimeout(() => document.getElementById('journal')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 400);
  }, [autoStart]);
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Load saved answers, or draw tonight's questions once the day's facts and saved entries are in
  // (deciding before the entries arrive would draw fresh questions and hide a story already written).
  useEffect(() => {
    if (loaded.current || !facts || !entriesLoaded) return;
    const saved = parse(todays?.answers);
    loaded.current = true;
    if (saved.length) setAnswers(saved);
    else setAnswers(questionsFor(t, facts).map((q) => ({ q, a: '' })));
    if (todays?.body?.trim() && !autoStart) setMode('story');
  }, [facts, todays, t, autoStart, entriesLoaded]);
  // A story written on another device (phone → laptop) shows up here as soon as it syncs.
  const body = todays?.body?.trim();
  useEffect(() => {
    if (body && mode === 'idle' && !writing) setMode('story');
  }, [body, mode, writing]);

  const persist = (next: Answer[]) => {
    setAnswers(next);
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void api(`/journal/${t}`, { method: 'PUT', body: JSON.stringify({ answers: next }) }), 600);
  };
  const setA = (v: string) => persist(answers.map((x, j) => (j === i ? { ...x, a: v } : x)));
  const shuffle = () => (haptic(8), persist(answers.map((x, j) => (j === i ? { q: anotherQuestion(answers.map((y) => y.q), i, Date.now() % 997), a: '' } : x))));
  const addOne = () => (persist([...answers, { q: anotherQuestion(answers.map((y) => y.q), answers.length, Date.now() % 991), a: '' }]), setI(answers.length));
  const answered = answers.filter((x) => x.a.trim()).length;
  const free = answers.find((x) => x.q === FREE_WRITE);
  const asked = answers.filter((x) => x.q !== FREE_WRITE);
  const openQuestions = () => {
    const firstOpen = asked.find((x) => !x.a.trim()) ?? asked[0];
    setI(Math.max(0, answers.indexOf(firstOpen)));
    setMode('ask');
  };
  const openFree = () => {
    if (free) setI(answers.indexOf(free));
    else (persist([...answers, { q: FREE_WRITE, a: '' }]), setI(answers.length));
    setMode('free');
  };
  const closeWriter = () => {
    clearTimeout(saveTimer.current);
    void api(`/journal/${t}`, { method: 'PUT', body: JSON.stringify({ answers }) });
    setMode(todays?.body?.trim() ? 'story' : 'idle');
    setTimeout(() => document.getElementById('journal')?.scrollIntoView({ behavior: 'instant', block: 'start' }), 50);
  };

  const writeStory = async () => {
    clearTimeout(saveTimer.current);
    await api(`/journal/${t}`, { method: 'PUT', body: JSON.stringify({ answers }) });
    setWriting(true);
    setMode('story');
    setTimeout(() => document.getElementById('journal')?.scrollIntoView({ behavior: 'instant', block: 'start' }), 50);
    try {
      await api<{ body: string }>(`/journal/${t}/story`, { method: 'POST' });
      await qc.invalidateQueries({ queryKey: ['journal'] });
      haptic(20);
    } catch (e) {
      toast({ message: `Couldn't write the story: ${(e as Error).message}` });
      setMode('ask');
    } finally {
      setWriting(false);
    }
  };
  const saveEdit = async () => {
    await api(`/journal/${t}`, { method: 'PUT', body: JSON.stringify({ body: draft }) });
    await qc.invalidateQueries({ queryKey: ['journal'] });
    setEditing(false);
  };

  const cur = answers[i];
  const past = entries.filter((e) => e.date !== t && (e.body?.trim() || parse(e.answers).some((x) => x.a.trim())));
  const shortDate = parseDate(t).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  const dateLabel = parseDate(t).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <Card id="journal" className="min-w-0 scroll-mt-16 lg:col-span-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="flex items-center gap-2 font-display text-[17px]">
          <BookOpen className="size-4 shrink-0 text-pink" /> Journal · {shortDate}
        </p>
        {mode === 'story' && answers.length > 0 && (
          <button onClick={openQuestions} className="shrink-0 text-mini font-bold uppercase text-accent">
            Edit
          </button>
        )}
      </div>

      {(mode === 'idle' || mode === 'ask' || mode === 'free') && (
        <div className="space-y-2">
          <button onClick={openQuestions} className="flex w-full items-center gap-4 rounded-2xl border border-line bg-bg p-4 text-left active:scale-[.99]">
            <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-pink/15 text-pink">
              <Feather className="size-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-bold">{asked.some((x) => x.a.trim()) ? `Continue · ${asked.filter((x) => x.a.trim()).length} of ${asked.length} answered` : `${asked.length} questions about your day`}</span>
              <span className="block truncate text-sm text-ink-3">{asked[0]?.q ?? 'Loading…'}</span>
            </span>
            <ArrowRight className="size-5 shrink-0 text-ink-3" />
          </button>
          <button onClick={openFree} className="flex w-full items-center gap-4 rounded-2xl border border-line bg-bg p-4 text-left active:scale-[.99]">
            <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-surface-2 text-ink-2">
              <PenLine className="size-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-bold">{free?.a.trim() ? 'Keep writing' : 'Free write'}</span>
              <span className="block truncate text-sm text-ink-3">{free?.a.trim() ? free.a.trim() : 'A blank page — dump it, it gets tidied up'}</span>
            </span>
            <ArrowRight className="size-5 shrink-0 text-ink-3" />
          </button>
          {answered > 0 && (
            <Button className="w-full" disabled={writing} onClick={() => void writeStory()}>
              <Sparkles className="size-4" /> Write my story
            </Button>
          )}
        </div>
      )}
      <AnimatePresence>
        {(mode === 'ask' || mode === 'free') && answers[i] && (
          <JournalWriter
            kind={mode === 'free' ? 'free' : 'questions'}
            answers={answers}
            i={i}
            setI={setI}
            dateLabel={dateLabel}
            onChange={setA}
            onShuffle={shuffle}
            onAddOne={addOne}
            onClose={closeWriter}
            onStory={() => void writeStory()}
          />
        )}
      </AnimatePresence>

      {mode === 'story' && (
        <div>
          {writing ? (
            <div className="space-y-2 py-2">
              <p className="flex items-center gap-2 text-sm text-ink-3">
                <Feather className="size-4 animate-pulse text-pink" /> Writing today’s story…
              </p>
              {[90, 100, 75, 95, 60].map((w, j) => (
                <motion.div key={j} className="h-3 rounded bg-surface-2" style={{ width: `${w}%` }} animate={{ opacity: [0.35, 0.8, 0.35] }} transition={{ duration: 1.3, repeat: Infinity, delay: j * 0.1 }} />
              ))}
            </div>
          ) : editing ? (
            <>
              <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={10} className="field w-full resize-none text-[15px] leading-relaxed" />
              <div className="mt-2 flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
                  Cancel
                </Button>
                <Button size="sm" onClick={() => void saveEdit()}>
                  Save
                </Button>
              </div>
            </>
          ) : todays?.body?.trim() ? (
            <>
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="prose-f1 journal-story text-[15px] leading-relaxed" dangerouslySetInnerHTML={{ __html: md(todays.body) }} />
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" variant="ghost" onClick={() => (setDraft(todays.body ?? ''), setEditing(true))}>
                  <Pencil className="size-4" /> Edit
                </Button>
                <Button size="sm" variant="ghost" onClick={() => void writeStory()}>
                  <Sparkles className="size-4" /> Rewrite
                </Button>
                <Button size="sm" variant="ghost" onClick={openFree}>
                  <PenLine className="size-4" /> Write more
                </Button>
              </div>
            </>
          ) : (
            <p className="text-sm text-ink-3">No story yet.</p>
          )}
        </div>
      )}

      {past.length > 0 && (
        <div className="mt-5 space-y-2 border-t border-line pt-4">
          <p className="text-micro font-black uppercase tracking-[0.2em] text-ink-3">Earlier chapters</p>
          {past.slice(0, 10).map((e) => {
            const title = e.body?.match(/^#\s+(.+)$/m)?.[1];
            return (
              <details key={e.id} className="group rounded-2xl bg-surface px-4 py-3">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-sm">
                  <span className="min-w-0 truncate">
                    <span className="font-bold">{relativeDay(e.date)}</span>
                    {title && <span className="text-ink-3"> · {title}</span>}
                  </span>
                  <span className="text-ink-3 transition group-open:rotate-90">›</span>
                </summary>
                {e.body?.trim() ? (
                  <div className="prose-f1 mt-2 text-sm leading-relaxed text-ink-2" dangerouslySetInnerHTML={{ __html: md(e.body) }} />
                ) : (
                  <ul className="mt-2 space-y-2 text-sm">
                    {parse(e.answers)
                      .filter((x) => x.a.trim())
                      .map((x) => (
                        <li key={x.q}>
                          <p className="text-tiny text-ink-3">{x.q}</p>
                          <p className="text-ink-2">{x.a}</p>
                        </li>
                      ))}
                  </ul>
                )}
              </details>
            );
          })}
        </div>
      )}
    </Card>
  );
}
