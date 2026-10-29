import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Bookmark, Camera, ChevronLeft, ChevronRight, Copy, Flame, Minus, Plus, Search, Settings2, Sparkles, Trash2, Zap } from 'lucide-react';
import { useList, useResource, useSettings } from '../lib/api';
import { addDays, parseDate, relativeDay, today } from '../lib/format';
import { listItem } from '../lib/motion';
import { DIETS, FOODS, FOOD_CATS, allowedFor, searchFoods, type Diet, type Food } from '../core/foods';
import { ACTIVITY, DEFAULT_PROFILE, MEALS, mealForNow, sumMacros, targets, type Profile } from '../core/fuel';
import { parseFoodText, proteinFixes } from '../core/foodParse';
import { planDay, planHeadline, type MealId, type MealPlan } from '../core/mealPlan';
import { streamCoach } from '../lib/coach';
import { MICRO_META, microReport, microTargets, richIn, sumMicros } from '../core/micros';
import { CookCard } from '../components/CookCard';
import { portionText } from '../core/portion';
import { AiSnap } from '../components/AiSnap';
import { md } from '../lib/dsa';
import type { Activity, CustomFood, FoodLog, Health, SavedMeal } from '../lib/types';
import { useToast } from '../components/toast';
import { AnimatedNumber, Button, Card, Chip, IconButton, Input, Page, PageHeader, Rise, SectionTitle, Segmented, Sheet, cx } from '../components/ui';

const r1 = (n: number) => Math.round(n * 10) / 10;

/** F1 steering-wheel shift lights: green → red → purple as you approach the calorie target. */
function ShiftLights({ ratio }: { ratio: number }) {
  const n = 15;
  const lit = Math.round(Math.min(1.2, ratio) * n);
  const color = (i: number) => (ratio > 1.05 ? 'var(--purple)' : i < 5 ? 'var(--green)' : i < 10 ? 'var(--accent)' : 'var(--purple)');
  return (
    <div className="flex gap-1.5" role="meter" aria-valuenow={Math.round(ratio * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Calories eaten vs target">
      {Array.from({ length: n }, (_, i) => (
        <motion.span
          key={i}
          className="h-4 flex-1 rounded-full"
          initial={false}
          animate={{
            background: i < lit ? color(i) : 'var(--surface-2)',
            boxShadow: i < lit ? `0 0 12px 1px ${color(i)}` : '0 0 0 0 transparent',
            scale: i < lit ? 1 : 0.85,
          }}
          transition={{ duration: 0.25, delay: i * 0.025 }}
        />
      ))}
    </div>
  );
}

function MacroBar({ label, value, target, color }: { label: string; value: number; target: number; color: string }) {
  const pct = target ? Math.min(1, value / target) : 0;
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-mini font-bold uppercase tracking-wider">
        <span className="text-ink-2">{label}</span>
        <span className="font-mono tabular-nums">
          {Math.round(value)}
          <span className="text-ink-3"> / {target} g</span>
        </span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-sm bg-surface-2">
        <motion.div className="h-full -skew-x-12" style={{ background: color }} initial={{ width: 0 }} animate={{ width: `${pct * 100}%` }} transition={{ type: 'spring', stiffness: 70, damping: 16 }} />
      </div>
    </div>
  );
}

type AnyFood = Food | (CustomFood & { cat: 'Custom' });

/** Food search + logging; used by the Fuel page and the quick-add menu. */
export function FoodSearch({ date, meal, onMealChange }: { date: string; meal: string; onMealChange?: (m: string) => void }) {
  const { create } = useResource<FoodLog>('food_logs');
  const { data: custom = [] } = useList<CustomFood>('custom_foods');
  const customApi = useResource<CustomFood>('custom_foods');
  const { data: recentLogs = [] } = useList<FoodLog>('food_logs', { from: addDays(today(), -21) });
  const toast = useToast();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<string>('Recent');
  const [qty, setQty] = useState<Record<string, number>>({});
  const [making, setMaking] = useState(false);
  const [cf, setCf] = useState({ name: '', serving: '1 serving', kcal: '', protein: '', carbs: '', fat: '' });

  const { settings } = useSettings();
  const diet: Diet = settings.diet ?? 'veg';
  // Custom foods are the user's own, so they're always shown; the built-in list follows the diet.
  const all: AnyFood[] = useMemo(() => [...custom.map((c) => ({ ...c, cat: 'Custom' as const })), ...FOODS.filter((f) => allowedFor(diet, f.id))], [custom, diet]);
  const recent = useMemo(() => {
    const ids = [...new Set(recentLogs.map((l) => l.food_id).filter(Boolean))] as string[];
    return ids.map((id) => all.find((f) => f.id === id)).filter(Boolean).slice(0, 20) as AnyFood[];
  }, [recentLogs, all]);
  const list = q ? searchFoods(all, q) : cat === 'Recent' ? (recent.length ? recent : all.slice(0, 20)) : cat === 'Custom' ? all.filter((f) => f.cat === 'Custom') : all.filter((f) => f.cat === cat);

  const [added, setAdded] = useState<Record<string, number>>({});
  const [mode, setMode] = useState<'search' | 'ai' | 'type' | 'saved'>('search');
  // "Your usual": foods logged for this meal on 3+ different days recently, with their usual quantity.
  const usual = useMemo(() => {
    const byFood = new Map<string, { days: Set<string>; qty: number[] }>();
    for (const l of recentLogs) {
      if (l.meal !== meal || !l.food_id) continue;
      const e = byFood.get(l.food_id) ?? { days: new Set(), qty: [] };
      e.days.add(l.date);
      e.qty.push(l.qty);
      byFood.set(l.food_id, e);
    }
    return [...byFood]
      .filter(([, e]) => e.days.size >= 3)
      .sort((a, b) => b[1].days.size - a[1].days.size)
      .slice(0, 6)
      .map(([id, e]) => ({ food: all.find((f) => f.id === id), qty: e.qty.sort((a, b) => a - b)[Math.floor(e.qty.length / 2)] }))
      .filter((x): x is { food: AnyFood; qty: number } => !!x.food);
  }, [recentLogs, meal, all]);
  const add = async (f: AnyFood, forced?: number) => {
    const n = forced ?? qty[f.id] ?? 1;
    await create({ date, meal, food_id: f.id, name: f.name, qty: n, unit: f.serving, kcal: f.kcal * n, protein: f.protein * n, carbs: f.carbs * n, fat: f.fat * n });
    navigator.vibrate?.(12);
    setAdded((a) => ({ ...a, [f.id]: (a[f.id] ?? 0) + n }));
    toast({ message: `${portionText(f, n)} → ${MEALS.find((m) => m.id === meal)?.label}` });
  };

  return (
    <>
      {onMealChange && (
        <div className="mb-3 grid grid-cols-4 gap-1">
          {MEALS.map((m) => (
            <button key={m.id} onClick={() => onMealChange(m.id)} className={cx('h-9 rounded-md text-mini font-bold uppercase', meal === m.id ? 'bg-accent text-white' : 'bg-surface-2 text-ink-2')}>
              {m.label}
            </button>
          ))}
        </div>
      )}
      <Segmented
        className="mb-3 w-full"
        value={mode}
        onChange={setMode}
        options={[
          { value: 'search', label: 'Search' },
          { value: 'ai', label: '✦ AI' },
          { value: 'type', label: 'Type' },
          { value: 'saved', label: 'Saved' },
        ]}
      />
      {mode === 'ai' && <AiSnap date={date} meal={meal} />}
      {mode === 'type' && <TypeIt date={date} meal={meal} foods={all} recentIds={recent.map((f) => f.id)} />}
      {mode === 'saved' && <SavedMeals date={date} meal={meal} />}
      {mode === 'search' && (
      <>
      {usual.length > 0 && !q && (
        <div className="mb-3">
          <p className="mb-1.5 text-micro font-black uppercase tracking-[0.18em] text-ink-3">Your usual · one tap</p>
          <div className="flex flex-wrap gap-1.5">
            {usual.map(({ food, qty: n }) => (
              <motion.button key={food.id} whileTap={{ scale: 0.92 }} onClick={() => void add(food, n)} className={cx('slant px-3 py-1.5 text-mini font-bold', added[food.id] ? 'bg-green text-black' : 'bg-surface-2 text-ink')}>
                {added[food.id] ? '✓ ' : '+ '}
                {n !== 1 ? portionText(food, n) : food.name}
              </motion.button>
            ))}
          </div>
        </div>
      )}
      <div className="relative mb-3">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
        <input autoFocus type="search" enterKeyHint="search" autoCorrect="off" autoCapitalize="off" spellCheck={false} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search roti, dal, paneer…" className="field h-11 w-full !pl-9" />
      </div>
      {!q && (
        <div className="no-scrollbar -mx-1 mb-3 flex gap-1.5 overflow-x-auto px-1">
          {['Recent', 'Custom', ...FOOD_CATS.filter((c) => !(c === 'Non-veg' && diet !== 'nonveg'))].map((c) => (
            <Chip key={c} active={cat === c} onClick={() => setCat(c)}>
              {c}
            </Chip>
          ))}
        </div>
      )}
      <ul className="max-h-[46vh] space-y-1 overflow-y-auto pr-1">
        {list.map((f) => {
          const n = qty[f.id] ?? 1;
          return (
            <li key={f.id} className="flex items-center gap-2 rounded-md bg-bg px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{f.name}</p>
                <p className="truncate text-tiny text-ink-3">
                  {f.serving} · {Math.round(f.kcal)} kcal · P{r1(f.protein)} C{r1(f.carbs)} F{r1(f.fat)}
                </p>
              </div>
              <div className="flex items-center rounded-md border border-line">
                <button aria-label="Less" className="px-1.5 py-1 text-ink-3 hover:text-ink" onClick={() => setQty({ ...qty, [f.id]: Math.max(0.5, n - 0.5) })}>
                  <Minus className="size-3.5" />
                </button>
                <span className="w-7 text-center font-mono text-xs">{n}</span>
                <button aria-label="More" className="px-1.5 py-1 text-ink-3 hover:text-ink" onClick={() => setQty({ ...qty, [f.id]: n + 0.5 })}>
                  <Plus className="size-3.5" />
                </button>
              </div>
              <Button size="sm" variant={added[f.id] ? 'soft' : 'primary'} className="h-9 min-w-16" onClick={() => void add(f)}>
                {added[f.id] ? `✓ ${added[f.id]}` : 'Add'}
              </Button>
            </li>
          );
        })}
        {list.length === 0 && <li className="py-6 text-center text-sm text-ink-3">No match — add it as a custom food below.</li>}
      </ul>
      <div className="mt-3 border-t border-line pt-3">
        {!making ? (
          <Button variant="ghost" size="sm" onClick={() => (setMaking(true), setCf({ ...cf, name: q }))}>
            <Plus className="size-4" /> Custom food
          </Button>
        ) : (
          <form
            className="grid grid-cols-2 gap-2 sm:grid-cols-6"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!cf.name.trim() || !Number(cf.kcal)) return;
              await customApi.create({ name: cf.name.trim(), serving: cf.serving, kcal: +cf.kcal, protein: +cf.protein || 0, carbs: +cf.carbs || 0, fat: +cf.fat || 0 });
              setMaking(false);
              setCat('Custom');
              setQ('');
            }}
          >
            <Input className="col-span-2" placeholder="Name" value={cf.name} onChange={(e) => setCf({ ...cf, name: e.target.value })} />
            <Input className="col-span-2 sm:col-span-1" placeholder="Serving" value={cf.serving} onChange={(e) => setCf({ ...cf, serving: e.target.value })} />
            {(['kcal', 'protein', 'carbs', 'fat'] as const).map((k) => (
              <Input key={k} inputMode="decimal" placeholder={k} value={cf[k]} onChange={(e) => setCf({ ...cf, [k]: e.target.value.replace(/[^\d.]/g, '') })} className="sm:col-span-1" />
            ))}
            <Button type="submit" className="col-span-2 sm:col-span-6">
              Save custom food
            </Button>
          </form>
        )}
      </div>
      </>
      )}
    </>
  );
}

/** "2 roti, dal tadka, 1 katori chawal" → preview with matches you can fix → log all. */
function TypeIt({ date, meal, foods, recentIds }: { date: string; meal: string; foods: AnyFood[]; recentIds: string[] }) {
  const { create } = useResource<FoodLog>('food_logs');
  const toast = useToast();
  const [text, setText] = useState('');
  const [picks, setPicks] = useState<Record<number, string>>({});
  const parsed = useMemo(() => parseFoodText(text, foods, recentIds), [text, foods, recentIds]);
  const rows = parsed.map((p, i) => ({ ...p, food: (picks[i] && foods.find((f) => f.id === picks[i])) || p.food }));
  const ok = rows.filter((r) => r.food);
  const total = ok.reduce((a, r) => a + r.food!.kcal * r.qty, 0);
  const logAll = async () => {
    for (const r of ok) {
      const f = r.food!;
      await create({ date, meal, food_id: f.id, name: f.name, qty: r.qty, unit: f.serving, kcal: f.kcal * r.qty, protein: f.protein * r.qty, carbs: f.carbs * r.qty, fat: f.fat * r.qty });
    }
    navigator.vibrate?.([15, 30, 15]);
    toast({ message: `Logged ${ok.length} item${ok.length === 1 ? '' : 's'} · ${Math.round(total)} kcal` });
    setText('');
    setPicks({});
  };
  return (
    <div className="space-y-3">
      <textarea
        autoFocus
        autoCapitalize="off"
        rows={2}
        value={text}
        onChange={(e) => (setText(e.target.value), setPicks({}))}
        placeholder="2 roti, dal tadka, 1 katori chawal, chai"
        className="field w-full resize-none text-base"
      />
      <ul className="space-y-1">
        {rows.map((r, i) => (
          <motion.li key={i + r.text} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} className="flex items-center gap-2 rounded-md bg-bg px-3 py-2 text-sm">
            <span className="w-9 font-mono font-bold">{r.qty}×</span>
            {r.food ? (
              <select value={r.food.id} onChange={(e) => setPicks({ ...picks, [i]: e.target.value })} className="min-w-0 flex-1 truncate bg-transparent font-semibold outline-none">
                {[r.food, ...r.alternatives.filter((a) => a.id !== r.food!.id)].map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name} — {f.serving}
                  </option>
                ))}
              </select>
            ) : (
              <span className="flex-1 text-warn">“{r.text}” — no match, try Search</span>
            )}
            {r.food && <span className="font-mono text-xs text-ink-3">{Math.round(r.food.kcal * r.qty)}</span>}
          </motion.li>
        ))}
      </ul>
      <Button className="h-12 w-full" disabled={!ok.length} onClick={() => void logAll()}>
        <Zap className="size-4" /> Log {ok.length || ''} to {MEALS.find((m) => m.id === meal)?.label} {ok.length ? `· ${Math.round(total)} kcal` : ''}
      </Button>
      <p className="text-tiny text-ink-3">Understands numbers, “ek/do/half”, katori/plate/glass and Hinglish names (chawal, dahi, anda, chapati…).</p>
    </div>
  );
}

function SavedMeals({ date, meal }: { date: string; meal: string }) {
  const { data: saved = [] } = useList<SavedMeal>('saved_meals');
  const { remove } = useResource<SavedMeal>('saved_meals');
  const { create } = useResource<FoodLog>('food_logs');
  const toast = useToast();
  const log = async (m: SavedMeal) => {
    const items: Omit<FoodLog, 'id' | 'created_at' | 'updated_at' | 'date' | 'meal'>[] = JSON.parse(m.items);
    for (const it of items) await create({ ...it, date, meal });
    navigator.vibrate?.([15, 30, 15]);
    toast({ message: `${m.name} logged · ${Math.round(items.reduce((a, x) => a + x.kcal, 0))} kcal` });
  };
  if (!saved.length) return <p className="py-6 text-center text-sm text-ink-3">No saved meals yet. On the Fuel page, tap the bookmark on any meal to save it for one-tap logging.</p>;
  return (
    <ul className="space-y-1.5">
      {saved.map((m) => {
        const items: FoodLog[] = JSON.parse(m.items);
        return (
          <li key={m.id} className="group flex items-center gap-3 rounded-md bg-bg px-3 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="truncate font-bold">{m.name}</p>
              <p className="truncate text-xs text-ink-3">
                {items.map((x) => (x.unit ? portionText({ id: x.food_id, name: x.name, serving: x.unit }, x.qty) : x.name)).join(' · ')} · {Math.round(items.reduce((a, x) => a + x.kcal, 0))} kcal
              </p>
            </div>
            <IconButton label={`Delete ${m.name}`} onClick={() => remove(m.id)} className="opacity-0 transition group-hover:opacity-100 max-sm:opacity-50">
              <Trash2 className="size-4" />
            </IconButton>
            <Button size="sm" onClick={() => void log(m)}>
              Log
            </Button>
          </li>
        );
      })}
    </ul>
  );
}

/** Ask the local Claude CLI for meal ideas that fit what's left of today's macros. */
function MealCoach({ open, onClose, remaining, usual, diet }: { open: boolean; onClose: () => void; remaining: { kcal: number; protein: number; carbs: number; fat: number }; usual: string[]; diet: Diet }) {
  const [text, setText] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    const ctl = new AbortController();
    setText('');
    setErr(null);
    setBusy(true);
    streamCoach('fuel', { remaining, usual, diet, meal: MEALS.find((m) => m.id === mealForNow())?.label ?? 'next meal' }, (t) => setText((x) => x + t), ctl.signal)
      .catch((e) => (e as Error).name !== 'AbortError' && setErr((e as Error).message))
      .finally(() => setBusy(false));
    return () => ctl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  return (
    <Sheet open={open} onClose={onClose} title="Pit radio · meal plan">
      <p className="mb-3 font-mono text-xs text-ink-3">
        Left today: {Math.round(remaining.kcal)} kcal · P {Math.round(remaining.protein)} · C {Math.round(remaining.carbs)} · F {Math.round(remaining.fat)} g
      </p>
      {err ? <p className="text-sm text-warn">{err}</p> : text ? <div className="prose-f1 text-[14px]" dangerouslySetInnerHTML={{ __html: md(text) }} /> : <span className="cursor-blink inline-block h-4 w-2 bg-accent" />}
      {busy && text && <span className="cursor-blink ml-1 inline-block h-4 w-2 bg-accent" />}
      <p className="mt-3 text-micro text-ink-3">From your local Claude Code login · log what you pick with Type it.</p>
    </Sheet>
  );
}

function AddFoodSheet({ meal, date, onClose }: { meal: string | null; date: string; onClose: () => void }) {
  return (
    <Sheet open={!!meal} onClose={onClose} title={`Add to ${MEALS.find((m) => m.id === meal)?.label ?? ''}`}>
      {meal && <FoodSearch date={date} meal={meal} />}
    </Sheet>
  );
}

function DietPicker() {
  const { settings, save } = useSettings();
  const diet: Diet = settings.diet ?? 'veg';
  return (
    <div>
      <p className="mb-1 text-micro font-black uppercase tracking-widest text-ink-3">Diet</p>
      <Segmented className="w-full" value={diet} onChange={(d) => save({ diet: d })} options={DIETS.map((d) => ({ value: d.value, label: d.label }))} />
      <p className="mt-1 text-tiny text-ink-3">{DIETS.find((d) => d.value === diet)?.hint} — food search, suggestions and the meal coach follow this.</p>
    </div>
  );
}

function ProfileSheet({ open, onClose, profile }: { open: boolean; onClose: () => void; profile: Profile }) {
  const { save } = useSettings();
  const [p, setP] = useState(profile);
  const t = targets(p);
  const num = (k: keyof Profile) => (e: React.ChangeEvent<HTMLInputElement>) => setP({ ...p, [k]: Number(e.target.value) || 0 });
  return (
    <Sheet open={open} onClose={onClose} title="Driver profile">
      <div className="space-y-4">
        <Segmented className="w-full" value={p.sex} onChange={(sex) => setP({ ...p, sex })} options={[{ value: 'male', label: 'Male' }, { value: 'female', label: 'Female' }]} />
        <div className="grid grid-cols-3 gap-2">
          <label className="text-xs font-bold uppercase tracking-wider text-ink-3">
            Age
            <Input type="number" inputMode="decimal" value={p.age} onChange={num('age')} className="mt-1" />
          </label>
          <label className="text-xs font-bold uppercase tracking-wider text-ink-3">
            Height cm
            <Input type="number" inputMode="decimal" value={p.height} onChange={num('height')} className="mt-1" />
          </label>
          <label className="text-xs font-bold uppercase tracking-wider text-ink-3">
            Weight kg
            <Input type="number" inputMode="decimal" value={p.weight} onChange={num('weight')} className="mt-1" />
          </label>
        </div>
        <div className="space-y-1.5">
          {ACTIVITY.map((a) => (
            <button key={a.value} onClick={() => setP({ ...p, activity: a.value })} className={cx('flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm', p.activity === a.value ? 'border-accent bg-accent-soft' : 'border-line')}>
              {a.label} <span className="font-mono text-xs text-ink-3">×{a.value}</span>
            </button>
          ))}
        </div>
        <DietPicker />
        <Segmented className="w-full" value={p.goal} onChange={(goal) => setP({ ...p, goal })} options={[{ value: 'cut', label: 'Cut' }, { value: 'maintain', label: 'Maintain' }, { value: 'bulk', label: 'Lean bulk' }]} />
        <table className="w-full text-sm">
          <tbody className="[&_td]:border-b [&_td]:border-line [&_td]:py-1.5">
            <tr><td className="text-ink-3">BMR (Mifflin–St Jeor)</td><td className="text-right font-mono">{t.bmr} kcal</td></tr>
            <tr><td className="text-ink-3">× activity = maintenance (TDEE)</td><td className="text-right font-mono">{t.tdee} kcal</td></tr>
            <tr><td className="text-ink-3">Goal adjustment</td><td className="text-right font-mono">{p.goal === 'cut' ? '−450' : p.goal === 'bulk' ? '+300' : '0'} kcal</td></tr>
            <tr><td className="font-bold">Daily target</td><td className="text-right font-mono font-bold text-accent">{t.kcal} kcal</td></tr>
            <tr><td className="text-ink-3">Protein / Carbs / Fat</td><td className="text-right font-mono">{t.protein} / {t.carbs} / {t.fat} g</td></tr>
          </tbody>
        </table>
        <Button className="w-full" onClick={() => (save({ fuel: p }), onClose())}>
          Save targets
        </Button>
      </div>
    </Sheet>
  );
}

function WeekChart({ logs, target }: { logs: FoodLog[]; target: number }) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(today(), i - 6));
  const totals = days.map((d) => ({ d, v: logs.filter((l) => l.date === d).reduce((a, l) => a + l.kcal, 0) }));
  const max = Math.max(target * 1.25, ...totals.map((t) => t.v));
  const [hover, setHover] = useState<number | null>(null);
  const shown = totals[hover ?? 6];
  return (
    <Card>
      <SectionTitle>Last 7 days</SectionTitle>
      <p className="text-xs text-ink-3">{relativeDay(shown.d)}</p>
      <p className="mb-3 text-2xl font-black italic tabular-nums">
        {Math.round(shown.v)} <span className="text-sm not-italic text-ink-3">/ {target} kcal</span>
      </p>
      <div className="relative flex h-32 items-end gap-2" onMouseLeave={() => setHover(null)}>
        <div className="pointer-events-none absolute inset-x-0 border-t border-dashed border-ink-3" style={{ bottom: `${(target / max) * 100}%` }}>
          <span className="absolute -top-4 right-0 text-micro font-bold uppercase text-ink-3">target</span>
        </div>
        {totals.map((t, i) => (
          <button key={t.d} className="flex h-full flex-1 flex-col items-center justify-end gap-1" onMouseEnter={() => setHover(i)} aria-label={`${t.d}: ${Math.round(t.v)} kcal`}>
            <motion.span
              className="w-full rounded-t-[4px]"
              style={{ background: t.v > target * 1.05 ? 'var(--purple)' : 'var(--accent)', opacity: hover === null || hover === i ? 1 : 0.45 }}
              initial={{ height: 0 }}
              animate={{ height: t.v ? `${(t.v / max) * 100}%` : '2px' }}
              transition={{ type: 'spring', stiffness: 80, damping: 16, delay: i * 0.05 }}
            />
            <span className="text-micro font-bold uppercase text-ink-3">{parseDate(t.d).toLocaleDateString(undefined, { weekday: 'narrow' })}</span>
          </button>
        ))}
      </div>
      <p className="mt-2 text-tiny text-ink-3">Purple bars: more than 5% over target.</p>
    </Card>
  );
}

const STATUS_CHIP: Record<MealPlan['status'], { label: string; cls: string }> = {
  done: { label: 'Done', cls: 'bg-green text-black' },
  now: { label: 'Now', cls: 'bg-accent text-white' },
  late: { label: 'Late', cls: 'bg-yellow text-black' },
  next: { label: 'Next', cls: 'bg-ink text-bg' },
  later: { label: 'Later', cls: 'bg-surface-2 text-ink-2' },
  skipped: { label: 'Skipped', cls: 'bg-surface-2 text-ink-3' },
};
const hm12 = (hm: string) => {
  const [h, m] = hm.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
};

/** Where you are in the day and what to eat next, sized to what's left of today's targets. */
function DayPlan({ day, remaining, usualIds, diet }: { day: FoodLog[]; remaining: { kcal: number; protein: number }; usualIds: string[]; diet: Diet }) {
  const { create } = useResource<FoodLog>('food_logs');
  const toast = useToast();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);
  const nowHM = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const per = (m: MealId) => sumMacros(day.filter((l) => l.meal === m));
  const logged: Record<MealId, { kcal: number; protein: number }> = { breakfast: per("breakfast"), lunch: per("lunch"), snacks: per("snacks"), dinner: per("dinner") };
  const plan = useMemo(() => planDay({ nowHM, logged, remaining, usualIds, diet }), [nowHM, JSON.stringify(logged), remaining.kcal, remaining.protein, usualIds.join(), diet]); // eslint-disable-line react-hooks/exhaustive-deps
  const active = plan.find((p) => ['now', 'late', 'next'].includes(p.status))?.meal ?? null;
  const [focus, setFocus] = useState<MealId | null>(null);
  const [alt, setAlt] = useState(0);
  const shown = plan.find((p) => p.meal === (focus ?? active));
  const opt = shown?.options[alt % Math.max(1, shown.options.length)];

  const logIt = async () => {
    if (!shown || !opt) return;
    for (const { food, qty } of opt.items) await create({ date: today(), meal: shown.meal, food_id: food.id, name: food.name, qty, unit: food.serving, kcal: food.kcal * qty, protein: food.protein * qty, carbs: food.carbs * qty, fat: food.fat * qty });
    navigator.vibrate?.([15, 30, 15]);
    toast({ message: `${opt.name} logged to ${MEALS.find((m) => m.id === shown.meal)?.label}` });
    setFocus(null);
    setAlt(0);
  };

  return (
    <Card className="mb-4">
      <SectionTitle>Your day</SectionTitle>
      <p className="-mt-1 mb-4 text-sm text-ink-2">{planHeadline(plan)}</p>
      <div className="relative grid grid-cols-4 gap-1.5">
        <div className="pointer-events-none absolute left-[12.5%] right-[12.5%] top-[22px] h-[2px] bg-line" />
        {plan.map((p, i) => {
          const chip = STATUS_CHIP[p.status];
          const selectable = p.options.length > 0;
          const selected = (focus ?? active) === p.meal;
          return (
            <motion.button
              key={p.meal}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06 }}
              disabled={!selectable}
              onClick={() => (setFocus(p.meal), setAlt(0))}
              className={cx('relative flex flex-col items-center rounded-lg px-1 pb-2 pt-1 text-center transition', selected && 'bg-surface-2', selectable && 'hover:bg-surface-2')}
            >
              <span className={cx('relative z-10 grid size-9 place-items-center rounded-full border-2 text-tiny font-black', p.status === 'done' ? 'border-green bg-green text-black' : p.status === 'now' || p.status === 'late' ? 'border-accent bg-accent text-white' : 'border-line-strong bg-bg text-ink-2')}>
                {p.status === 'done' ? '✓' : i + 1}
                {(p.status === 'now' || p.status === 'late') && <span className="absolute inset-0 animate-ping rounded-full border-2 border-accent opacity-50" />}
              </span>
              <span className="mt-1.5 text-mini font-black italic uppercase leading-tight">{MEALS.find((m) => m.id === p.meal)?.label}</span>
              <span className="font-mono text-micro text-ink-3">{hm12(p.at)}</span>
              <span className={cx('slant mt-1 px-1.5 text-micro font-black uppercase', chip.cls)}>{p.status === 'done' ? `${Math.round(p.logged.kcal)} kcal` : chip.label}</span>
            </motion.button>
          );
        })}
      </div>
      <AnimatePresence mode="wait">
        {shown && opt ? (
          <motion.div key={`${shown.meal}-${alt}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} className="mt-4 rounded-lg border border-line bg-bg p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-lg font-black italic uppercase">
                {MEALS.find((m) => m.id === shown.meal)?.label} · {opt.name}
              </p>
              <p className="font-mono text-xs text-ink-3">
                {shown.status === 'now' ? 'now' : shown.status === 'late' ? 'have it now' : hm12(shown.at)} · aim {shown.target?.kcal} kcal / {shown.target?.protein} g
              </p>
            </div>
            <ul className="mt-2 space-y-1 text-sm">
              {opt.items.map(({ food, qty }) => (
                <li key={food.id} className="flex justify-between gap-3">
                  <span>
                    {portionText(food, qty)}
                  </span>
                  <span className="font-mono text-xs text-ink-3">{Math.round(food.kcal * qty)}</span>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="mr-auto font-mono text-sm font-bold">
                {opt.kcal} kcal · <span className={opt.protein >= (shown.target?.protein ?? 0) * 0.8 ? 'text-green' : 'text-yellow'}>{opt.protein} g protein</span>
              </span>
              {shown.options.length > 1 && (
                <Button size="sm" variant="ghost" onClick={() => setAlt((a) => a + 1)}>
                  Another option
                </Button>
              )}
              <Button size="sm" onClick={() => void logIt()}>
                Log this
              </Button>
            </div>
          </motion.div>
        ) : (
          <p className="mt-4 text-sm text-ink-3">{remaining.kcal <= 60 ? "You've hit today's calories — if you're hungry, go for something light like a green salad or buttermilk." : 'All meals for today are logged.'}</p>
        )}
      </AnimatePresence>
    </Card>
  );
}

/** Micronutrient telemetry: today or a 7-day average (micros swing day to day; the week tells the truth). */
function MicrosCard({ logs, date, profile, kcalTarget }: { logs: FoodLog[]; date: string; profile: Profile; kcalTarget: number }) {
  const [view, setView] = useState<'day' | 'week'>('day');
  const [open, setOpen] = useState(false);
  const from = addDays(date, -6);
  const window = view === 'day' ? logs.filter((l) => l.date === date) : logs.filter((l) => l.date >= from && l.date <= date);
  const days = view === 'day' ? 1 : Math.max(1, new Set(window.map((l) => l.date)).size);
  const { total, unknownKcal } = sumMicros(window);
  const kcal = window.reduce((a, l) => a + l.kcal, 0);
  const report = microReport(total, microTargets(profile.sex, kcalTarget), days);
  const gaps = report.filter((r) => r.status !== 'ok').sort((a, b) => (a.status === 'over' ? 1 : a.pct) - (b.status === 'over' ? 1 : b.pct));
  const shown = open ? report : report.slice(0, 6);
  const fmt = (v: number, unit: string) => (unit === 'µg' || v < 10 ? r1(v) : Math.round(v)).toLocaleString();
  return (
    <Card className="mb-4">
      <SectionTitle action={<Segmented value={view} onChange={setView} options={[{ value: 'day', label: 'Day' }, { value: 'week', label: '7-day avg' }]} />}>Micros</SectionTitle>
      {!window.length ? (
        <p className="py-4 text-center text-sm text-ink-3">Log some food to see fibre, iron, B12 and more.</p>
      ) : (
        <>
          <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
            {shown.map((r) => {
              const meta = MICRO_META[r.key];
              const color = r.status === 'over' ? 'var(--accent)' : r.status === 'low' ? 'var(--yellow)' : 'var(--green)';
              return (
                <div key={r.key} title={meta.why}>
                  <div className="mb-1 flex items-baseline justify-between gap-2 text-mini font-bold uppercase tracking-wider">
                    <span className="text-ink-2">
                      {meta.label}
                      {meta.kind === 'limit' && <span className="ml-1 text-ink-3 normal-case">(limit)</span>}
                    </span>
                    <span className="font-mono tabular-nums">
                      {fmt(r.value, meta.unit)}
                      {/* normal-case: uppercase would turn µg into "ΜG", which reads as mg */}
                      <span className="normal-case text-ink-3">
                        {' '}
                        / {r.target.toLocaleString()} {meta.unit}
                      </span>
                    </span>
                  </div>
                  <div className="relative h-2 overflow-hidden rounded-sm bg-surface-2">
                    <motion.div className="h-full -skew-x-12" style={{ background: color }} initial={{ width: 0 }} animate={{ width: `${Math.min(1, r.pct) * 100}%` }} transition={{ type: 'spring', stiffness: 70, damping: 16 }} />
                  </div>
                </div>
              );
            })}
          </div>
          <button onClick={() => setOpen(!open)} className="mt-3 text-mini font-bold uppercase tracking-wider text-ink-3 hover:text-ink">
            {open ? 'Show less' : `All ${report.length} nutrients`}
          </button>
          {gaps.length > 0 && (
            <div className="mt-3 space-y-2 border-t border-line pt-3">
              {gaps.slice(0, 3).map((g) => (
                <div key={g.key} className="text-sm">
                  <p>
                    <span className={cx('slant mr-2 inline-block px-2 text-micro font-black uppercase', g.status === 'over' ? 'bg-accent text-white' : 'bg-yellow text-black')}>
                      {MICRO_META[g.key].label} {g.status === 'over' ? 'high' : `${Math.round(g.pct * 100)}%`}
                    </span>
                    <span className="text-ink-2">{g.tip}</span>
                  </p>
                  {g.status === 'low' && (
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {richIn(g.key, FOODS, g.target).map(({ food, share }) => (
                        <span key={food.id} className="rounded-md bg-bg px-2 py-1 text-tiny text-ink-2">
                          {food.name} <b className="font-mono text-green">{Math.round(share * 100)}%</b>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          {kcal > 0 && unknownKcal / kcal > 0.1 && <p className="mt-3 text-tiny text-ink-3">Partial: {Math.round((unknownKcal / kcal) * 100)}% of calories are custom foods without micro data.</p>}
          <p className="mt-2 text-tiny text-ink-3">Estimates from IFCT/USDA averages · targets: ICMR-NIN 2020{view === 'week' ? ` · averaged over ${days} logged day${days === 1 ? '' : 's'}` : ''}</p>
        </>
      )}
    </Card>
  );
}

export function FuelPage() {
  const { settings } = useSettings();
  const { data: health = [] } = useList<Health>('health', { from: addDays(today(), -60) });
  const latestWeight = health.find((h) => h.kind === 'weight')?.value;
  const profile: Profile = settings.fuel ?? { ...DEFAULT_PROFILE, weight: latestWeight ?? DEFAULT_PROFILE.weight };
  const t = targets(profile);
  const [date, setDate] = useState(today());
  const { data: logs = [] } = useList<FoodLog>('food_logs', { from: addDays(today(), -30) });
  const { create, remove } = useResource<FoodLog>('food_logs');
  const toast = useToast();
  const [adding, setAdding] = useState<string | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);

  const day = logs.filter((l) => l.date === date);
  const total = sumMacros(day);
  const left = t.kcal - total.kcal;
  const savedApi = useResource<SavedMeal>('saved_meals');
  const { data: acts = [] } = useList<Activity>('activities', { from: date, to: date });
  const burned = acts.reduce((a, x) => a + (x.kcal ?? 0), 0);
  const recentIds = [...new Set(logs.map((l) => l.food_id).filter(Boolean))] as string[];
  const gap = Math.round(t.protein - total.protein);
  const diet: Diet = settings.diet ?? 'veg';
  const fixes = gap >= 15 ? proteinFixes(gap, FOODS.filter((f) => allowedFor(diet, f.id)), recentIds) : [];
  const saveMeal = async (meal: string, label: string) => {
    const items = day.filter((l) => l.meal === meal).map(({ food_id, name, qty, unit, kcal, protein, carbs, fat, micros }) => ({ food_id, name, qty, unit, kcal, protein, carbs, fat, micros }));
    if (!items.length) return toast({ message: `${label} is empty — log it first, then save it` });
    const name = prompt(`Name this meal`, `My ${label.toLowerCase()}`)?.trim();
    if (!name) return;
    await savedApi.create({ name, meal, items: JSON.stringify(items) });
    toast({ message: `Saved “${name}” — find it under Add → Saved meals` });
  };
  const [coachOpen, setCoachOpen] = useState(false);
  const [snap, setSnap] = useState<string | null>(null);
  const usualNames = useMemo(() => {
    const n = new Map<string, number>();
    for (const l of logs) n.set(l.name, (n.get(l.name) ?? 0) + 1);
    return [...n].sort((a, b) => b[1] - a[1]).map(([k]) => k);
  }, [logs]);
  const quickAdd = async (f: (typeof FOODS)[number], qty: number) => {
    await create({ date, meal: mealForNow(), food_id: f.id, name: f.name, qty, unit: f.serving, kcal: f.kcal * qty, protein: f.protein * qty, carbs: f.carbs * qty, fat: f.fat * qty });
    toast({ message: `${portionText(f, qty)} added` });
  };

  const copyYesterday = async (meal: string) => {
    const y = logs.filter((l) => l.date === addDays(date, -1) && l.meal === meal);
    for (const l of y) await create({ date, meal, food_id: l.food_id, name: l.name, qty: l.qty, unit: l.unit, kcal: l.kcal, protein: l.protein, carbs: l.carbs, fat: l.fat, micros: l.micros ?? null });
    toast({ message: y.length ? `Copied ${y.length} items from yesterday` : 'Nothing logged there yesterday' });
  };
  const del = (l: FoodLog) => {
    remove(l.id);
    const { id: _, created_at: __, updated_at: ___, ...rest } = l;
    toast({ message: `Removed ${l.name}`, action: { label: 'Undo', onClick: () => void create(rest) } });
  };

  return (
    <Page>
      <PageHeader
        eyebrow="Pit wall · Fuel"
        title={
          <span className="flex items-center gap-1">
            <IconButton label="Previous day" onClick={() => setDate(addDays(date, -1))}>
              <ChevronLeft className="size-5" />
            </IconButton>
            {relativeDay(date)}
            <IconButton label="Next day" onClick={() => setDate(addDays(date, 1))} disabled={date >= today()}>
              <ChevronRight className="size-5" />
            </IconButton>
          </span>
        }
        action={
          <Button variant="ghost" onClick={() => setProfileOpen(true)}>
            <Settings2 className="size-4" /> {t.kcal} kcal target
          </Button>
        }
      />

      <Card className="mb-4">
        <div className="mb-4 grid gap-6 sm:grid-cols-[1fr_auto] sm:items-end">
          <div>
            <p className="text-tiny font-black uppercase tracking-[0.25em] text-ink-3">{left >= 0 ? 'Fuel remaining' : 'Over target'}</p>
            <p className={cx('text-6xl font-black italic leading-none tabular-nums', left < 0 && 'text-purple')}>
              <AnimatedNumber value={Math.abs(left)} />
              <span className="ml-2 text-lg not-italic text-ink-3">kcal</span>
            </p>
          </div>
          <div className="grid grid-cols-3 gap-4 text-right font-mono text-sm">
            <div>
              <p className="text-micro font-bold uppercase tracking-widest text-ink-3">Eaten</p>
              <p className="text-xl font-bold">{Math.round(total.kcal)}</p>
            </div>
            <div>
              <p className="text-micro font-bold uppercase tracking-widest text-ink-3">Target</p>
              <p className="text-xl font-bold">{t.kcal}</p>
            </div>
            <div>
              <p className="text-micro font-bold uppercase tracking-widest text-ink-3">TDEE</p>
              <p className="text-xl font-bold text-ink-2">{t.tdee}</p>
            </div>
          </div>
        </div>
        <ShiftLights ratio={total.kcal / t.kcal} />
        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          <MacroBar label="Protein" value={total.protein} target={t.protein} color="var(--accent)" />
          <MacroBar label="Carbs" value={total.carbs} target={t.carbs} color="var(--yellow)" />
          <MacroBar label="Fat" value={total.fat} target={t.fat} color="var(--sky)" />
        </div>
        {burned > 0 && (
          <p className="mt-4 flex items-center gap-1.5 text-xs text-ink-3">
            <Flame className="size-3.5 text-yellow" /> {Math.round(burned)} kcal burned in sport {date === today() ? 'today' : 'that day'} — shown for reference, target unchanged.
          </p>
        )}
      </Card>

      {date === today() && <CookCard target={t} logs={logs} profile={profile} />}
      {date === today() && <DayPlan day={day} remaining={{ kcal: left, protein: t.protein - total.protein }} usualIds={recentIds} diet={diet} />}
      <Rise className="-mt-1 mb-4 flex flex-wrap justify-end gap-2">
        {date === today() && left > 150 && (
          <Button size="sm" variant="ghost" onClick={() => setCoachOpen(true)}>
            <Sparkles className="size-4 text-accent-2" /> Plan my next meal
          </Button>
        )}
        <Button size="sm" onClick={() => setSnap(mealForNow())}>
          <Camera className="size-4" /> Snap a meal
        </Button>
      </Rise>
      <Sheet open={!!snap} onClose={() => setSnap(null)} title="AI meal log">
        {snap && <AiSnap date={date} meal={snap} onMealChange={setSnap} onDone={() => setSnap(null)} />}
      </Sheet>
      <MealCoach open={coachOpen} diet={diet} onClose={() => setCoachOpen(false)} remaining={{ kcal: left, protein: Math.max(0, t.protein - total.protein), carbs: Math.max(0, t.carbs - total.carbs), fat: Math.max(0, t.fat - total.fat) }} usual={usualNames} />
      <AnimatePresence>
        {fixes.length > 0 && date === today() && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mb-4 rounded-xl border border-accent/40 bg-accent-soft p-4">
            <p className="flex items-center gap-2 text-sm font-black uppercase italic">
              <Sparkles className="size-4 text-accent-2" /> {gap} g protein to go — close it with one of these
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {fixes.map((x) => (
                <motion.button key={x.food.id} whileTap={{ scale: 0.94 }} onClick={() => void quickAdd(x.food, x.qty)} className="rounded-md border border-line bg-bg px-3 py-2 text-left text-sm">
                  <span className="font-bold">{portionText(x.food, x.qty)}</span>
                  <span className="block font-mono text-tiny text-ink-3">+{x.protein} g · {x.kcal} kcal</span>
                </motion.button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {MEALS.map((m) => {
          const items = day.filter((l) => l.meal === m.id);
          const mt = sumMacros(items);
          return (
            <Card key={m.id}>
              <div className="mb-3 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-micro font-black uppercase tracking-[0.2em] text-ink-3">{m.hint}</p>
                  <p className="text-xl font-black italic uppercase leading-tight">{m.label}</p>
                  <p className="font-mono text-mini font-bold text-ink-2">{Math.round(mt.kcal)} kcal</p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <IconButton label={`Save ${m.label} as a meal`} onClick={() => void saveMeal(m.id, m.label)}>
                    <Bookmark className="size-4" />
                  </IconButton>
                  <IconButton label={`Copy yesterday's ${m.label}`} onClick={() => void copyYesterday(m.id)}>
                    <Copy className="size-4" />
                  </IconButton>
                  <Button size="sm" onClick={() => setAdding(m.id)}>
                    <Plus className="size-4" /> Add
                  </Button>
                </div>
              </div>
              <ul className="space-y-1">
                <AnimatePresence initial={false}>
                  {items.map((l) => (
                    <motion.li key={l.id} layout {...listItem} className="group flex items-center gap-3 rounded-md bg-bg px-3 py-2 text-sm">
                      <span className="h-5 w-1 -skew-x-12 bg-accent" />
                      <span className="min-w-0 flex-1 truncate">
                        {l.unit ? portionText({ id: l.food_id, name: l.name, serving: l.unit }, l.qty) : `${l.qty !== 1 ? `${l.qty} × ` : ''}${l.name}`}
                        <span className="ml-1.5 text-tiny text-ink-3">P{r1(l.protein)}</span>
                      </span>
                      <span className="font-mono text-ink-2">{Math.round(l.kcal)}</span>
                      <button aria-label={`Remove ${l.name}`} onClick={() => del(l)} className="text-ink-3 opacity-0 transition group-hover:opacity-100 hover:text-danger max-sm:opacity-100">
                        <Trash2 className="size-3.5" />
                      </button>
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>
              {items.length === 0 && <p className="py-3 text-center text-xs text-ink-3">Nothing yet</p>}
            </Card>
          );
        })}
      </div>
      <Rise className="mt-4">
        <MicrosCard logs={logs} date={date} profile={profile} kcalTarget={t.kcal} />
      </Rise>
      <Rise className="mt-4">
        <WeekChart logs={logs} target={t.kcal} />
      </Rise>
      <AddFoodSheet meal={adding} date={date} onClose={() => setAdding(null)} />
      <ProfileSheet key={JSON.stringify(profile)} open={profileOpen} onClose={() => setProfileOpen(false)} profile={profile} />
    </Page>
  );
}

