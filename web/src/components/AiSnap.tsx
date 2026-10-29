import { useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Camera, ImagePlus, Minus, Plus, Sparkles, Trash2, TriangleAlert, X, Zap } from 'lucide-react';
import { useResource, useSettings } from '../lib/api';
import { MEALS } from '../core/fuel';
import { rescale, type AiItem, type AiResult } from '../core/aiFood';
import type { Diet } from '../core/foods';
import type { FoodLog } from '../lib/types';
import { haptic } from '../lib/format';
import { Button, Textarea, cx } from './ui';
import { useToast } from './toast';

/** Downscale on the phone before upload: a 12 MP photo becomes ~150 KB, plenty for the model. */
async function shrink(file: File, max = 1280): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, fail) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => fail(new Error("Couldn't read that photo"));
      i.src = url;
    });
    const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * k);
    c.height = Math.round(img.naturalHeight * k);
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.82);
  } finally {
    URL.revokeObjectURL(url);
  }
}

const CONF = { high: 'text-green', medium: 'text-yellow', low: 'text-accent-2' } as const;
const LINES = ['Reading the plate…', 'Matching to your food table…', 'Sizing up portions…', 'Crunching macros & micros…'];

/** Photo and/or description → Claude identifies the food → review and adjust → log. */
export function AiSnap({ date, meal, onMealChange, onDone }: { date: string; meal: string; onMealChange?: (m: string) => void; onDone?: () => void }) {
  const { settings } = useSettings();
  const diet: Diet = settings.diet ?? 'veg';
  const { create } = useResource<FoodLog>('food_logs');
  const toast = useToast();
  const camera = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [line, setLine] = useState(0);
  const [res, setRes] = useState<AiResult | null>(null);
  const [err, setErr] = useState('');
  const ctl = useRef<AbortController | null>(null);

  const pick = async (f?: File) => {
    if (!f) return;
    setErr('');
    setRes(null);
    try {
      setPhoto(await shrink(f));
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  const analyse = async () => {
    if (!photo && !text.trim()) return;
    setBusy(true);
    setErr('');
    setRes(null);
    setLine(0);
    const tick = setInterval(() => setLine((l) => (l + 1) % LINES.length), 1800);
    ctl.current = new AbortController();
    try {
      const r = await fetch('/api/fuel/vision', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ image: photo ?? undefined, text, diet }), signal: ctl.current.signal });
      const j = await r.json().catch(() => ({ error: `AI unavailable (${r.status})` }));
      if (!r.ok) throw new Error(j.error ?? 'AI unavailable');
      setRes(j);
      haptic(12);
      if (!j.items.length) setErr(j.note || "Couldn't spot any food — try a clearer photo or describe it.");
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setErr((e as Error).message.includes('fetch') ? 'Needs the laptop — AI runs there. Try again when connected.' : (e as Error).message);
    } finally {
      clearInterval(tick);
      setBusy(false);
    }
  };

  const setItem = (i: number, it: AiItem | null) => setRes((r) => r && { ...r, items: it ? r.items.map((x, j) => (j === i ? it : x)) : r.items.filter((_, j) => j !== i) });
  const items = res?.items ?? [];
  const total = items.reduce((a, x) => ({ kcal: a.kcal + x.kcal, protein: a.protein + x.protein }), { kcal: 0, protein: 0 });

  const log = async () => {
    for (const x of items)
      await create({ date, meal, food_id: x.food_id, name: x.name, qty: x.qty, unit: x.unit, kcal: x.kcal, protein: x.protein, carbs: x.carbs, fat: x.fat, micros: JSON.stringify(x.micros) });
    toast({ message: `Logged ${items.length} item${items.length === 1 ? '' : 's'} · ${Math.round(total.kcal)} kcal · ${Math.round(total.protein)} g protein` });
    setRes(null);
    setPhoto(null);
    setText('');
    onDone?.();
  };

  return (
    <div className="space-y-3">
      {onMealChange && (
        <div className="grid grid-cols-4 gap-1">
          {MEALS.map((m) => (
            <button key={m.id} onClick={() => onMealChange(m.id)} className={cx('h-9 rounded-md text-mini font-bold uppercase', meal === m.id ? 'bg-accent text-white' : 'bg-surface-2 text-ink-2')}>
              {m.label}
            </button>
          ))}
        </div>
      )}

      <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={(e) => (void pick(e.target.files?.[0]), (e.target.value = ''))} />
      <input ref={gallery} type="file" accept="image/*" hidden onChange={(e) => (void pick(e.target.files?.[0]), (e.target.value = ''))} />

      {photo ? (
        <div className="relative overflow-hidden rounded-xl border border-line">
          <img src={photo} alt="Your meal" className="max-h-64 w-full object-cover" />
          {busy && <motion.div className="absolute inset-x-0 h-1 bg-accent shadow-[0_0_24px_4px_var(--accent)]" initial={{ top: '0%' }} animate={{ top: ['0%', '100%', '0%'] }} transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }} />}
          <button onClick={() => (setPhoto(null), setRes(null))} className="absolute right-2 top-2 grid size-9 place-items-center rounded-full bg-black/60 text-white" aria-label="Remove photo">
            <X className="size-4" />
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <motion.button whileTap={{ scale: 0.96 }} onClick={() => camera.current?.click()} className="relative flex h-28 flex-col items-center justify-center gap-2 overflow-hidden rounded-xl bg-accent font-black uppercase italic text-white shadow-[0_12px_30px_-10px_var(--accent)]">
            <Camera className="size-8" />
            Snap meal
          </motion.button>
          <motion.button whileTap={{ scale: 0.96 }} onClick={() => gallery.current?.click()} className="flex h-28 flex-col items-center justify-center gap-2 rounded-xl border border-line bg-bg font-black uppercase italic text-ink-2">
            <ImagePlus className="size-8" />
            From photos
          </motion.button>
        </div>
      )}

      <Textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder={photo ? 'Optional hints — e.g. "2 rotis, less oil, the white one is raita"' : 'Or just describe it — "3 rotis, big bowl rajma, glass of chaas"'} className="text-base" />

      {!res?.items.length && (
        <Button className="w-full" onClick={() => (busy ? ctl.current?.abort() : void analyse())} disabled={!busy && !photo && !text.trim()}>
          {busy ? (
            <>
              <motion.span animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}>
                <Sparkles className="size-4" />
              </motion.span>
              {LINES[line]} <span className="opacity-70">· tap to cancel</span>
            </>
          ) : (
            <>
              <Sparkles className="size-4" /> Analyse with AI
            </>
          )}
        </Button>
      )}

      {err && <p className="rounded-md border border-accent/40 bg-accent-soft px-3 py-2 text-sm">{err}</p>}

      <AnimatePresence>
        {items.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-2">
            <p className="text-micro font-black uppercase tracking-[0.2em] text-ink-3">Check & adjust — then log</p>
            <ul className="space-y-1.5">
              {items.map((x, i) => (
                <motion.li key={x.name + i} layout initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }} className={cx('rounded-lg border bg-bg p-2.5', x.offDiet ? 'border-yellow/60' : 'border-line')}>
                  <div className="flex items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{x.name}</p>
                      <p className="text-tiny text-ink-3">
                        <span className={cx('font-bold uppercase', CONF[x.confidence])}>{x.confidence}</span> · {x.food_id ? x.unit : `est. ${x.unit}`} · {x.kcal} kcal · P{x.protein}
                        {x.micros.fiber != null && ` · Fibre ${x.micros.fiber}`}
                      </p>
                    </div>
                    <div className="flex items-center rounded-md border border-line">
                      <button className="grid size-9 place-items-center text-ink-2" aria-label="Less" onClick={() => setItem(i, rescale(x, Math.max(0.25, x.qty - (x.qty > 1 ? 0.5 : 0.25))))}>
                        <Minus className="size-3.5" />
                      </button>
                      <span className="w-9 text-center font-mono text-sm font-bold">{x.qty}</span>
                      <button className="grid size-9 place-items-center text-ink-2" aria-label="More" onClick={() => setItem(i, rescale(x, x.qty + (x.qty >= 1 ? 0.5 : 0.25)))}>
                        <Plus className="size-3.5" />
                      </button>
                    </div>
                    <button className="grid size-9 place-items-center text-ink-3 hover:text-danger" aria-label={`Remove ${x.name}`} onClick={() => setItem(i, null)}>
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                  {x.offDiet && (
                    <p className="mt-1.5 flex items-center gap-1.5 text-tiny text-yellow">
                      <TriangleAlert className="size-3.5" /> Not {diet === 'veg' ? 'vegetarian' : 'in your diet'} — remove it if the AI got it wrong
                    </p>
                  )}
                </motion.li>
              ))}
            </ul>
            {res?.note && <p className="text-xs italic text-ink-3">AI: {res.note}</p>}
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setRes(null)}>
                Redo
              </Button>
              <Button className="flex-1" onClick={() => void log()}>
                <Zap className="size-4" /> Log {items.length} · {Math.round(total.kcal)} kcal · {Math.round(total.protein)} g P
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {!res && !busy && <p className="text-center text-tiny text-ink-3">Runs on your laptop with your Claude login · nothing is stored but what you log</p>}
    </div>
  );
}
