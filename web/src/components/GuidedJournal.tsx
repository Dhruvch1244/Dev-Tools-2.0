import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, BookOpen, Dices, Feather, Pencil, Plus, Sparkles } from 'lucide-react';
import { api, useList } from '../lib/api';
import { addDays, haptic, parseDate, relativeDay, today } from '../lib/format';
import { md } from '../lib/dsa';
import { anotherQuestion, questionsFor, type Answer, type DayFacts } from '../core/journal';
import type { Journal } from '../lib/types';
import { Mic } from './Mic';
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
  const { data: entries = [] } = useList<Journal>('journal', { from: addDays(t, -60) });
  const todays = entries.find((e) => e.date === t);
  const { data: facts } = useQuery({ queryKey: ['journal-facts', t], queryFn: () => api<DayFacts>(`/journal/${t}/facts`), staleTime: 5 * 60_000 });
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [i, setI] = useState(0);
  const [mode, setMode] = useState<'ask' | 'story' | 'idle'>(autoStart ? 'ask' : 'idle');
  const [writing, setWriting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const loaded = useRef(false);
  // From the evening push the journal sits at the bottom of Life on a phone — bring it into view.
  useEffect(() => {
    if (autoStart) setTimeout(() => document.getElementById('journal')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 400);
  }, [autoStart]);
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Load saved answers, or draw tonight's questions once the day's facts are in.
  useEffect(() => {
    if (loaded.current || !facts) return;
    const saved = parse(todays?.answers);
    loaded.current = true;
    if (saved.length) setAnswers(saved);
    else setAnswers(questionsFor(t, facts).map((q) => ({ q, a: '' })));
    if (todays?.body?.trim() && !autoStart) setMode('story');
  }, [facts, todays, t, autoStart]);

  const persist = (next: Answer[]) => {
    setAnswers(next);
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void api(`/journal/${t}`, { method: 'PUT', body: JSON.stringify({ answers: next }) }), 600);
  };
  const setA = (v: string) => persist(answers.map((x, j) => (j === i ? { ...x, a: v } : x)));
  const shuffle = () => (haptic(8), persist(answers.map((x, j) => (j === i ? { q: anotherQuestion(answers.map((y) => y.q), i, Date.now() % 997), a: '' } : x))));
  const addOne = () => (persist([...answers, { q: anotherQuestion(answers.map((y) => y.q), answers.length, Date.now() % 991), a: '' }]), setI(answers.length));
  const answered = answers.filter((x) => x.a.trim()).length;

  const writeStory = async () => {
    clearTimeout(saveTimer.current);
    await api(`/journal/${t}`, { method: 'PUT', body: JSON.stringify({ answers }) });
    setWriting(true);
    setMode('story');
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
  const dateLabel = parseDate(t).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <Card id="journal" className="min-w-0 scroll-mt-16 lg:col-span-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="flex items-center gap-2 font-display text-[17px]">
          <BookOpen className="size-4 text-pink" /> Journal · {dateLabel}
        </p>
        {mode !== 'ask' && answers.length > 0 && (
          <button onClick={() => setMode('ask')} className="text-mini font-bold uppercase text-accent">
            {answered ? 'Edit answers' : 'Start'}
          </button>
        )}
      </div>

      {mode === 'idle' && (
        <button onClick={() => setMode('ask')} className="flex w-full items-center gap-4 rounded-2xl border border-line bg-bg p-4 text-left">
          <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-pink/15 text-pink">
            <Feather className="size-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-bold">{answers.length} questions about your day</span>
            <span className="block truncate text-sm text-ink-3">{answers[0]?.q ?? 'Loading…'}</span>
          </span>
          <ArrowRight className="size-5 text-ink-3" />
        </button>
      )}

      {mode === 'ask' && cur && (
        <div>
          <div className="mb-3 flex gap-1">
            {answers.map((x, j) => (
              <button key={j} onClick={() => setI(j)} aria-label={`Question ${j + 1}`} className={cx('h-1.5 flex-1 -skew-x-12 transition', j === i ? 'bg-pink' : x.a.trim() ? 'bg-pink/50' : 'bg-surface-2')} />
            ))}
          </div>
          <AnimatePresence mode="wait">
            <motion.div key={`${i}:${cur.q}`} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.2 }}>
              <p className="text-micro font-black uppercase tracking-[0.2em] text-ink-3">
                Question {i + 1} of {answers.length}
              </p>
              <p className="mt-1 text-xl font-bold leading-snug">{cur.q}</p>
            </motion.div>
          </AnimatePresence>
          <div className="mt-3 flex items-end gap-2">
            <textarea value={cur.a} onChange={(e) => setA(e.target.value)} rows={4} placeholder="Say it however it comes out — the story gets written for you." className="field min-h-28 flex-1 resize-none text-base leading-relaxed" />
            <Mic value={cur.a} onChange={setA} />
          </div>
          <div className="mt-3 flex items-center gap-2">
            <Button variant="ghost" size="sm" disabled={i === 0} onClick={() => setI(i - 1)} aria-label="Previous question">
              <ArrowLeft className="size-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={shuffle}>
              <Dices className="size-4" /> Different question
            </Button>
            <span className="flex-1" />
            {i < answers.length - 1 ? (
              <Button size="sm" onClick={() => setI(i + 1)}>
                {cur.a.trim() ? 'Next' : 'Skip'} <ArrowRight className="size-4" />
              </Button>
            ) : (
              <Button size="sm" variant="soft" onClick={addOne}>
                <Plus className="size-4" /> One more
              </Button>
            )}
          </div>
          <Button className="mt-3 w-full" disabled={!answered || writing} onClick={() => void writeStory()}>
            <Sparkles className="size-4" /> {answered ? `Write my story (${answered} answer${answered > 1 ? 's' : ''})` : 'Answer one to write your story'}
          </Button>
        </div>
      )}

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
