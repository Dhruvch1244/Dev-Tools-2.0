import { useEffect, useRef, useState } from 'react';
import { ArrowUp, Briefcase, Loader2, RotateCcw, Square } from 'lucide-react';
import { streamCoach } from '../lib/coach';
import { md } from '../lib/dsa';
import { haptic } from '../lib/format';
import { Mic } from './Mic';
import { Card, SectionTitle, cx } from './ui';

type Msg = { role: 'user' | 'assistant'; text: string; error?: boolean };
const KEY = 'money-advisor:v1';
const load = (): Msg[] => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]');
  } catch {
    return [];
  }
};

const STARTERS = [
  'Where is my money leaking this month?',
  'How big should my emergency fund be, and am I there?',
  'Review my portfolio — allocation, risk, what to change',
  'Old vs new tax regime for me, and how to save tax this year',
  'I have ₹50,000 spare this month — what should I do with it?',
  'Set me a monthly budget from my last 3 months',
];

/**
 * The money advisor: a chat that reads your spending, budgets, subscriptions, IOUs and live
 * portfolio. Paste anything into it — a bank SMS, a WhatsApp chat about splitting rent, an offer
 * letter, a credit-card statement — and ask about it.
 */
export function MoneyAdvisor() {
  const [msgs, setMsgs] = useState<Msg[]>(load);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const ctl = useRef<AbortController | null>(null);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(msgs.slice(-30)));
    } catch {}
  }, [msgs]);
  useEffect(() => end.current?.scrollIntoView({ block: 'nearest' }), [msgs.length]);

  const send = async (text: string) => {
    const message = text.trim();
    if (!message || busy) return;
    haptic(8);
    const history = msgs.filter((m) => !m.error).map(({ role, text }) => ({ role, text }));
    setMsgs((m) => [...m, { role: 'user', text: message }, { role: 'assistant', text: '' }]);
    setInput('');
    setBusy(true);
    ctl.current = new AbortController();
    const patchLast = (fn: (m: Msg) => Msg) => setMsgs((all) => [...all.slice(0, -1), fn(all[all.length - 1])]);
    try {
      await streamCoach('/money/advisor', { message, history }, (d) => patchLast((m) => ({ ...m, text: m.text + d })), ctl.current.signal);
    } catch (e) {
      if ((e as Error).name !== 'AbortError') patchLast((m) => ({ ...m, error: true, text: m.text || (e as Error).message }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <SectionTitle
        action={
          msgs.length > 0 && (
            <button onClick={() => (ctl.current?.abort(), setMsgs([]))} className="flex items-center gap-1 text-mini font-bold uppercase text-ink-3">
              <RotateCcw className="size-3.5" /> New
            </button>
          )
        }
      >
        <span className="flex items-center gap-2">
          <Briefcase className="size-4 text-green" /> Money advisor
        </span>
      </SectionTitle>
      {msgs.length === 0 ? (
        <div className="space-y-1.5">
          <p className="mb-2 text-sm text-ink-2">It sees your spending, budgets, subscriptions, who owes you and your live portfolio. Paste a bank SMS, a chat, a statement or an offer and ask about it.</p>
          {STARTERS.map((s) => (
            <button key={s} onClick={() => void send(s)} className="block w-full rounded-md bg-bg px-3 py-2.5 text-left text-sm text-ink-2 active:scale-[.98]">
              {s}
            </button>
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {msgs.map((m, i) =>
            m.role === 'user' ? (
              <p key={i} className="ml-8 whitespace-pre-wrap rounded-lg bg-accent-soft px-3 py-2 text-sm">
                {m.text.length > 600 ? `${m.text.slice(0, 600)}… (${m.text.length.toLocaleString()} chars pasted)` : m.text}
              </p>
            ) : (
              <div key={i} className={cx('prose-f1 text-sm leading-relaxed', m.error && 'text-danger')}>
                {m.text ? <div dangerouslySetInnerHTML={{ __html: md(m.text) }} /> : <Loader2 className="size-4 animate-spin text-ink-3" />}
              </div>
            ),
          )}
          <div ref={end} />
        </div>
      )}
      <form onSubmit={(e) => (e.preventDefault(), void send(input))} className="mt-3 flex items-end gap-2">
        <textarea
          rows={input.length > 80 ? 4 : 1}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && input.length < 200 && (e.preventDefault(), void send(input))}
          placeholder="Ask, or paste anything…"
          className="field min-h-11 flex-1 resize-none text-base"
        />
        <Mic value={input} onChange={setInput} />
        {busy ? (
          <button type="button" onClick={() => ctl.current?.abort()} aria-label="Stop" className="grid size-11 shrink-0 place-items-center rounded-md bg-surface-2 text-ink">
            <Square className="size-4" />
          </button>
        ) : (
          <button type="submit" disabled={!input.trim()} aria-label="Send" className="grid size-11 shrink-0 place-items-center rounded-md bg-accent text-white disabled:opacity-40">
            <ArrowUp className="size-5" />
          </button>
        )}
      </form>
      <p className="mt-2 text-micro text-ink-3">Runs on your laptop through the Claude CLI. General guidance, not licensed financial advice.</p>
    </Card>
  );
}
