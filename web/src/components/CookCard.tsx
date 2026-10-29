import { useState } from 'react';
import { motion } from 'motion/react';
import { Check, ChefHat, Plus, RefreshCw, Settings2, Share2, ShoppingCart, Trash2 } from 'lucide-react';
import { useList, useResource, useSettings } from '../lib/api';
import { addDays, haptic, today } from '../lib/format';
import { FOODS } from '../core/foods';
import { PROTEIN_STAPLES, cookBrief, cookConfig, planCookDay, shoppingList, type CookConfig, type DayCook } from '../core/cook';
import { workConfig, workDay } from '../core/work';
import { portionText } from '../core/portion';
import type { FoodLog, SavedMeal, ShopRow } from '../lib/types';
import { Button, Input, Sheet, cx } from './ui';
import { useToast } from './toast';

const byId = new Map(FOODS.map((f) => [f.id, f]));

/** Plan any date with the user's settings; shared by the card, the brief and the shopping list. */
export function useCookPlan(target: { kcal: number; protein: number }) {
  const { settings } = useSettings();
  const cfg = cookConfig(settings.cook);
  const wc = workConfig(settings.work);
  const plan = (date: string) => planCookDay(date, { target, office: workDay(date, wc, settings.workOverrides).mode === 'office', cfg, diet: settings.diet ?? 'veg', picks: settings.cookPicks?.[date] });
  return { cfg, plan };
}

async function share(text: string, toast: ReturnType<typeof useToast>) {
  try {
    if (navigator.share) return void (await navigator.share({ text }));
  } catch (e) {
    if ((e as Error).name === 'AbortError') return;
  }
  await navigator.clipboard?.writeText(text).catch(() => {});
  toast({ message: 'Brief copied — paste it to your cook' });
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
          {keep && <p className="mt-1 text-tiny italic text-ink-3">🧊 {keep}</p>}
        </div>
        <button onClick={onSwap} aria-label={`Swap ${label}`} className="flex h-9 shrink-0 items-center gap-1 rounded-md border border-line px-2.5 text-mini font-bold uppercase text-ink-2">
          <RefreshCw className="size-3.5" /> Swap
        </button>
      </div>
    </div>
  );
}

/** Tonight's dinner + tomorrow's make-ahead breakfast for the 4 pm cook, and the rice-bowl lunch. */
export function CookCard({ target, logs }: { target: { kcal: number; protein: number }; logs: FoodLog[] }) {
  const { settings, save } = useSettings();
  const { cfg, plan } = useCookPlan(target);
  const { create } = useResource<FoodLog>('food_logs');
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
  const lunchLogged = logs.some((l) => l.date === t && l.meal === 'lunch');
  const logLunch = async () => {
    for (const [id, qty] of cfg.lunch.items) {
      const f = byId.get(id);
      if (f) await create({ date: t, meal: 'lunch', food_id: f.id, name: id === 'poke-bowl' ? cfg.lunch.name : f.name, qty, unit: f.serving, kcal: f.kcal * qty, protein: f.protein * qty, carbs: f.carbs * qty, fat: f.fat * qty });
    }
    toast({ message: `${cfg.lunch.name} logged` });
  };

  return (
    <div className="mb-4 rounded-xl border border-line bg-surface p-4">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <p className="flex items-center gap-2 text-micro font-black uppercase tracking-[0.25em] text-ink-3">
            <ChefHat className="size-4 text-accent" /> Cook brief · {cfg.at}
          </p>
          <p className="text-xl font-black italic uppercase leading-tight">Tonight & tomorrow</p>
          <p className="text-tiny text-ink-3">
            Tomorrow lands at <b className="text-ink">{tomorrow.total.kcal}</b> / {target.kcal} kcal · <b className="text-ink">{tomorrow.total.protein}</b> / {target.protein} g protein
          </p>
        </div>
        <button onClick={() => setEdit(true)} aria-label="Cook settings" className="grid size-10 shrink-0 place-items-center rounded-md border border-line text-ink-2">
          <Settings2 className="size-4" />
        </button>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <DishRow label="Dinner" when="tonight" dish={tonight.dinner} onSwap={() => swap(t, 'dinner', tonight)} />
        <DishRow label="Breakfast" when="tomorrow · cooked today" dish={tomorrow.breakfast} keep={tomorrow.breakfast.keep} onSwap={() => swap(tm, 'breakfast', tomorrow)} />
      </div>
      {tonight.lunch && (
        <div className="mt-2 flex items-center gap-3 rounded-lg border border-line bg-bg p-3">
          <span className="text-2xl">🥗</span>
          <div className="min-w-0 flex-1">
            <p className="text-micro font-black uppercase tracking-[0.2em] text-ink-3">Lunch · every {cfg.lunchDays === 'all' ? 'day' : 'office day'}</p>
            <p className="font-bold">{cfg.lunch.name}</p>
            <p className="font-mono text-tiny text-ink-2">
              {Math.round(tonight.lunch.kcal)} kcal · {Math.round(tonight.lunch.protein)} g P
            </p>
          </div>
          {lunchLogged ? (
            <span className="flex items-center gap-1 text-mini font-bold uppercase text-green">
              <Check className="size-4" /> Logged
            </span>
          ) : (
            <Button size="sm" onClick={() => void logLunch()}>
              <Plus className="size-4" /> Log
            </Button>
          )}
        </div>
      )}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button variant="soft" onClick={() => void share(cookBrief(tonight, tomorrow), toast)}>
          <Share2 className="size-4" /> Send brief
        </Button>
        <Button variant="soft" onClick={() => setShop(true)}>
          <ShoppingCart className="size-4" /> Shopping
        </Button>
      </div>
      <ShoppingSheet open={shop} onClose={() => setShop(false)} days={() => Array.from({ length: 7 }, (_, i) => plan(addDays(t, i + 1))).filter((d): d is DayCook => !!d)} cfg={cfg} />
      <CookSettings open={edit} onClose={() => setEdit(false)} cfg={cfg} onSave={(cook) => save({ cook })} />
    </div>
  );
}

function ShoppingSheet({ open, onClose, days, cfg }: { open: boolean; onClose: () => void; days: () => DayCook[]; cfg: CookConfig }) {
  const { data: rows = [] } = useList<ShopRow>('shopping');
  const { create, update, remove } = useResource<ShopRow>('shopping');
  const toast = useToast();
  const [name, setName] = useState('');
  const have = new Set(rows.filter((r) => !r.done).map((r) => r.name.toLowerCase()));

  const build = async () => {
    // Replace the unbought plan items; keep hand-added ones and anything already ticked.
    for (const r of rows.filter((r) => r.source === 'plan' && !r.done)) remove(r.id);
    const list = shoppingList(days(), cfg);
    for (const it of list) await create({ name: it.name, qty: it.qty, done: 0, source: 'plan' });
    toast({ message: `${list.length} items for the next 7 days` });
  };
  const add = async (n: string) => {
    if (!n.trim() || have.has(n.trim().toLowerCase())) return;
    await create({ name: n.trim(), qty: null, done: 0, source: 'manual' });
    setName('');
  };

  return (
    <Sheet open={open} onClose={onClose} title="Shopping list">
      <div className="space-y-4">
        <Button className="w-full" onClick={() => void build()}>
          <RefreshCw className="size-4" /> Build from next 7 days of meals
        </Button>
        <form onSubmit={(e) => (e.preventDefault(), void add(name))} className="flex gap-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Add an item" enterKeyHint="done" />
          <Button type="submit" variant="soft" disabled={!name.trim()}>
            <Plus className="size-4" />
          </Button>
        </form>
        <ul className="space-y-1">
          {rows.map((r) => (
            <motion.li key={r.id} layout className="flex items-center gap-3 rounded-md bg-bg px-3 py-2.5">
              <button onClick={() => update({ id: r.id, done: r.done ? 0 : 1 })} aria-label={`Bought ${r.name}`} className={cx('grid size-6 shrink-0 place-items-center rounded-md border-2', r.done ? 'border-green bg-green text-black' : 'border-line')}>
                {!!r.done && <Check className="size-4" />}
              </button>
              <span className={cx('flex-1', r.done && 'text-ink-3 line-through')}>{r.name}</span>
              {r.qty && <span className="font-mono text-mini text-ink-2">{r.qty}</span>}
              <button onClick={() => remove(r.id)} aria-label={`Remove ${r.name}`} className="text-ink-3">
                <Trash2 className="size-4" />
              </button>
            </motion.li>
          ))}
        </ul>
        {rows.length === 0 && <p className="text-center text-sm text-ink-3">Empty — build it from the plan or add items.</p>}
        {rows.some((r) => r.done) && (
          <Button size="sm" variant="ghost" onClick={() => rows.filter((r) => r.done).forEach((r) => remove(r.id))}>
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

function CookSettings({ open, onClose, cfg, onSave }: { open: boolean; onClose: () => void; cfg: CookConfig; onSave: (c: CookConfig) => void }) {
  const { data: saved = [] } = useList<SavedMeal>('saved_meals');
  const [d, setD] = useState(cfg);
  const [was, setWas] = useState(open);
  if (open !== was) (setWas(open), open && setD(cfg));
  const label = 'text-micro font-black uppercase tracking-[0.2em] text-ink-3';
  return (
    <Sheet open={open} onClose={onClose} title="Cook & lunch">
      <div className="space-y-5">
        <label className="block">
          <span className={label}>Cook arrives at</span>
          <input type="time" value={d.at} onChange={(e) => setD({ ...d, at: e.target.value })} className="field mt-2 w-40" />
          <span className="mt-1 block text-tiny text-ink-3">The brief is pushed 15 minutes before.</span>
        </label>
        <div>
          <p className={label}>Lunch</p>
          <Input className="mt-2" value={d.lunch.name} onChange={(e) => setD({ ...d, lunch: { ...d.lunch, name: e.target.value } })} />
          <div className="mt-2 grid grid-cols-2 gap-2">
            {(['all', 'office'] as const).map((x) => (
              <button key={x} onClick={() => setD({ ...d, lunchDays: x })} className={cx('h-10 rounded-md text-mini font-bold uppercase', d.lunchDays === x ? 'bg-accent text-white' : 'bg-surface-2 text-ink-2')}>
                {x === 'all' ? 'Every day' : 'Office days only'}
              </button>
            ))}
          </div>
          {saved.length > 0 && (
            <>
              <p className="mt-3 text-tiny text-ink-3">Use one of your saved meals for the exact bowl:</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                <button onClick={() => setD({ ...d, lunch: { name: 'Healthy rice bowl', items: [['poke-bowl', 1]] } })} className="rounded-md border border-line px-2.5 py-1.5 text-mini">
                  Default bowl (550 kcal)
                </button>
                {saved.map((m) => {
                  const items = (JSON.parse(m.items) as { food_id: string | null; qty: number }[]).filter((i) => i.food_id).map((i) => [i.food_id!, i.qty] as [string, number]);
                  return (
                    <button key={m.id} onClick={() => setD({ ...d, lunch: { name: m.name, items } })} className="rounded-md border border-line px-2.5 py-1.5 text-mini">
                      {m.name}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
        <div>
          <p className={label}>Evening snack</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {[
              { k: 'Whey in milk', v: [['protein-shake-milk', 1]] as [string, number][] },
              { k: 'None', v: [] as [string, number][] },
            ].map((x) => (
              <button key={x.k} onClick={() => setD({ ...d, snack: x.v })} className={cx('h-10 rounded-md text-mini font-bold uppercase', JSON.stringify(d.snack) === JSON.stringify(x.v) ? 'bg-accent text-white' : 'bg-surface-2 text-ink-2')}>
                {x.k}
              </button>
            ))}
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={d.remind} onChange={(e) => setD({ ...d, remind: e.target.checked })} className="size-5 accent-[var(--accent)]" /> Push the cook brief
        </label>
        <Button className="w-full" onClick={() => (onSave(d), onClose())}>
          Save
        </Button>
      </div>
    </Sheet>
  );
}
