import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowUp, Radio, RotateCcw, Square } from 'lucide-react';
import { streamCoach } from '../lib/coach';
import { md } from '../lib/dsa';
import { haptic } from '../lib/format';
import { normaliseActions, splitActions } from '../core/aiActions';
import { ActionCards } from '../components/AiActions';
import { Page, PageHeader, Rise, cx } from '../components/ui';

type Msg = { role: 'user' | 'assistant'; text: string; error?: boolean };
const KEY = 'pitwall:v1';
const load = (): Msg[] => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]');
  } catch {
    return [];
  }
};
const store = (m: Msg[]) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(m.slice(-40)));
  } catch {}
};

/** Starter prompts, grouped by what the assistant is good at. */
const STARTERS = [
  { k: 'Plan', items: ['Plan the rest of my day', 'Plan my office week — when do I gym and do DSA?', 'I have 30 free minutes, what should I do?'] },
  { k: 'Remind', items: ['Remind me to pay rent on the 5th every month', 'Mom’s birthday is 14 March — remind me a day before', 'I’m on leave next Friday'] },
  { k: 'Fuel', items: ['What should I eat for dinner to hit protein?', 'Pack a high-protein office lunch for tomorrow', 'Am I getting enough B12 and iron?'] },
  { k: 'Debrief', items: ['How is my week going?', 'What am I neglecting lately?', 'Write my journal summary for today'] },
];

export function PitWallPage() {
  const [msgs, setMsgs] = useState<Msg[]>(load);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const ctl = useRef<AbortController | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const [params, setParams] = useSearchParams();

  useEffect(() => store(msgs), [msgs]);
  useEffect(() => end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }), [msgs.length, busy]);

  const send = async (text: string) => {
    const message = text.trim();
    if (!message || busy) return;
    haptic(8);
    const history = msgs.filter((m) => !m.error).map(({ role, text }) => ({ role, text: splitActions(text).text }));
    setMsgs((m) => [...m, { role: 'user', text: message }, { role: 'assistant', text: '' }]);
    setInput('');
    setBusy(true);
    ctl.current = new AbortController();
    const patchLast = (fn: (m: Msg) => Msg) => setMsgs((all) => [...all.slice(0, -1), fn(all[all.length - 1])]);
    try {
      await streamCoach('chat', { message, history }, (d) => patchLast((m) => ({ ...m, text: m.text + d })), ctl.current.signal);
    } catch (e) {
      if ((e as Error).name !== 'AbortError') patchLast((m) => ({ ...m, error: true, text: m.text || ((e as Error).message.includes('fetch') ? 'No radio — the AI runs on your laptop. Try again when it’s reachable.' : (e as Error).message) }));
    } finally {
      setBusy(false);
    }
  };

  // ?q=… (from the Today page / shortcuts) asks straight away.
  useEffect(() => {
    const q = params.get('q');
    if (q) {
      setParams({}, { replace: true });
      void send(q);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Page>
      <PageHeader
        eyebrow="AI race engineer · sees your day"
        title={
          <span className="flex items-center gap-3">
            <Radio className="size-8 text-accent" /> Pit Wall
          </span>
        }
        action={
          msgs.length > 0 && (
            <button onClick={() => (ctl.current?.abort(), setMsgs([]))} className="flex h-9 items-center gap-1.5 rounded-md border border-line px-3 text-mini font-bold uppercase text-ink-2">
              <RotateCcw className="size-3.5" /> New chat
            </button>
          )
        }
      />

      {msgs.length === 0 && (
        <Rise className="grid gap-3 sm:grid-cols-2">
          {STARTERS.map((g) => (
            <div key={g.k} className="rounded-xl border border-line bg-surface p-3">
              <p className="mb-2 text-micro font-black uppercase tracking-[0.25em] text-ink-3">{g.k}</p>
              <div className="flex flex-col gap-1.5">
                {g.items.map((s) => (
                  <button key={s} onClick={() => void send(s)} className="rounded-lg bg-bg px-3 py-2.5 text-left text-sm text-ink-2 transition hover:text-ink active:scale-[.98]">
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ))}
          <p className="text-tiny text-ink-3 sm:col-span-2">
            Runs through the Claude CLI on your laptop. It reads a snapshot of today — office shift, gym, food, tasks, routines, calendar — and proposes reminders as cards. Nothing is saved until you tap Add.
          </p>
        </Rise>
      )}

      <div className="space-y-4">
        <AnimatePresence initial={false}>
          {msgs.map((m, i) => {
            const { text, raw } = m.role === 'assistant' ? splitActions(m.text) : { text: m.text, raw: null };
            const last = i === msgs.length - 1;
            return (
              <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className={cx('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
                {m.role === 'user' ? (
                  <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-accent px-4 py-2.5 text-white">{m.text}</p>
                ) : (
                  <div className={cx('w-full max-w-[95%] rounded-2xl rounded-bl-sm border bg-surface px-4 py-3', m.error ? 'border-accent/50' : 'border-line')}>
                    <p className="mb-1 flex items-center gap-1.5 text-micro font-black uppercase tracking-[0.25em] text-accent">
                      <Radio className="size-3" /> Pit Wall
                    </p>
                    {text ? (
                      <div className="prose-f1 text-[15px]" dangerouslySetInnerHTML={{ __html: md(text) }} />
                    ) : (
                      <motion.p className="text-sm text-ink-3" animate={{ opacity: [0.4, 1, 0.4] }} transition={{ repeat: Infinity, duration: 1.4 }}>
                        Copy, checking the data…
                      </motion.p>
                    )}
                    {raw && !(busy && last) && <ActionCards actions={normaliseActions(raw)} />}
                  </div>
                )}
              </motion.div>
            );
          })}
        </AnimatePresence>
        <div ref={end} />
      </div>

      <form
        onSubmit={(e) => (e.preventDefault(), void send(input))}
        className="chat-dock sticky z-20 mt-6 flex items-end gap-2 rounded-2xl border border-line bg-surface/95 p-2 shadow-[0_10px_40px_-10px_rgba(0,0,0,.8)] backdrop-blur lg:bottom-6"
      >
        <textarea
          rows={1}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && (e.preventDefault(), void send(input))}
          placeholder="Ask, plan, or “remind me…”"
          enterKeyHint="send"
          className="max-h-32 min-h-11 flex-1 resize-none bg-transparent px-2 py-2.5 text-base outline-none placeholder:text-ink-3"
        />
        <motion.button
          type={busy ? 'button' : 'submit'}
          whileTap={{ scale: 0.9 }}
          onClick={busy ? () => ctl.current?.abort() : undefined}
          disabled={!busy && !input.trim()}
          aria-label={busy ? 'Stop' : 'Send'}
          className="grid size-11 shrink-0 place-items-center rounded-xl bg-accent text-white disabled:opacity-40"
        >
          {busy ? <Square className="size-4" fill="currentColor" /> : <ArrowUp className="size-5" />}
        </motion.button>
      </form>
    </Page>
  );
}
