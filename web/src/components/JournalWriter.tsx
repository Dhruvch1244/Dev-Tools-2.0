import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeft, ArrowRight, Check, Dices, Plus, Sparkles, X } from 'lucide-react';
import { haptic } from '../lib/format';
import { FREE_WRITE, type Answer } from '../core/journal';
import { Mic } from './Mic';
import { cx } from './ui';

/**
 * The journal as a full-screen page: no cards, no tab bar, just the prompt and a big borderless
 * place to write, sized to what's visible above the keyboard. Messy is fine — the story step tidies
 * spelling, order and half-sentences, so nothing here asks you to be neat.
 */
export function JournalWriter({
  kind,
  answers,
  i,
  setI,
  dateLabel,
  onChange,
  onShuffle,
  onAddOne,
  onClose,
  onStory,
}: {
  kind: 'questions' | 'free';
  answers: Answer[];
  i: number;
  setI: (i: number) => void;
  dateLabel: string;
  onChange: (v: string) => void;
  onShuffle: () => void;
  onAddOne: () => void;
  onClose: () => void;
  onStory: () => void;
}) {
  const box = useRef<HTMLTextAreaElement>(null);
  const cur = answers[i];
  const asked = answers.filter((x) => x.q !== FREE_WRITE);
  const pos = asked.indexOf(cur);
  const answered = answers.filter((x) => x.a.trim()).length;
  const words = cur?.a.trim() ? cur.a.trim().split(/\s+/).length : 0;
  const last = kind === 'free' || pos === asked.length - 1;
  const step = (d: number) => {
    const next = asked[pos + d];
    if (next) (haptic(6), setI(answers.indexOf(next)));
  };

  // The page underneath stays put while you write.
  useEffect(() => {
    const html = document.documentElement;
    const prev = html.style.overflow;
    html.style.overflow = 'hidden';
    return () => void (html.style.overflow = prev);
  }, []);
  // Each new prompt puts the cursor straight in the page, at the end of anything already written.
  useEffect(() => {
    const t = box.current;
    if (!t) return;
    t.focus({ preventScroll: true });
    t.setSelectionRange(t.value.length, t.value.length);
  }, [i]);

  if (!cur) return null;
  return createPortal(
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 24 }}
      transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
      className="fixed inset-x-0 z-[90] flex flex-col bg-bg"
      style={{ top: 'var(--vvt, 0px)', height: 'var(--vvh, 100dvh)' }}
      role="dialog"
      aria-label="Journal"
    >
      <header className="flex items-center gap-3 px-4 pb-2 pt-[calc(env(safe-area-inset-top)+10px)]">
        <button onClick={onClose} aria-label="Close" className="grid size-10 place-items-center rounded-xl bg-surface text-ink-2">
          <X className="size-5" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-micro font-black uppercase tracking-[0.2em] text-pink">{kind === 'free' ? 'Free write' : `Question ${pos + 1} of ${asked.length}`}</p>
          <p className="truncate text-tiny text-ink-3">{dateLabel} · saved as you type</p>
        </div>
        {answered > 0 && (
          <button onClick={onStory} className="flex h-10 items-center gap-1.5 rounded-xl bg-accent px-3 text-mini font-bold uppercase text-white">
            <Sparkles className="size-4" /> Story
          </button>
        )}
      </header>
      {kind === 'questions' && (
        <div className="flex gap-1 px-4">
          {asked.map((x, j) => (
            <button key={j} onClick={() => setI(answers.indexOf(x))} aria-label={`Question ${j + 1}`} className={cx('h-1 flex-1 -skew-x-12 transition', j === pos ? 'bg-pink' : x.a.trim() ? 'bg-pink/50' : 'bg-surface-2')} />
          ))}
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col px-5 pt-5">
        <AnimatePresence mode="wait" initial={false}>
          <motion.p key={`${i}:${cur.q}`} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.18 }} className="text-[22px] font-bold leading-snug">
            {kind === 'free' ? 'What’s on your mind?' : cur.q}
          </motion.p>
        </AnimatePresence>
        <textarea
          ref={box}
          value={cur.a}
          onChange={(e) => onChange(e.target.value)}
          placeholder={kind === 'free' ? 'Just dump it here — any order, typos, Hinglish, half sentences. It gets turned into a proper entry for you.' : 'Write it however it comes out. No need to be neat — the story tidies it up.'}
          className="mt-4 min-h-0 w-full flex-1 resize-none bg-transparent text-[18px] leading-relaxed text-ink outline-none placeholder:text-ink-3/70"
          autoCapitalize="sentences"
          spellCheck
        />
      </div>

      <footer className="flex items-center gap-2 border-t border-line px-3 pt-2 pb-[max(10px,env(safe-area-inset-bottom))] [html[data-kb]_&]:pb-2">
        {kind === 'questions' && (
          <>
            <button onClick={() => step(-1)} disabled={pos === 0} aria-label="Previous question" className="grid size-11 place-items-center rounded-xl bg-surface text-ink-2 disabled:opacity-30">
              <ArrowLeft className="size-5" />
            </button>
            <button onClick={onShuffle} aria-label="Different question" className="grid size-11 place-items-center rounded-xl bg-surface text-ink-2">
              <Dices className="size-5" />
            </button>
          </>
        )}
        <Mic value={cur.a} onChange={onChange} />
        <span className="flex-1 text-center text-tiny tabular-nums text-ink-3">{words ? `${words} word${words > 1 ? 's' : ''}` : ''}</span>
        {kind === 'questions' && !last ? (
          <button onClick={() => step(1)} className="flex h-11 items-center gap-1.5 rounded-xl bg-ink px-4 text-mini font-bold uppercase text-bg">
            {cur.a.trim() ? 'Next' : 'Skip'} <ArrowRight className="size-4" />
          </button>
        ) : kind === 'questions' ? (
          <button onClick={onAddOne} className="flex h-11 items-center gap-1.5 rounded-xl bg-surface px-4 text-mini font-bold uppercase text-ink-2">
            <Plus className="size-4" /> One more
          </button>
        ) : (
          <button onClick={onClose} className="flex h-11 items-center gap-1.5 rounded-xl bg-ink px-4 text-mini font-bold uppercase text-bg">
            <Check className="size-4" /> Done
          </button>
        )}
      </footer>
    </motion.div>,
    document.body,
  );
}
