// Cook plan: the cook comes in the afternoon (default 16:00) and makes tonight's dinner plus a
// breakfast that keeps overnight for tomorrow. Lunch is the fixed rice bowl. This module picks
// both dishes so the day lands on the calorie/protein target, writes the brief to hand the cook,
// and turns a week of plans into a shopping list. Pure: no React, no I/O.

import { FOODS, type Diet } from './foods';
import { COMBOS, fit, type Suggestion } from './mealPlan';
import { portionText } from './portion';

type Item = [id: string, qty: number];
export type Dish = { name: string; items: Item[]; keep: string };

/** Breakfasts that are cooked in the afternoon and still good the next morning (veg, protein-forward). */
export const MAKE_AHEAD: Dish[] = [
  { name: 'Paneer paratha & curd', items: [['paneer-paratha', 2], ['curd', 1]], keep: 'Wrap parathas in foil, fridge. Tawa 1 min each side.' },
  { name: 'Moong dal chilla & green chutney', items: [['moong-chilla', 3], ['green-chutney', 1], ['curd', 1]], keep: 'Box in the fridge. Tawa or microwave 40 s.' },
  { name: 'Paneer-stuffed besan chilla', items: [['besan-chilla', 2], ['paneer', 0.5], ['curd', 1]], keep: 'Fridge. Reheat on tawa.' },
  { name: 'Dhokla & whey milk', items: [['dhokla', 1.5], ['green-chutney', 1], ['protein-shake-milk', 1]], keep: 'Dhokla in a box (room temp or fridge), eat as is. Shake fresh in the morning.' },
  { name: 'Idli sambar', items: [['idli', 4], ['sambar', 1]], keep: 'Idlis in a casserole, sambar in the fridge — microwave 1 min.' },
  { name: 'Sprouts chaat & paneer', items: [['sprouts', 1.5], ['paneer', 0.5], ['curd', 1]], keep: 'Fridge; add lemon and onion in the morning. Eat cold.' },
  { name: 'Soya bhurji rolls', items: [['roti', 2], ['soya-bhurji', 1]], keep: 'Bhurji in the fridge, rotis in foil. Warm and roll.' },
  { name: 'Methi thepla & curd', items: [['thepla', 3], ['curd', 1]], keep: 'Thepla keeps 2 days without a fridge.' },
  { name: 'Overnight oats with whey', items: [['oats-milk', 1], ['whey', 1], ['banana', 1]], keep: 'Mix oats, milk and whey in a jar tonight; fridge. Eat cold with banana.' },
  { name: 'Handvo & curd', items: [['handvo', 2], ['curd', 1]], keep: 'Fridge. Tawa or microwave 1 min.' },
  { name: 'Paneer bhurji sandwich', items: [['bread-brown', 3], ['paneer-bhurji', 1]], keep: 'Bhurji in the fridge; toast and fill in the morning.' },
];

export type CookConfig = {
  /** When the cook arrives (HH:MM). */
  at: string;
  /** The fixed lunch, logged in one tap. */
  lunch: { name: string; items: Item[] };
  /** Lunch is the rice bowl every day, or only on office days. */
  lunchDays: 'all' | 'office';
  /** Fixed evening snack, if any. */
  snack: Item[];
  /** Push the brief 15 min before the cook arrives. */
  remind: boolean;
};
export const DEFAULT_COOK: CookConfig = { at: '16:00', lunch: { name: 'Healthy rice bowl', items: [['poke-bowl', 1]] }, lunchDays: 'all', snack: [['protein-shake-milk', 1]], remind: true };
export const cookConfig = (c?: Partial<CookConfig> | null): CookConfig => ({ ...DEFAULT_COOK, ...(c ?? {}) });

const byId = new Map(FOODS.map((f) => [f.id, f]));
const sum = (items: Item[]) =>
  items.reduce((a, [id, q]) => {
    const f = byId.get(id);
    return f ? { kcal: a.kcal + f.kcal * q, protein: a.protein + f.protein * q } : a;
  }, { kcal: 0, protein: 0 });

/** Stable per-date number so the same day always gets the same pick (brief, list and app agree). */
const dayNo = (d: string) => Math.round(Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) / 86_400_000);

export type DayCook = {
  date: string;
  lunch: { name: string; kcal: number; protein: number } | null;
  snack: { kcal: number; protein: number };
  breakfast: Suggestion & { keep: string };
  dinner: Suggestion;
  /** All four meals together vs the day's target. */
  total: { kcal: number; protein: number };
  breakfastOptions: string[];
  dinnerOptions: string[];
};

/**
 * Plan one day's meals: fixed lunch and snack first, then a make-ahead breakfast and a dinner sized
 * to what's left (breakfast ~40 %, dinner ~60 %). Among the well-fitting options the pick rotates by
 * date; `picks` (by name) lets the user swap one.
 */
export function planCookDay(date: string, opts: { target: { kcal: number; protein: number }; office: boolean; cfg: CookConfig; diet: Diet; picks?: { breakfast?: string; dinner?: string } }): DayCook | null {
  const { cfg, target } = opts;
  const lunchOn = cfg.lunchDays === 'all' || opts.office;
  const lunch = lunchOn ? { name: cfg.lunch.name, ...sum(cfg.lunch.items) } : null;
  const snack = sum(cfg.snack);
  // Without the rice bowl, lunch still needs ~35 % of the day.
  const left = { kcal: target.kcal - (lunch?.kcal ?? target.kcal * 0.35) - snack.kcal, protein: target.protein - (lunch?.protein ?? target.protein * 0.35) - snack.protein };
  const choose = <T extends { name: string }>(cands: (T & { score: number })[], pick: string | undefined, salt: number) => {
    const sorted = cands.sort((a, b) => a.score - b.score);
    const good = sorted.filter((c) => c.score <= sorted[0].score + 0.25).slice(0, 4);
    return { chosen: sorted.find((c) => c.name === pick) ?? good[(dayNo(date) + salt) % good.length], names: sorted.map((c) => c.name) };
  };
  const bTarget = { kcal: Math.max(250, left.kcal * 0.4), protein: Math.max(15, left.protein * 0.45) };
  const bCands = MAKE_AHEAD.map((d) => {
    const s = fit(d, bTarget, new Set(), opts.diet);
    return s && { ...s, keep: d.keep };
  }).filter((x): x is Suggestion & { score: number; keep: string } => !!x);
  const dTarget = { kcal: Math.max(300, left.kcal * 0.6), protein: Math.max(15, left.protein * 0.55) };
  const dCands = COMBOS.dinner.map((c) => fit(c, dTarget, new Set(), opts.diet)).filter((x): x is Suggestion & { score: number } => !!x);
  if (!bCands.length || !dCands.length) return null;
  const b = choose(bCands, opts.picks?.breakfast, 0);
  const d = choose(dCands, opts.picks?.dinner, 1);
  const { score: _b, ...breakfast } = b.chosen;
  const { score: _d, ...dinner } = d.chosen;
  return {
    date,
    lunch,
    snack,
    breakfast,
    dinner,
    total: { kcal: Math.round(breakfast.kcal + dinner.kcal + (lunch?.kcal ?? 0) + snack.kcal), protein: Math.round(breakfast.protein + dinner.protein + (lunch?.protein ?? 0) + snack.protein) },
    breakfastOptions: b.names,
    dinnerOptions: d.names,
  };
}

/** "3 rotis", "Matar paneer · 1½ katori (~225 g)" — portions the cook can follow. */
const portion = (it: { food: { id: string; name: string; serving: string }; qty: number }) => portionText(it.food, it.qty);

/** Text to send the cook (WhatsApp-ready): tonight's dinner and tomorrow's make-ahead breakfast. */
export function cookBrief(tonight: DayCook | null, tomorrow: DayCook | null) {
  const lines = ['🍳 Cook brief'];
  if (tonight) lines.push('', `Dinner tonight: ${tonight.dinner.items.map(portion).join(', ')}`);
  if (tomorrow) lines.push('', `Breakfast for tomorrow (keep aside): ${tomorrow.breakfast.items.filter((i) => !['protein-shake-milk', 'whey', 'banana'].includes(i.food.id)).map(portion).join(', ')}`, `→ ${tomorrow.breakfast.keep}`);
  lines.push('', 'No egg, meat or fish. Less oil please 🙏');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------------------------
// Shopping list
// ---------------------------------------------------------------------------------------------
type Unit = 'g' | 'ml' | 'pcs';
/** Raw ingredients per serving of a dish (only the dishes this planner uses). */
const RAW: Record<string, [string, number, Unit][]> = {
  'paneer-paratha': [['Atta', 60, 'g'], ['Paneer', 50, 'g']],
  curd: [['Curd', 100, 'g']],
  'moong-chilla': [['Moong dal (yellow)', 35, 'g']],
  'green-chutney': [['Coriander & mint', 15, 'g']],
  'besan-chilla': [['Besan', 40, 'g']],
  paneer: [['Paneer', 100, 'g']],
  dhokla: [['Besan', 60, 'g']],
  'protein-shake-milk': [['Whey protein', 30, 'g'], ['Milk', 250, 'ml']],
  idli: [['Idli/dosa batter', 60, 'g']],
  sambar: [['Toor dal', 25, 'g'], ['Mixed vegetables', 60, 'g']],
  sprouts: [['Moong sprouts', 80, 'g'], ['Onion', 0.25, 'pcs'], ['Tomato', 0.25, 'pcs']],
  'soya-bhurji': [['Soya chunks', 40, 'g'], ['Onion', 0.5, 'pcs'], ['Tomato', 0.5, 'pcs']],
  roti: [['Atta', 35, 'g']],
  thepla: [['Atta', 35, 'g'], ['Methi', 10, 'g']],
  'oats-milk': [['Oats', 40, 'g'], ['Milk', 200, 'ml']],
  whey: [['Whey protein', 30, 'g']],
  banana: [['Banana', 1, 'pcs']],
  handvo: [['Handvo flour', 60, 'g'], ['Lauki', 30, 'g']],
  'bread-brown': [['Brown bread', 1, 'pcs']],
  'paneer-bhurji': [['Paneer', 100, 'g'], ['Onion', 0.5, 'pcs'], ['Tomato', 0.5, 'pcs']],
  'dal-tadka': [['Toor dal', 40, 'g']],
  lauki: [['Lauki', 200, 'g']],
  khichdi: [['Rice', 30, 'g'], ['Moong dal (yellow)', 25, 'g']],
  'tofu-bhurji': [['Tofu', 100, 'g'], ['Onion', 0.5, 'pcs']],
  'matar-paneer': [['Paneer', 70, 'g'], ['Green peas', 50, 'g'], ['Tomato', 1, 'pcs']],
  raita: [['Curd', 100, 'g'], ['Cucumber', 0.5, 'pcs']],
  salad: [['Cucumber', 0.5, 'pcs'], ['Tomato', 0.5, 'pcs'], ['Onion', 0.5, 'pcs']],
  'poke-bowl': [['Rice', 60, 'g'], ['Chana / rajma (dry)', 30, 'g'], ['Paneer', 50, 'g'], ['Mixed vegetables', 120, 'g']],
};

/** Always-useful vegetarian protein staples, shown with the generated list. */
export const PROTEIN_STAPLES = ['Paneer', 'Curd', 'Greek yogurt', 'Soya chunks', 'Tofu', 'Moong dal (yellow)', 'Moong sprouts', 'Chana / rajma (dry)', 'Whey protein', 'Milk', 'Peanut butter', 'Roasted chana'];

export type ShopItem = { name: string; qty: string };

const fmtQty = (n: number, u: Unit) => {
  if (u === 'pcs') return `${Math.ceil(n)}`;
  if (n >= 1000) return `${Math.round(n / 100) / 10} ${u === 'g' ? 'kg' : 'L'}`;
  // Round up to a sensible buying step.
  return `${Math.ceil(n / 50) * 50} ${u}`;
};

/** Aggregate the raw ingredients for a set of planned days (the rice bowl counted per lunch). */
export function shoppingList(days: DayCook[], cfg: CookConfig): ShopItem[] {
  const acc = new Map<string, { n: number; u: Unit }>();
  const add = (items: { food: { id: string }; qty: number }[]) => {
    for (const it of items)
      for (const [name, n, u] of RAW[it.food.id] ?? []) {
        const cur = acc.get(name) ?? { n: 0, u };
        acc.set(name, { n: cur.n + n * it.qty, u });
      }
  };
  for (const d of days) {
    add(d.breakfast.items);
    add(d.dinner.items);
    if (d.lunch) add(cfg.lunch.items.map(([id, qty]) => ({ food: { id }, qty })));
    add(cfg.snack.map(([id, qty]) => ({ food: { id }, qty })));
  }
  return [...acc.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([name, { n, u }]) => ({ name, qty: fmtQty(n, u) }));
}
