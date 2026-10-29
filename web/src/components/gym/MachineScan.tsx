import { useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { BookOpen, Camera, CircleAlert, ImagePlus, ListChecks, Settings2, ShieldAlert } from 'lucide-react';
import type { Machine } from '../../core/gymAi';
import type { Region } from '../../core/gymStats';
import { BodyMap } from '../BodyMap';
import { shrink } from '../AiSnap';
import { Button, Sheet, Textarea } from '../ui';

const LINES = ['Looking at the machine…', 'Working out what it trains…', 'Writing setup steps…'];

/** Photo of a machine → what it is, what it trains, how to set it up and use it safely. */
export function MachineScan({ open, onClose, onGuide }: { open: boolean; onClose: () => void; onGuide: (name: string) => void }) {
  const cam = useRef<HTMLInputElement>(null);
  const lib = useRef<HTMLInputElement>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [line, setLine] = useState(0);
  const [res, setRes] = useState<Machine | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const pick = async (f?: File) => {
    if (!f) return;
    setRes(null);
    setErr(null);
    setPhoto(await shrink(f));
  };
  const go = async () => {
    setBusy(true);
    setErr(null);
    const id = setInterval(() => setLine((l) => (l + 1) % LINES.length), 1600);
    try {
      const r = await fetch('/api/gym/machine', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ image: photo ?? undefined, text }) });
      const j = await r.json().catch(() => ({ error: `AI unavailable (${r.status})` }));
      if (!r.ok) throw new Error(j.error ?? 'AI unavailable');
      setRes(j);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      clearInterval(id);
      setBusy(false);
    }
  };
  const close = () => (onClose(), setTimeout(() => (setPhoto(null), setRes(null), setText(''), setErr(null)), 300));
  const heat: Partial<Record<Region, number>> = res ? { ...Object.fromEntries(res.secondary.map((m) => [m, 0.45])), ...Object.fromEntries(res.primary.map((m) => [m, 1])) } : {};

  return (
    <Sheet open={open} onClose={close} title="How do I use this?">
      <input ref={cam} type="file" accept="image/*" capture="environment" hidden onChange={(e) => void pick(e.target.files?.[0])} />
      <input ref={lib} type="file" accept="image/*" hidden onChange={(e) => void pick(e.target.files?.[0])} />
      {!res && (
        <div className="space-y-3">
          {photo ? (
            <div className="relative overflow-hidden rounded-xl border border-line">
              <img src={photo} alt="Machine" className="max-h-72 w-full object-cover" />
              {busy && (
                <motion.div className="absolute inset-x-0 h-1 bg-accent shadow-[0_0_24px_var(--accent)]" initial={{ top: 0 }} animate={{ top: ['0%', '100%', '0%'] }} transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }} />
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => cam.current?.click()} className="flex h-32 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-line-strong bg-bg text-ink-2">
                <Camera className="size-7 text-accent" /> <span className="text-mini font-bold uppercase">Take photo</span>
              </button>
              <button onClick={() => lib.current?.click()} className="flex h-32 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-line-strong bg-bg text-ink-2">
                <ImagePlus className="size-7" /> <span className="text-mini font-bold uppercase">From photos</span>
              </button>
            </div>
          )}
          <Textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="Optional: “it’s for legs I think”, or describe it if there’s no photo" />
          <Button className="h-12 w-full" disabled={busy || (!photo && !text.trim())} onClick={() => void go()}>
            {busy ? LINES[line] : 'Explain this machine'}
          </Button>
          {err && <p className="text-sm text-accent">{err}</p>}
        </div>
      )}
      <AnimatePresence>
        {res && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
            <div className="flex items-start gap-3">
              {photo && <img src={photo} alt="" className="size-16 shrink-0 rounded-lg object-cover" />}
              <div className="min-w-0">
                <p className="text-2xl font-black italic uppercase leading-tight">{res.machine}</p>
                {res.aka && <p className="text-sm text-ink-3">{res.aka}</p>}
                {res.confidence === 'low' && <p className="text-tiny text-amber">Not sure from the photo — check the label on the machine.</p>}
              </div>
            </div>
            {(res.primary.length > 0 || res.secondary.length > 0) && (
              <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-center gap-3">
                <BodyMap heat={heat} pulse className="h-44" />
                <div className="text-sm">
                  <p className="text-micro font-black uppercase tracking-[0.2em] text-accent">Trains</p>
                  <p>{res.primary.join(', ')}</p>
                  {res.secondary.length > 0 && <p className="mt-1 text-ink-3">+ {res.secondary.join(', ')}</p>}
                </div>
              </div>
            )}
            {[
              ['Set up', Settings2, res.setup, 'text-ink-2'],
              ['How to', ListChecks, res.steps, 'text-ink'],
              ['Avoid', CircleAlert, res.mistakes, 'text-accent-2'],
            ].map(([title, Icon, items, tone]) =>
              (items as string[]).length ? (
                <section key={title as string}>
                  <p className="mb-1.5 flex items-center gap-1.5 text-micro font-black uppercase tracking-[0.2em] text-ink-3">
                    {(() => {
                      const I = Icon as typeof Settings2;
                      return <I className="size-3.5" />;
                    })()}{' '}
                    {title as string}
                  </p>
                  <ol className="space-y-1">
                    {(items as string[]).map((x, i) => (
                      <li key={x} className={`flex gap-2 text-sm ${tone as string}`}>
                        <span className="w-4 shrink-0 font-mono text-ink-3">{i + 1}</span>
                        {x}
                      </li>
                    ))}
                  </ol>
                </section>
              ) : null,
            )}
            {res.safety && (
              <p className="flex gap-2 rounded-lg bg-amber/10 p-3 text-sm text-amber">
                <ShieldAlert className="mt-0.5 size-4 shrink-0" /> {res.safety}
              </p>
            )}
            {res.exercises.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {res.exercises.map((n) => (
                  <Button key={n} size="sm" variant="soft" onClick={() => onGuide(n)}>
                    <BookOpen className="size-4" /> {n} guide
                  </Button>
                ))}
              </div>
            )}
            <Button variant="ghost" className="w-full" onClick={() => (setRes(null), setPhoto(null), setText(''))}>
              <Camera className="size-4" /> Scan another
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </Sheet>
  );
}
