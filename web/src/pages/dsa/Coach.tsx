import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { BookmarkPlus, Bug, Lightbulb, Radio, Send, Square, Telescope } from 'lucide-react';
import { md } from '../../lib/dsa';
import { streamCoach } from '../../lib/coach';
import type { Lang } from '../../core/dsa/vizCode';
import { Button, cx } from '../../components/ui';

export type JudgeSummary = { passed: number; total: number; compileError?: string; failing?: { input: string[]; expected?: string; output?: string } | null; stderr?: string };
type Msg = { role: 'user' | 'coach'; text: string; label?: string; error?: boolean };

/** "Pit radio": hints, debugging, review and notes from the local Claude Code CLI. */
export function CoachPanel({ slug, title, lang, code, judge, locked, onSaveToNotes }: { slug: string; title: string; lang: Lang; code: string; judge: JudgeSummary | null; locked: boolean; onSaveToNotes: (text: string) => void }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [busy, setBusy] = useState(false);
  const [hintLevel, setHintLevel] = useState(1);
  const [input, setInput] = useState('');
  const ctl = useRef<AbortController | null>(null);
  const end = useRef<HTMLDivElement>(null);
  // Braces matter: scrollIntoView returns a Promise in current Chrome, and an effect must not return one.
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [msgs]);
  useEffect(() => () => ctl.current?.abort(), []);

  const send = async (mode: 'hint' | 'debug' | 'review' | 'explain' | 'chat', label: string, message?: string) => {
    if (busy) return;
    const history = msgs.filter((m) => !m.error).map(({ role, text }) => ({ role, text }));
    setMsgs((m) => [...m, { role: 'user', text: message ?? label, label }, { role: 'coach', text: '' }]);
    setBusy(true);
    ctl.current = new AbortController();
    try {
      await streamCoach('dsa', { mode, level: hintLevel, slug, title, lang, code, judge: judge ?? undefined, message, history }, (t) => setMsgs((m) => m.map((x, i) => (i === m.length - 1 ? { ...x, text: x.text + t } : x))), ctl.current.signal);
      if (mode === 'hint') setHintLevel((l) => Math.min(3, l + 1));
    } catch (e) {
      const msg = (e as Error).name === 'AbortError' ? 'Stopped.' : (e as Error).message;
      setMsgs((m) => m.map((x, i) => (i === m.length - 1 ? { ...x, text: x.text || msg, error: !x.text } : x)));
    } finally {
      setBusy(false);
    }
  };

  if (locked)
    return (
      <div className="flex flex-col items-center gap-2 py-10 text-center">
        <Radio className="size-8 text-ink-3" />
        <p className="text-lg font-black italic uppercase">Radio silence</p>
        <p className="max-w-xs text-sm text-ink-3">A test or mock interview is running — the pit wall can't talk to you until you take the flag.</p>
      </div>
    );

  const failing = judge && (judge.compileError || judge.passed < judge.total);
  return (
    <div className="flex flex-col">
      <div className="mb-3 grid grid-cols-2 gap-2">
        <Button variant="soft" disabled={busy} onClick={() => void send('hint', `Hint ${hintLevel}/3`)}>
          <Lightbulb className="size-4" /> Hint {hintLevel}/3
        </Button>
        <Button variant={failing ? 'primary' : 'soft'} disabled={busy || !failing} onClick={() => void send('debug', 'Why is it failing?')} title={failing ? '' : 'Run the examples first — this uses the failing case'}>
          <Bug className="size-4" /> Why failing?
        </Button>
        <Button variant="soft" disabled={busy || !code.trim()} onClick={() => void send('review', 'Review my solution')}>
          <Telescope className="size-4" /> Review
        </Button>
        <Button variant="soft" disabled={busy || !code.trim()} onClick={() => void send('explain', 'Explain for my notes')}>
          <BookmarkPlus className="size-4" /> Notes draft
        </Button>
      </div>
      <div className="max-h-[52vh] min-h-24 space-y-3 overflow-y-auto pr-1">
        {msgs.length === 0 && <p className="py-6 text-center text-sm text-ink-3">Pit radio sees the statement, your code and the last judge run. Hints come in three levels — try solving between each.</p>}
        <AnimatePresence initial={false}>
          {msgs.map((m, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className={cx(m.role === 'user' ? 'ml-8 text-right' : 'mr-2')}>
              {m.role === 'user' ? (
                <span className="slant inline-block bg-surface-2 px-3 py-1 text-[12px] font-bold">{m.label ?? m.text}</span>
              ) : (
                <div className={cx('rounded-lg border-l-[3px] bg-bg px-3 py-2', m.error ? 'border-warn' : 'border-accent')}>
                  <p className="mb-1 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-accent-2">
                    <Radio className={cx('size-3', busy && i === msgs.length - 1 && 'animate-pulse')} /> Pit radio
                  </p>
                  {m.text ? <div className="prose-f1 text-[14px]" dangerouslySetInnerHTML={{ __html: md(m.text) }} /> : <span className="cursor-blink inline-block h-4 w-2 bg-accent" />}
                  {!busy && m.text && !m.error && msgs[i - 1]?.label === 'Explain for my notes' && (
                    <Button size="sm" variant="ghost" className="mt-2" onClick={() => onSaveToNotes(m.text)}>
                      <BookmarkPlus className="size-4" /> Add to my notes
                    </Button>
                  )}
                </div>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
        <div ref={end} />
      </div>
      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!input.trim()) return;
          void send('chat', input.trim(), input.trim());
          setInput('');
        }}
      >
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask anything about this problem…" className="field min-w-0 flex-1" />
        {busy ? (
          <Button type="button" variant="danger" onClick={() => ctl.current?.abort()}>
            <Square className="size-4 fill-current" />
          </Button>
        ) : (
          <Button type="submit" disabled={!input.trim()}>
            <Send className="size-4" />
          </Button>
        )}
      </form>
      <p className="mt-2 text-[10px] text-ink-3">Runs on this laptop through your Claude Code login (no API key) · tools disabled — it only reads what's shown here.</p>
    </div>
  );
}
