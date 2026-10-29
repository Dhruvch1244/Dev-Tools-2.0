import { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { Check, ChefHat, Milk, Plus, RefreshCw, Settings2, Share2, ShoppingCart, Sparkles, Trash2 } from 'lucide-react';
import { useList, useResource, useSettings } from '../lib/api';
import { addDays, haptic, parseDate, today } from '../lib/format';
import { FOODS } from '../core/foods';
import { MICRO_META } from '../core/micros';
import { PROTEIN_STAPLES, boostText, cookBrief, cookConfig, cookContext, planCookDay, shoppingTrips, wheyGoal, wheyPlan, type CookConfig, type DayCook, type Trip, type WheyPlan } from '../core/cook';
import { mealForNow, type Profile } from '../core/fuel';
import { portionText } from '../core/portion';
import type { FoodLog, ShopRow } from '../lib/types';
import { Button, Input, Segmented, Sheet, cx } from './ui';
import { useToast } from './toast';

const whey = FOODS.find((f) => f.id === 'whey')!;
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const shortDay = (d: string) => parseDate(d).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });

/** Plan any date with the user's settings: your usual lunch, this week's gaps, the whey goal. */
export function useCookPlan(target: { kcal: number; protein: number }, logs: FoodLog[], profile: Profile) {
  const { settings } = useSettings();
  const cfg = cookConfig(settings.cook);
  const w = wheyPlan(settings.whey);
  const ctx = useMemo(() => cookContext(logs, today(), target, profile.sex), [logs, target, profile.sex]);
  const plan = (date: string) => planCookDay(date, { target, cfg, diet: settings.diet ?? 'veg', picks: settings.cookPicks?.[date], whey: w, ...ctx });
  return { cfg, whey: w, ctx, plan };
}

async function share(text: string, toast: ReturnType<typeof useToast>) {
  try {
    if (navigator.share) return void (await navigator.share({ text }));
  } catch (e) {
    if ((e as Error).name === 'AbortError') return;
  }
  await navigator.clipboard?.writeText(text).catch(() => {});
  toast({ message: 'Copied — paste it to your cook' });
}

function DishRow({ label, when, dish, keep, onSwap }: { label: string; when: string; dish: DayCook['dinner']; keep?: string; onSwap: () => void }) {
  return (
    <div className="rounded-lg border border-line bg-bg p-3">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-micro font-black uppercase tracking-[0.2em] text-ink-3">
            {label} <span className="text-ink-3/70">· {when}</span>
          </p>
          <p className="font-bold leading-snug">{dish.name}</p>
          <ul className="mt-1 space-y-0.5 text-mini text-ink-2">
            {dish.items.map((i) => (
              <li key={i.food.id}>• {portionText(i.food, i.qty)}</li>
            ))}
          </ul>
          <p className="mt-0.5 font-mono text-tiny text-ink-2">
            {dish.kcal} kcal · <span className="text-accent">{dish.protein} g P</span>
          </p>
          {dish.boosts.length > 0 && (
            <p className="mt-1 inline-flex items-center gap-1 rounded bg-green/10 px-1.5 py-0.5 text-tiny font-semibold text-green">
              <Sparkles className="size-3" /> {boostText(dish.boosts)} of your day
            </p>
          )}
          {keep && <p className="mt-1 text-tiny italic text-ink-3">🧊 {keep}</p>}
        </div>
        <button onClick={onSwap} aria-label={`Swap ${label}`} className="flex h-9 shrink-0 items-center gap-1 rounded-md border border-line px-2.5 text-mini font-bold uppercase text-ink-2">
          <RefreshCw className="size-3.5" /> Swap
        </button>
      </div>
    </div>
  );
}

/** Where tomorrow's protein comes from, as one stacked bar against the target. */
function ProteinPlan({ day, target }: { day: DayCook; target: number }) {
  const parts = [
    { k: 'Breakfast', v: day.breakfast.protein, c: 'var(--amber)' },
    { k: day.lunch.from === 'average' ? 'Lunch (your usual)' : 'Lunch (typical)', v: day.lunch.protein, c: 'var(--sky)' },
    ...(day.whey.scoops ? [{ k: `Whey ×${day.whey.scoops}`, v: day.whey.protein, c: 'var(--purple)' }] : []),
    ...(day.snack.protein ? [{ k: 'Snack', v: Math.round(day.snack.protein), c: 'var(--mint)' }] : []),
    { k: 'Dinner', v: day.dinner.protein, c: 'var(--accent)' },
  ];
  const total = parts.reduce((a, p) => a + p.v, 0);
  const scale = Math.max(target, total) * 1.05;
  return (
    <div className="mb-3">
      <div className="relative flex h-3 overflow-hidden rounded-sm bg-surface-2">
        {parts.map((p, i) => (
          <motion.span key={p.k} className="h-full" style={{ background: p.c }} initial={{ width: 0 }} animate={{ width: `${(p.v / scale) * 100}%` }} transition={{ type: 'spring', stiffness: 80, damping: 18, delay: i * 0.08 }} />
        ))}
        <span className="absolute inset-y-0 w-0.5 bg-ink" style={{ left: `${(target / scale) * 100}%` }} title="Target" />
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-tiny text-ink-2">
        {parts.map((p) => (
          <span key={p.k} className="flex items-center gap-1">
            <i className="size-2 rounded-sm" style={{ background: p.c }} /> {p.k} <b className="font-mono text-ink">{p.v}</b>
          </span>
        ))}
      </div>
    </div>
  );
}

/** Daily whey: scoops logged today vs the goal, with ½ / 1 scoop buttons that log it as food. */
function WheyRow({ w, logs }: { w: WheyPlan; logs: FoodLog[] }) {
  const { create } = useResource<FoodLog>('food_logs');
  const t = today();
  const goal = wheyGoal(t, w);
  const had = logs.filter((l) => l.date === t && (l.food_id === 'whey' || l.food_id === 'protein-shake-milk')).reduce((a, l) => a + l.qty, 0);
  const log = (qty: number) => {
    haptic(10);
    void create({ date: t, meal: mealForNow(), food_id: whey.id, name: whey.name, qty, unit: whey.serving, kcal: whey.kcal * qty, protein: whey.protein * qty, carbs: whey.carbs * qty, fat: whey.fat * qty });
  };
  const pct = goal ? Math.min(1, had / goal) : 0;
  return (
    <div className="mt-2 flex items-center gap-3 rounded-lg border border-line bg-bg p-3">
      <span className="relative grid size-11 shrink-0 place-items-center">
        <svg viewBox="0 0 36 36" className="absolute inset-0 -rotate-90">
          <circle cx="18" cy="18" r="15" fill="none" stroke="var(--surface-2)" strokeWidth="4" />
          <motion.circle cx="18" cy="18" r="15" fill="none" stroke="var(--purple)" strokeWidth="4" strokeLinecap="round" strokeDasharray={94.2} initial={{ strokeDashoffset: 94.2 }} animate={{ strokeDashoffset: 94.2 * (1 - pct) }} />
        </svg>
        <Milk className="size-4 text-purple" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-micro font-black uppercase tracking-[0.2em] text-ink-3">Whey</p>
        <p className="font-bold">
          {had} {goal ? `/ ${goal}` : ''} scoop{had === 1 ? '' : 's'}
          <span className="ml-1 font-mono text-tiny font-normal text-ink-3">{Math.round(had * whey.protein)} g P</span>
        </p>
        {!goal && <p className="text-tiny text-ink-3">{w.scoops} scoops/day starts {shortDay(w.from)}</p>}
      </div>
      <Button size="sm" variant="soft" onClick={() => log(0.5)}>
        +½
      </Button>
      <Button size="sm" onClick={() => log(1)}>
        +1
      </Button>
    </div>
  );
}

/** Tonight's dinner + tomorrow's make-ahead breakfast for the cook, sized around lunch and whey. */
export function CookCard({ target, logs, profile }: { target: { kcal: number; protein: number }; logs: FoodLog[]; profile: Profile }) {
  const { settings, save } = useSettings();
  const { cfg, whey: w, ctx, plan } = useCookPlan(target, logs, profile);
  const toast = useToast();
  const [shop, setShop] = useState(false);
  const [edit, setEdit] = useState(false);
  const t = today();
  const tm = addDays(t, 1);
  const tonight = plan(t);
  const tomorrow = plan(tm);
  if (!tonight || !tomorrow) return null;

  const swap = (date: string, meal: 'breakfast' | 'dinner', d: DayCook) => {
    const names = meal === 'breakfast' ? d.breakfastOptions : d.dinnerOptions;
    const next = names[(names.indexOf(d[meal].name) + 1) % names.length];
    haptic(8);
    save({ cookPicks: { ...settings.cookPicks, [date]: { ...settings.cookPicks?.[date], [meal]: next } } });
  };

  return (
    <div className="mb-4 rounded-xl border border-line bg-surface p-4">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-micro font-black uppercase tracking-[0.25em] text-ink-3">
            <ChefHat className="size-4 text-accent" /> Cook brief · {cfg.at}
          </p>
          <p className="text-xl font-black italic uppercase leading-tight">Tonight & tomorrow</p>
          <p className="text-tiny text-ink-3">
            Tomorrow lands at <b className="text-ink">{tomorrow.total.kcal}</b> / {target.kcal} kcal · <b className="text-ink">{tomorrow.total.protein}</b> / {target.protein} g protein
          </p>
        </div>
        <button onClick={() => setEdit(true)} aria-label="Cook, whey and shopping settings" className="grid size-10 shrink-0 place-items-center rounded-md border border-line text-ink-2">
          <Settings2 className="size-4" />
        </button>
      </div>
      <ProteinPlan day={tomorrow} target={target.protein} />
      {ctx.gaps.length > 0 && (
        <p className="mb-3 text-tiny text-ink-2">
          This week you’re low on <b className="text-yellow">{ctx.gaps.slice(0, 3).map((g) => `${MICRO_META[g.key].label} ${Math.round(((g as { pct?: number }).pct ?? 0) * 100)}%`).join(', ')}</b> — picks lean on dishes rich in them.
        </p>
      )}
      <div className="grid gap-2 sm:grid-cols-2">
        <DishRow label="Dinner" when="tonight" dish={tonight.dinner} onSwap={() => swap(t, 'dinner', tonight)} />
        <DishRow label="Breakfast" when="tomorrow · cooked today" dish={tomorrow.breakfast} keep={tomorrow.breakfast.keep} onSwap={() => swap(tm, 'breakfast', tomorrow)} />
      </div>
      <p className="mt-2 rounded-lg border border-dashed border-line px-3 py-2 text-tiny text-ink-3">
        🥡 <b className="text-ink-2">Lunch: you log it.</b> {ctx.lunch.from === 'average' ? `Planned around your usual ~${ctx.lunch.kcal} kcal / ${ctx.lunch.protein} g.` : `Until you’ve logged a few, ~${ctx.lunch.kcal} kcal / ${ctx.lunch.protein} g is held for it.`}
      </p>
      <WheyRow w={w} logs={logs} />
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button variant="soft" onClick={() => void share(cookBrief(tonight, tomorrow), toast)}>
          <Share2 className="size-4" /> Send brief
        </Button>
        <Button variant="soft" onClick={() => setShop(true)}>
          <ShoppingCart className="size-4" /> Shopping
        </Button>
      </div>
      <ShoppingSheet open={shop} onClose={() => setShop(false)} trips={() => shoppingTrips(t, plan, settings.shops ?? { major: 0, minor: 3 }, w)} />
      <CookSettings open={edit} onClose={() => setEdit(false)} cfg={cfg} whey={w} shops={settings.shops ?? { major: 0, minor: 3 }} onSave={(cook, whey, shops) => save({ cook, whey, shops })} />
    </div>
  );
}

const TRIP_LABEL = { major: 'Big shop', minor: 'Top-up' } as const;

function ShoppingSheet({ open, onClose, trips }: { open: boolean; onClose: () => void; trips: () => Trip[] }) {
  const { data: rows = [] } = useList<ShopRow>('shopping');
  const { create, update, remove } = useResource<ShopRow>('shopping');
  const toast = useToast();
  const [name, setName] = useState('');
  const [tab, setTab] = useState<'major' | 'minor'>('major');
  const plan = useMemo(() => (open ? trips() : []), [open, trips]);
  const trip = plan.find((p) => p.kind === tab);
  const have = new Set(rows.filter((r) => !r.done).map((r) => r.name.toLowerCase()));
  const shown = rows.filter((r) => (r.trip ?? 'major') === tab);
  const keeps = new Map(plan.flatMap((p) => p.items.map((i) => [i.name, i.keeps] as const)));

  const build = async () => {
    // Replace the unbought plan items on both trips; keep hand-added ones and anything ticked.
    for (const r of rows.filter((r) => r.source === 'plan' && !r.done)) remove(r.id);
    let n = 0;
    for (const p of plan) for (const it of p.items) (await create({ name: it.name, qty: it.qty, done: 0, source: 'plan', trip: p.kind }), n++);
    toast({ message: `${n} items over two trips` });
  };
  const add = async (n: string) => {
    if (!n.trim() || have.has(n.trim().toLowerCase())) return;
    await create({ name: n.trim(), qty: null, done: 0, source: 'manual', trip: tab });
    setName('');
  };

  return (
    <Sheet open={open} onClose={onClose} title="Shopping">
      <div className="space-y-4">
        <Segmented
          className="w-full"
          value={tab}
          onChange={setTab}
          options={plan.map((p) => ({ value: p.kind, label: `${TRIP_LABEL[p.kind]} · ${DOW[parseDate(p.date).getDay()]} ${parseDate(p.date).getDate()}` }))}
        />
        {trip && (
          <p className="text-tiny text-ink-3">
            {tab === 'major' ? 'Everything that keeps a week, plus fresh things' : 'Fresh things'} for cooking {shortDay(trip.covers[0])} → {shortDay(trip.covers[1])}.
            {tab === 'major' ? ' Short-life items (bread, paneer, milk, greens) for later in the week wait for the top-up.' : ''}
          </p>
        )}
        <Button className="w-full" onClick={() => void build()}>
          <RefreshCw className="size-4" /> Build both lists from the meal plan
        </Button>
        <form onSubmit={(e) => (e.preventDefault(), void add(name))} className="flex gap-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={`Add to the ${TRIP_LABEL[tab].toLowerCase()}`} enterKeyHint="done" />
          <Button type="submit" variant="soft" disabled={!name.trim()}>
            <Plus className="size-4" />
          </Button>
        </form>
        <ul className="space-y-1">
          {shown.map((r) => {
            const k = keeps.get(r.name);
            return (
              <motion.li key={r.id} layout className="flex items-center gap-3 rounded-md bg-bg px-3 py-2.5">
                <button onClick={() => update({ id: r.id, done: r.done ? 0 : 1 })} aria-label={`Bought ${r.name}`} className={cx('grid size-6 shrink-0 place-items-center rounded-md border-2', r.done ? 'border-green bg-green text-black' : 'border-line')}>
                  {!!r.done && <Check className="size-4" />}
                </button>
                <span className={cx('min-w-0 flex-1', r.done && 'text-ink-3 line-through')}>
                  {r.name}
                  {k != null && k < 7 && <span className="ml-1.5 rounded bg-amber/15 px-1 text-micro font-bold text-amber">keeps ~{k}d</span>}
                </span>
                {r.qty && <span className="shrink-0 font-mono text-mini text-ink-2">{r.qty}</span>}
                <button onClick={() => remove(r.id)} aria-label={`Remove ${r.name}`} className="text-ink-3">
                  <Trash2 className="size-4" />
                </button>
              </motion.li>
            );
          })}
        </ul>
        {shown.length === 0 && <p className="text-center text-sm text-ink-3">Empty — build it from the plan or add items.</p>}
        {shown.some((r) => r.done) && (
          <Button size="sm" variant="ghost" onClick={() => shown.filter((r) => r.done).forEach((r) => remove(r.id))}>
            Clear bought
          </Button>
        )}
        <div>
          <p className="mb-2 text-micro font-black uppercase tracking-[0.2em] text-ink-3">Veg protein staples</p>
          <div className="flex flex-wrap gap-1.5">
            {PROTEIN_STAPLES.map((s) => (
              <button key={s} disabled={have.has(s.toLowerCase())} onClick={() => void add(s)} className="rounded-md border border-line px-2.5 py-1.5 text-mini text-ink-2 disabled:opacity-35">
                + {s}
              </button>
            ))}
          </div>
        </div>
      </div>
    </Sheet>
  );
}

function CookSettings({ open, onClose, cfg, whey: w, shops, onSave }: { open: boolean; onClose: () => void; cfg: CookConfig; whey: WheyPlan; shops: { major: number; minor: number }; onSave: (c: CookConfig, w: WheyPlan, s: { major: number; minor: number }) => void }) {
  const [d, setD] = useState(cfg);
  const [wp, setWp] = useState(w);
  const [sh, setSh] = useState(shops);
  const [was, setWas] = useState(open);
  if (open !== was) (setWas(open), open && (setD(cfg), setWp(w), setSh(shops)));
  const label = 'text-micro font-black uppercase tracking-[0.2em] text-ink-3';
  const dayPick = (v: number, on: (n: number) => void) => (
    <div className="mt-2 grid grid-cols-7 gap-1">
      {DOW.map((x, i) => (
        <button key={x} onClick={() => on(i)} className={cx('h-9 rounded-md text-mini font-bold uppercase', v === i ? 'bg-accent text-white' : 'bg-surface-2 text-ink-2')}>
          {x.slice(0, 2)}
        </button>
      ))}
    </div>
  );
  return (
    <Sheet open={open} onClose={onClose} title="Cook, whey & shopping">
      <div className="space-y-5">
        <label className="block">
          <span className={label}>Cook arrives at</span>
          <input type="time" value={d.at} onChange={(e) => setD({ ...d, at: e.target.value })} className="field mt-2 w-40" />
          <span className="mt-1 block text-tiny text-ink-3">The brief is pushed 15 minutes before.</span>
        </label>
        <div>
          <p className={label}>Whey per day</p>
          <div className="mt-2 grid grid-cols-5 gap-1.5">
            {[1, 1.5, 2, 2.5, 3].map((n) => (
              <button key={n} onClick={() => setWp({ ...wp, scoops: n })} className={cx('h-10 rounded-md font-mono text-sm font-bold', wp.scoops === n ? 'bg-purple text-white' : 'bg-surface-2 text-ink-2')}>
                {n}
              </button>
            ))}
          </div>
          <label className="mt-2 flex items-center gap-2 text-sm text-ink-2">
            from <input type="date" value={wp.from} onChange={(e) => setWp({ ...wp, from: e.target.value })} className="field h-9 w-44" />
          </label>
          <span className="mt-1 block text-tiny text-ink-3">{wp.scoops} scoops = {Math.round(wp.scoops * 24)} g protein, counted before breakfast and dinner are sized.</span>
        </div>
        <div>
          <p className={label}>Big shop day</p>
          {dayPick(sh.major, (n) => setSh({ ...sh, major: n }))}
          <p className={cx(label, 'mt-3')}>Top-up day (fresh things)</p>
          {dayPick(sh.minor, (n) => setSh({ ...sh, minor: n }))}
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={d.remind} onChange={(e) => setD({ ...d, remind: e.target.checked })} className="size-5 accent-[var(--accent)]" /> Push the cook brief
        </label>
        <Button className="w-full" onClick={() => (onSave(d, wp, sh), onClose())}>
          Save
        </Button>
      </div>
    </Sheet>
  );
}
