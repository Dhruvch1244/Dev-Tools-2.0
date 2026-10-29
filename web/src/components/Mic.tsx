import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { Mic as MicIcon, MicOff } from 'lucide-react';
import { haptic } from '../lib/format';
import { cx } from './ui';
import { useToast } from './toast';

type Rec = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};
const Recognition = (): (new () => Rec) | undefined => (window as unknown as { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec }).SpeechRecognition ?? (window as unknown as { webkitSpeechRecognition?: new () => Rec }).webkitSpeechRecognition;

/**
 * Hold-free dictation: tap to talk, tap again (or pause) to stop. Text streams into the field as you
 * speak (Indian English). Where the browser has no speech API — some iOS home-screen apps — it says
 * to use the keyboard's own mic instead.
 */
export function Mic({ value, onChange, className, onFinal }: { value: string; onChange: (v: string) => void; className?: string; onFinal?: (v: string) => void }) {
  const toast = useToast();
  const [on, setOn] = useState(false);
  const rec = useRef<Rec | null>(null);
  const base = useRef('');
  const latest = useRef(value);
  latest.current = value;
  useEffect(() => () => rec.current?.stop(), []);

  const start = () => {
    const R = Recognition();
    if (!R) return toast({ message: 'Voice isn’t available here — tap the 🎤 on your keyboard instead' });
    const r = new R();
    r.lang = 'en-IN';
    r.interimResults = true;
    r.continuous = false;
    base.current = latest.current ? `${latest.current.trimEnd()} ` : '';
    r.onresult = (e) => {
      let text = '';
      for (let i = 0; i < e.results.length; i++) text += e.results[i][0].transcript;
      onChange(base.current + text);
    };
    r.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') toast({ message: 'Microphone blocked — allow it in Settings, or use the keyboard mic' });
      else if (e.error !== 'no-speech' && e.error !== 'aborted') toast({ message: `Voice error: ${e.error}` });
    };
    r.onend = () => {
      setOn(false);
      if (latest.current.trim()) onFinal?.(latest.current);
    };
    rec.current = r;
    try {
      r.start();
      setOn(true);
      haptic(15);
    } catch {
      toast({ message: 'Couldn’t start the mic — try again' });
    }
  };

  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.88 }}
      onClick={() => (on ? rec.current?.stop() : start())}
      aria-label={on ? 'Stop listening' : 'Speak'}
      aria-pressed={on}
      className={cx('relative grid size-11 shrink-0 place-items-center rounded-xl', on ? 'bg-accent text-white' : 'bg-surface-2 text-ink-2', className)}
    >
      {on && <motion.span className="absolute inset-0 rounded-xl bg-accent" animate={{ opacity: [0.6, 0], scale: [1, 1.5] }} transition={{ duration: 1.1, repeat: Infinity }} />}
      {on ? <MicOff className="relative size-5" /> : <MicIcon className="size-5" />}
    </motion.button>
  );
}
