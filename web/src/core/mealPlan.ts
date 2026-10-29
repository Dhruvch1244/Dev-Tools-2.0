// Time-aware day plan: where the user is in the day (which meals are done, which is next), how the
// remaining calories/protein split across the meals still to come, and concrete vegetarian combos
// sized to fit. Rule-based on purpose — instant, offline, and predictable. Pure, no React.

import { FOODS, allowedFor, type Diet, type Food } from './foods';

export type MealId = 'breakfast' | 'lunch' | 'snacks' | 'dinner';

/** Suggested time and the window in which the meal counts as "now". */
export const MEAL_TIMES: Record<MealId, { at: string; from: string; to: string; share: number }> = {
  breakfast: { at: '08:30', from: '07:00', to: '10:30', share: 0.25 },
  lunch: { at: '13:30', from: '12:30', to: '15:00', share: 0.35 },
  snacks: { at: '17:00', from: '16:00', to: '18:30', share: 0.1 },
  dinner: { at: '20:30', from: '19:30', to: '22:30', share: 0.3 },
};
const ORDER: MealId[] = ['breakfast', 'lunch', 'snacks', 'dinner'];

type Item = [id: string, qty: number];
/** Home-style vegetarian combos per meal. Quantities are a starting point; they get scaled to fit. */
export const COMBOS: Record<MealId, { name: string; items: Item[] }[]> = {
  breakfast: [
    { name: 'Poha & chai', items: [['poha', 1], ['chai', 1]] },
    { name: 'Besan chilla & curd', items: [['besan-chilla', 2], ['curd', 1]] },
    { name: 'Idli sambar', items: [['idli', 3], ['sambar', 1]] },
    { name: 'Oats, milk & banana', items: [['oats-milk', 1], ['banana', 1]] },
    { name: 'Paneer paratha & curd', items: [['paneer-paratha', 1], ['curd', 1]] },
    { name: 'Moong chilla & chai', items: [['moong-chilla', 2], ['chai', 1]] },
    { name: 'Upma & buttermilk', items: [['upma', 1], ['chaas', 1]] },
  ],
  lunch: [
    { name: 'Roti, dal, sabzi, curd', items: [['roti', 2], ['dal-tadka', 1], ['mix-veg', 1], ['curd', 1]] },
    { name: 'Rajma chawal & curd', items: [['rajma', 1], ['rice', 1], ['curd', 1], ['salad', 1]] },
    { name: 'Roti, chole, raita', items: [['roti', 2], ['chole', 1], ['raita', 1]] },
    { name: 'Rice, sambar, poriyal, curd', items: [['rice', 1], ['sambar', 1], ['poriyal', 1], ['curd', 1]] },
    { name: 'Roti, palak paneer, dal', items: [['roti', 2], ['palak-paneer', 1], ['dal-tadka', 1]] },
    { name: 'Roti, soya curry, salad', items: [['roti', 2], ['soya-curry', 1], ['salad', 1]] },
  ],
  snacks: [
    { name: 'Whey shake', items: [['whey', 1]] },
    { name: 'Sprouts salad', items: [['sprouts', 1]] },
    { name: 'Roasted chana & green tea', items: [['roasted-chana', 1], ['green-tea', 1]] },
    { name: 'Greek yogurt & banana', items: [['greek-yogurt', 1.5], ['banana', 1]] },
    { name: 'Makhana & chai', items: [['makhana', 1], ['chai', 1]] },
    { name: 'Peanuts & apple', items: [['peanuts', 1], ['apple', 1]] },
    { name: 'Dhokla', items: [['dhokla', 1]] },
  ],
  dinner: [
    { name: 'Roti, paneer bhurji, salad', items: [['roti', 2], ['paneer-bhurji', 1], ['salad', 1]] },
    { name: 'Roti, dal, lauki', items: [['roti', 2], ['dal-tadka', 1], ['lauki', 1]] },
    { name: 'Khichdi & curd', items: [['khichdi', 1.5], ['curd', 1]] },
    { name: 'Moong chilla & curd', items: [['moong-chilla', 2], ['curd', 1]] },
    { name: 'Roti, soya bhurji, salad', items: [['roti', 2], ['soya-bhurji', 1], ['salad', 1]] },
    { name: 'Tofu bhurji & roti', items: [['tofu-bhurji', 1], ['roti', 2]] },
    { name: 'Roti, matar paneer, raita', items: [['roti', 2], ['matar-paneer', 1], ['raita', 1]] },
  ],
};

export type PlanItem = { food: Food; qty: number };
export type Suggestion = { name: string; items: PlanItem[]; kcal: number; protein: number };
export type MealStatus = 'done' | 'now' | 'late' | 'next' | 'later' | 'skipped';
export type MealPlan = {
  meal: MealId;
  at: string;
  status: MealStatus;
  logged: { kcal: number; protein: number };
  target?: { kcal: number; protein: number };
  options: Suggestion[];
};

const byId = new Map(FOODS.map((f) => [f.id, f]));
const SIDES = new Set(['chai', 'green-tea', 'salad', 'banana', 'apple', 'chaas', 'curd', 'raita']);
const totals = (items: PlanItem[]) => ({
  kcal: Math.round(items.reduce((a, i) => a + i.food.kcal * i.qty, 0)),
  protein: Math.round(items.reduce((a, i) => a + i.food.protein * i.qty, 0)),
});
/** Whole numbers for countable things (roti, idli, chilla, pieces); half steps otherwise. */
const roundQty = (f: Food, q: number) => (/piece|^\d+ (medium|large)|^1 (roti|idli)/i.test(f.serving) || ['roti', 'idli', 'besan-chilla', 'moong-chilla', 'thepla', 'paneer-paratha', 'bread-brown', 'handvo'].includes(f.id) ? Math.max(1, Math.round(q)) : Math.max(0.5, Math.round(q * 2) / 2));

/** Size a combo toward a kcal target (0.75×–1.5×) and score fit: calories close, protein not short. */
export function fit(combo: { name: string; items: Item[] }, target: { kcal: number; protein: number }, usual: Set<string>, diet: Diet): (Suggestion & { score: number }) | null {
  const base = combo.items.map(([id, qty]) => ({ food: byId.get(id), qty }));
  if (base.some((b) => !b.food || !allowedFor(diet, b.food.id))) return null;
  let best: (Suggestion & { score: number }) | null = null;
  for (const k of [0.75, 1, 1.25, 1.5]) {
    // Sides stay at a normal portion (nobody has 1.5 cups of chai); only the main dishes scale.
    const items = base.map((b) => ({ food: b.food!, qty: SIDES.has(b.food!.id) ? b.qty : roundQty(b.food!, b.qty * k) }));
    const t = totals(items);
    const score = Math.abs(t.kcal - target.kcal) / Math.max(target.kcal, 150) + 1.2 * (Math.max(0, target.protein - t.protein) / Math.max(target.protein, 10)) - 0.08 * items.filter((i) => usual.has(i.food.id)).length;
    if (!best || score < best.score) best = { name: combo.name, items, ...t, score };
  }
  return best;
}

const toMin = (hm: string) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5));

/**
 * The plan for today. `logged` is today's per-meal totals, `remaining` is what's left of the day's
 * target, `nowHM` the local time. Meals already logged are done; meals whose window has passed with
 * nothing logged are "skipped" unless it's within 90 minutes ("late" — still worth eating).
 */
export function planDay(opts: {
  nowHM: string;
  logged: Record<MealId, { kcal: number; protein: number }>;
  remaining: { kcal: number; protein: number };
  usualIds: string[];
  diet: Diet;
}): MealPlan[] {
  const now = toMin(opts.nowHM);
  const usual = new Set(opts.usualIds);
  const status = (m: MealId): MealStatus => {
    if (opts.logged[m].kcal > 0) return 'done';
    const w = MEAL_TIMES[m];
    if (now >= toMin(w.from) && now <= toMin(w.to)) return 'now';
    if (now > toMin(w.to)) return now - toMin(w.to) <= 90 && m !== 'snacks' ? 'late' : 'skipped';
    return 'later';
  };
  const statuses = ORDER.map(status);
  // The first meal still to eat is "next" (unless one is already "now"/"late").
  if (!statuses.some((s) => s === 'now' || s === 'late')) {
    const i = statuses.indexOf('later');
    if (i >= 0) statuses[i] = 'next';
  }
  const open = ORDER.filter((_, i) => ['now', 'late', 'next', 'later'].includes(statuses[i]));
  const shareSum = open.reduce((a, m) => a + MEAL_TIMES[m].share, 0) || 1;
  return ORDER.map((meal, i) => {
    const st = statuses[i];
    const base: MealPlan = { meal, at: MEAL_TIMES[meal].at, status: st, logged: opts.logged[meal], options: [] };
    if (!open.includes(meal) || opts.remaining.kcal <= 60) return base;
    const share = MEAL_TIMES[meal].share / shareSum;
    const target = { kcal: Math.round(opts.remaining.kcal * share), protein: Math.round(Math.max(0, opts.remaining.protein) * share) };
    const options = COMBOS[meal]
      .map((c) => fit(c, target, usual, opts.diet))
      .filter((x): x is Suggestion & { score: number } => !!x)
      .sort((a, b) => a.score - b.score)
      .slice(0, 3)
      .map(({ score: _, ...s }) => s);
    return { ...base, target, options };
  });
}

/** One-line summary for headers and the morning brief. */
export function planHeadline(plan: MealPlan[]) {
  const label = (m: MealId) => m[0].toUpperCase() + m.slice(1);
  const done = plan.filter((p) => p.status === 'done').map((p) => label(p.meal));
  const next = plan.find((p) => ['now', 'late', 'next'].includes(p.status));
  const fmt = (hm: string) => {
    const [h, m] = hm.split(':').map(Number);
    return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
  };
  const head = done.length ? `${done.join(' & ')} done ✓` : 'Nothing logged yet';
  if (!next) return `${head} · day's eating is wrapped up`;
  const when = next.status === 'now' ? 'now' : next.status === 'late' ? 'now (running late)' : `at ${fmt(next.at)}`;
  return `${head} · ${label(next.meal)} ${when}${next.target ? ` — aim ~${next.target.kcal} kcal, ${next.target.protein} g protein` : ''}`;
}
