// Cook plan: the cook comes in the afternoon (default 16:00) and makes tonight's dinner plus a
// breakfast that keeps overnight for tomorrow. Lunch is whatever you log (no fixed meal): the plan
// reserves your recent average lunch, counts the daily whey, and sizes breakfast + dinner to land
// on the calorie/protein target — preferring dishes rich in what you've been low on this week.
// Also: the brief for the cook, and shopping split into a big weekly shop + a mid-week top-up by
// how long each ingredient keeps. Pure: no React, no I/O.

import { FOODS, type Diet } from './foods';
import { COMBOS, fit, type Suggestion } from './mealPlan';
import { MICRO_META, microsOf, weekGaps, type MicroKey } from './micros';
import { portionText } from './portion';

type Item = [id: string, qty: number];
export type Dish = { name: string; items: Item[]; keep: string };

/** Breakfasts that are cooked in the afternoon and still good the next morning (veg, protein-forward). */
export const MAKE_AHEAD: Dish[] = [
  { name: 'Paneer paratha & curd', items: [['paneer-paratha', 2], ['curd', 1]], keep: 'Wrap parathas in foil, fridge. Tawa 1 min each side.' },
  { name: 'Moong dal chilla & green chutney', items: [['moong-chilla', 3], ['green-chutney', 1], ['curd', 1]], keep: 'Box in the fridge. Tawa or microwave 40 s.' },
  { name: 'Paneer-stuffed besan chilla', items: [['besan-chilla', 2], ['paneer', 0.5], ['curd', 1]], keep: 'Fridge. Reheat on tawa.' },
  { name: 'Dhokla & milk', items: [['dhokla', 1.5], ['green-chutney', 1], ['milk-toned', 1]], keep: 'Dhokla in a box (room temp or fridge), eat as is.' },
  { name: 'Idli sambar', items: [['idli', 4], ['sambar', 1]], keep: 'Idlis in a casserole, sambar in the fridge — microwave 1 min.' },
  { name: 'Sprouts chaat & paneer', items: [['sprouts', 1.5], ['paneer', 0.5], ['curd', 1]], keep: 'Fridge; add lemon and onion in the morning. Eat cold.' },
  { name: 'Soya bhurji rolls', items: [['roti', 2], ['soya-bhurji', 1]], keep: 'Bhurji in the fridge, rotis in foil. Warm and roll.' },
  { name: 'Methi thepla & curd', items: [['thepla', 3], ['curd', 1]], keep: 'Thepla keeps 2 days without a fridge.' },
  { name: 'Overnight oats & banana', items: [['oats-milk', 1], ['banana', 1]], keep: 'Mix oats and milk in a jar tonight; fridge. Eat cold with banana.' },
  { name: 'Handvo & curd', items: [['handvo', 2], ['curd', 1]], keep: 'Fridge. Tawa or microwave 1 min.' },
  { name: 'Paneer bhurji sandwich', items: [['bread-brown', 3], ['paneer-bhurji', 1]], keep: 'Bhurji in the fridge; toast and fill in the morning.' },
  { name: 'Pesarattu & chutney', items: [['pesarattu', 2], ['green-chutney', 1], ['curd', 1]], keep: 'Stack with butter paper, fridge. Tawa 1 min each side.' },
  { name: 'Besan toast & curd', items: [['besan-toast', 1], ['curd', 1]], keep: 'Keep the besan batter in the fridge; 3 min on the tawa in the morning.' },
  { name: 'Paneer sandwich', items: [['paneer-sandwich', 1]], keep: 'Filling in the fridge; assemble and toast in the morning.' },
  { name: 'Peanut-butter overnight oats', items: [['overnight-oats', 1], ['peanut-butter', 1]], keep: 'Jar in the fridge overnight; stir in peanut butter, eat cold.' },
  { name: 'Dalia with milk', items: [['dalia', 1.5], ['milk-toned', 1]], keep: 'Cook thick; fridge. Loosen with hot milk, 1 min microwave.' },
  { name: 'Vegetable dalia & curd', items: [['veg-dalia', 1.5], ['curd', 1]], keep: 'Fridge. Splash of water, microwave 90 s.' },
  { name: 'Kala chana chaat & curd', items: [['boiled-chana-salad', 1.5], ['curd', 1]], keep: 'Chana boiled and boxed; add onion, tomato, lemon in the morning.' },
  { name: 'Thalipeeth & curd', items: [['thalipeeth', 2], ['curd', 1]], keep: 'Wrap in foil, fridge. Tawa 1 min each side.' },
  { name: 'Methi paratha & curd', items: [['methi-paratha', 2], ['curd', 1]], keep: 'Foil, fridge. Tawa 1 min each side.' },
  { name: 'Khandvi & buttermilk', items: [['khandvi', 1.5], ['chaas', 1]], keep: 'Fridge; eat cold. Chaas made fresh.' },
  { name: 'Sooji cheela & chutney', items: [['sooji-cheela', 2], ['green-chutney', 1], ['curd', 1]], keep: 'Fridge. Reheat on tawa.' },
  { name: 'Ragi porridge & almonds', items: [['ragi-porridge', 1.5], ['almonds', 1]], keep: 'Cook thick; fridge. Loosen with hot milk.' },
  { name: 'Moong sprouts curry & roti', items: [['moong-sprouts-curry', 1], ['roti', 2]], keep: 'Curry in the fridge, rotis in foil. Microwave 1 min.' },
  { name: 'Soya chunk chilla wrap', items: [['besan-chilla', 2], ['soya-bhurji', 0.75]], keep: 'Fridge separately; warm and roll.' },
];

/** Extra dinners for the cook (on top of the shared dinner combos). */
const MORE_DINNERS: { name: string; items: Item[] }[] = [
  { name: 'Roti, palak paneer, salad', items: [['roti', 2], ['palak-paneer', 1], ['salad', 1]] },
  { name: 'Roti, kadai paneer, raita', items: [['roti', 2], ['kadai-paneer', 1], ['raita', 1]] },
  { name: 'Rajma, brown rice, salad', items: [['rajma', 1], ['brown-rice', 1], ['salad', 1]] },
  { name: 'Chole, roti, salad', items: [['chole', 1], ['roti', 2], ['salad', 1]] },
  { name: 'Kala chana curry & roti', items: [['kala-chana', 1], ['roti', 2], ['salad', 1]] },
  { name: 'Lobia & jowar roti', items: [['lobia', 1], ['jowar-roti', 2], ['curd', 1]] },
  { name: 'Palak dal, roti, curd', items: [['palak-dal', 1], ['roti', 2], ['curd', 1]] },
  { name: 'Soya curry & brown rice', items: [['soya-curry', 1], ['brown-rice', 1], ['salad', 1]] },
  { name: 'Pesarattu & sambar', items: [['pesarattu', 2], ['sambar', 1]] },
  { name: 'Moong sprouts curry, roti, curd', items: [['moong-sprouts-curry', 1], ['roti', 2], ['curd', 1]] },
  { name: 'Masoor dal, bajra roti, bhindi', items: [['masoor-dal', 1], ['bajra-roti', 2], ['bhindi', 1]] },
  { name: 'Mushroom matar & roti', items: [['mushroom', 1], ['roti', 2], ['raita', 1]] },
  { name: 'Gobi matar, dal, roti', items: [['gobi-matar', 1], ['dal-tadka', 1], ['roti', 2]] },
];
export const DINNERS = [...COMBOS.dinner, ...MORE_DINNERS];

export type CookConfig = {
  /** When the cook arrives (HH:MM). */
  at: string;
  /** Fixed evening snack, if any (whey is counted separately). */
  snack: Item[];
  /** Push the brief 15 min before the cook arrives. */
  remind: boolean;
};
export const DEFAULT_COOK: CookConfig = { at: '16:00', snack: [], remind: true };
/** Older settings carried a fixed lunch — it's ignored now; lunch is whatever you log. */
export const cookConfig = (c?: Partial<CookConfig> | null): CookConfig => ({ at: c?.at ?? DEFAULT_COOK.at, snack: c?.snack ?? DEFAULT_COOK.snack, remind: c?.remind ?? DEFAULT_COOK.remind });

/** Daily whey: `scoops` a day from `from` (a scoop = 30 g = 24 g protein). */
export type WheyPlan = { scoops: number; from: string };
export const DEFAULT_WHEY: WheyPlan = { scoops: 2.5, from: '2026-11-01' };
export const wheyPlan = (w?: Partial<WheyPlan> | null): WheyPlan => ({ ...DEFAULT_WHEY, ...(w ?? {}) });
export const wheyGoal = (date: string, w: WheyPlan) => (date >= w.from ? w.scoops : 0);

const byId = new Map(FOODS.map((f) => [f.id, f]));
const sum = (items: Item[]) =>
  items.reduce((a, [id, q]) => {
    const f = byId.get(id);
    return f ? { kcal: a.kcal + f.kcal * q, protein: a.protein + f.protein * q } : a;
  }, { kcal: 0, protein: 0 });

const shift = (d: string, n: number) => {
  const x = new Date(`${d}T12:00:00Z`);
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
};
/** Stable per-date number so the same day always gets the same pick (brief, list and app agree). */
const dayNo = (d: string) => Math.round(Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) / 86_400_000);

/**
 * What lunch usually is: the average of your logged lunches over the 14 days before `date` (needs
 * 3+ days), else a typical share of the day (30 % kcal, 25 % protein).
 */
export function lunchEstimate(logs: { date: string; meal: string; kcal: number; protein: number }[], date: string, target: { kcal: number; protein: number }) {
  const from = shift(date, -14);
  const days = new Map<string, { kcal: number; protein: number }>();
  for (const l of logs) {
    if (l.meal !== 'lunch' || l.date < from || l.date >= date) continue;
    const d = days.get(l.date) ?? { kcal: 0, protein: 0 };
    days.set(l.date, { kcal: d.kcal + l.kcal, protein: d.protein + l.protein });
  }
  if (days.size >= 3) {
    const v = [...days.values()];
    return { kcal: Math.round(v.reduce((a, x) => a + x.kcal, 0) / v.length), protein: Math.round(v.reduce((a, x) => a + x.protein, 0) / v.length), from: 'average' as const };
  }
  return { kcal: Math.round(target.kcal * 0.3), protein: Math.round(target.protein * 0.25), from: 'typical' as const };
}

/** The day-independent inputs both the app and the 4 pm push use: your usual lunch and this week's gaps. */
export function cookContext(logs: { date: string; meal: string; kcal: number; protein: number; food_id?: string | null; qty: number; micros?: string | null }[], date: string, target: { kcal: number; protein: number }, sex: 'male' | 'female') {
  return { lunch: lunchEstimate(logs, date, target), gaps: weekGaps(logs, date, sex, target.kcal) as Gap[] };
}

/** A nutrient you've been short on (7-day average) and its daily target. */
export type Gap = { key: MicroKey; target: number };

/** How much of each gap a dish covers (fraction of the daily target), for the gaps it helps with. */
export function dishBoosts(items: { food: { id: string }; qty: number }[], gaps: Gap[]) {
  const out: { key: MicroKey; share: number }[] = [];
  for (const g of gaps) {
    const v = items.reduce((a, i) => a + (microsOf(i.food.id)?.[g.key] ?? 0) * i.qty, 0);
    if (g.target > 0 && v / g.target >= 0.15) out.push({ key: g.key, share: v / g.target });
  }
  return out.sort((a, b) => b.share - a.share);
}

export type Pick = Suggestion & { boosts: { key: MicroKey; share: number }[] };
export type DayCook = {
  date: string;
  lunch: { kcal: number; protein: number; from: 'average' | 'typical' };
  whey: { scoops: number; kcal: number; protein: number };
  snack: { kcal: number; protein: number };
  breakfast: Pick & { keep: string };
  dinner: Pick;
  /** Everything together vs the day's target. */
  total: { kcal: number; protein: number };
  breakfastOptions: string[];
  dinnerOptions: string[];
};

/**
 * Plan one day's cooked meals: reserve lunch (your average), whey and snack first, then a make-ahead
 * breakfast (~40 %) and a dinner (~60 %) sized to what's left. Dishes rich in this week's gaps score
 * better. Among the well-fitting options the pick rotates by date; `picks` (by name) overrides.
 */
export function planCookDay(
  date: string,
  opts: { target: { kcal: number; protein: number }; cfg: CookConfig; diet: Diet; picks?: { breakfast?: string; dinner?: string }; lunch?: { kcal: number; protein: number; from?: 'average' | 'typical' }; whey?: WheyPlan; gaps?: Gap[] },
): DayCook | null {
  const { cfg, target } = opts;
  const lunch = { kcal: opts.lunch?.kcal ?? Math.round(target.kcal * 0.3), protein: opts.lunch?.protein ?? Math.round(target.protein * 0.25), from: opts.lunch?.from ?? ('typical' as const) };
  const scoops = wheyGoal(date, opts.whey ?? DEFAULT_WHEY);
  const w = byId.get('whey')!;
  const whey = { scoops, kcal: Math.round(w.kcal * scoops), protein: Math.round(w.protein * scoops) };
  const snack = sum(cfg.snack);
  const left = { kcal: target.kcal - lunch.kcal - whey.kcal - snack.kcal, protein: target.protein - lunch.protein - whey.protein - snack.protein };
  const gaps = opts.gaps ?? [];
  const withBoost = <T extends Suggestion & { score: number }>(s: T) => {
    const boosts = dishBoosts(s.items, gaps);
    // Up to 0.3 off the score for a dish that covers a good chunk of what you're missing.
    return { ...s, boosts, score: s.score - 0.3 * Math.min(1, boosts.reduce((a, b) => a + Math.min(0.5, b.share), 0)) };
  };
  const choose = <T extends { name: string; score: number }>(cands: T[], pick: string | undefined, salt: number) => {
    const sorted = cands.sort((a, b) => a.score - b.score);
    const good = sorted.filter((c) => c.score <= sorted[0].score + 0.25).slice(0, 4);
    return { chosen: sorted.find((c) => c.name === pick) ?? good[(dayNo(date) + salt) % good.length], names: sorted.map((c) => c.name) };
  };
  const bTarget = { kcal: Math.max(250, left.kcal * 0.4), protein: Math.max(15, left.protein * 0.45) };
  const bCands = MAKE_AHEAD.map((d) => {
    const s = fit(d, bTarget, new Set(), opts.diet);
    return s && { ...withBoost(s), keep: d.keep };
  }).filter((x): x is Pick & { score: number; keep: string } => !!x);
  const dTarget = { kcal: Math.max(300, left.kcal * 0.6), protein: Math.max(15, left.protein * 0.55) };
  const dCands = DINNERS.map((c) => fit(c, dTarget, new Set(), opts.diet))
    .filter((x): x is Suggestion & { score: number } => !!x)
    .map(withBoost);
  if (!bCands.length || !dCands.length) return null;
  const b = choose(bCands, opts.picks?.breakfast, 0);
  const d = choose(dCands, opts.picks?.dinner, 1);
  const { score: _b, ...breakfast } = b.chosen;
  const { score: _d, ...dinner } = d.chosen;
  return {
    date,
    lunch,
    whey,
    snack,
    breakfast,
    dinner,
    total: { kcal: Math.round(breakfast.kcal + dinner.kcal + lunch.kcal + whey.kcal + snack.kcal), protein: Math.round(breakfast.protein + dinner.protein + lunch.protein + whey.protein + snack.protein) },
    breakfastOptions: b.names,
    dinnerOptions: d.names,
  };
}

/** "Iron 30% · Fibre 25%" — why a dish was picked. */
export const boostText = (boosts: { key: MicroKey; share: number }[]) => boosts.slice(0, 2).map((b) => `${MICRO_META[b.key].label} ${Math.round(b.share * 100)}%`).join(' · ');

/** "3 rotis", "Matar paneer · 1½ katori (~225 g)" — portions the cook can follow. */
const portion = (it: { food: { id: string; name: string; serving: string }; qty: number }) => portionText(it.food, it.qty);
/** Things you add yourself in the morning — not the cook's job. */
const SELF_SERVE = new Set(['protein-shake-milk', 'whey', 'banana', 'milk-toned', 'almonds', 'peanut-butter']);

/** Text to send the cook (WhatsApp-ready): tonight's dinner and tomorrow's make-ahead breakfast. */
export function cookBrief(tonight: DayCook | null, tomorrow: DayCook | null) {
  const lines = ['🍳 Cook brief'];
  if (tonight) lines.push('', `Dinner tonight: ${tonight.dinner.items.map(portion).join(', ')}`);
  if (tomorrow) lines.push('', `Breakfast for tomorrow (keep aside): ${tomorrow.breakfast.items.filter((i) => !SELF_SERVE.has(i.food.id)).map(portion).join(', ')}`, `→ ${tomorrow.breakfast.keep}`);
  lines.push('', 'No egg, meat or fish. Less oil please 🙏');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------------------------
// Shopping: raw ingredients, how long they keep, and two trips a week
// ---------------------------------------------------------------------------------------------
type Unit = 'g' | 'ml' | 'pcs';
/** Raw ingredients per serving of a dish (the dishes this planner uses). */
const RAW: Record<string, [string, number, Unit][]> = {
  'paneer-paratha': [['Atta', 60, 'g'], ['Paneer', 50, 'g']],
  curd: [['Curd', 100, 'g']],
  'moong-chilla': [['Moong dal (yellow)', 35, 'g']],
  'green-chutney': [['Coriander & mint', 15, 'g']],
  'besan-chilla': [['Besan', 40, 'g']],
  paneer: [['Paneer', 100, 'g']],
  dhokla: [['Besan', 60, 'g']],
  'milk-toned': [['Milk', 250, 'ml']],
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
  pesarattu: [['Green moong (whole)', 40, 'g']],
  'besan-toast': [['Besan', 40, 'g'], ['Brown bread', 2, 'pcs']],
  'paneer-sandwich': [['Brown bread', 2, 'pcs'], ['Paneer', 60, 'g']],
  'overnight-oats': [['Oats', 50, 'g'], ['Milk', 150, 'ml'], ['Curd', 50, 'g']],
  'peanut-butter': [['Peanut butter', 16, 'g']],
  dalia: [['Dalia', 50, 'g']],
  'veg-dalia': [['Dalia', 45, 'g'], ['Mixed vegetables', 60, 'g']],
  'boiled-chana-salad': [['Kala chana (dry)', 40, 'g'], ['Onion', 0.25, 'pcs'], ['Tomato', 0.25, 'pcs'], ['Lemon', 0.25, 'pcs']],
  thalipeeth: [['Thalipeeth bhajani flour', 50, 'g']],
  'methi-paratha': [['Atta', 45, 'g'], ['Methi', 15, 'g']],
  khandvi: [['Besan', 35, 'g'], ['Curd', 40, 'g']],
  chaas: [['Curd', 80, 'g']],
  'sooji-cheela': [['Sooji', 40, 'g'], ['Curd', 30, 'g']],
  'ragi-porridge': [['Ragi flour', 35, 'g'], ['Milk', 150, 'ml']],
  almonds: [['Almonds', 10, 'g']],
  'moong-sprouts-curry': [['Moong sprouts', 100, 'g'], ['Tomato', 0.5, 'pcs']],
  'palak-paneer': [['Spinach', 150, 'g'], ['Paneer', 70, 'g']],
  'kadai-paneer': [['Paneer', 80, 'g'], ['Capsicum', 0.5, 'pcs'], ['Tomato', 1, 'pcs']],
  rajma: [['Rajma (dry)', 40, 'g'], ['Tomato', 0.5, 'pcs']],
  'brown-rice': [['Brown rice', 50, 'g']],
  chole: [['Kabuli chana (dry)', 40, 'g'], ['Tomato', 0.5, 'pcs']],
  'kala-chana': [['Kala chana (dry)', 45, 'g']],
  lobia: [['Lobia (dry)', 40, 'g']],
  'jowar-roti': [['Jowar flour', 40, 'g']],
  'bajra-roti': [['Bajra flour', 40, 'g']],
  'palak-dal': [['Toor dal', 35, 'g'], ['Spinach', 80, 'g']],
  'soya-curry': [['Soya chunks', 45, 'g'], ['Tomato', 0.5, 'pcs']],
  'masoor-dal': [['Masoor dal', 40, 'g']],
  bhindi: [['Bhindi', 150, 'g']],
  mushroom: [['Mushrooms', 150, 'g'], ['Green peas', 40, 'g']],
  'gobi-matar': [['Cauliflower', 150, 'g'], ['Green peas', 40, 'g']],
};

/** Roughly how many days each ingredient stays good (fridge where sensible). */
export const SHELF: Record<string, number> = {
  Paneer: 3, Curd: 3, Milk: 2, 'Coriander & mint': 3, Methi: 2, Spinach: 2, 'Moong sprouts': 2, 'Idli/dosa batter': 3, 'Brown bread': 3, Tofu: 4, Mushrooms: 3, Bhindi: 3,
  Banana: 4, 'Mixed vegetables': 4, Lauki: 5, Cucumber: 5, Tomato: 6, Capsicum: 5, Cauliflower: 5, 'Green peas': 4, Lemon: 10,
  Onion: 30, Atta: 90, Besan: 120, Sooji: 90, Oats: 180, Dalia: 180, 'Ragi flour': 120, 'Jowar flour': 60, 'Bajra flour': 45, 'Handvo flour': 60, 'Thalipeeth bhajani flour': 60,
  'Moong dal (yellow)': 180, 'Toor dal': 180, 'Masoor dal': 180, 'Green moong (whole)': 365, 'Kala chana (dry)': 365, 'Kabuli chana (dry)': 365, 'Rajma (dry)': 365, 'Lobia (dry)': 365,
  'Soya chunks': 180, Rice: 365, 'Brown rice': 180, 'Whey protein': 365, 'Peanut butter': 90, Almonds: 120,
};
export const shelfDays = (name: string) => SHELF[name] ?? 7;

/** Always-useful vegetarian protein staples, shown with the generated list. */
export const PROTEIN_STAPLES = ['Paneer', 'Curd', 'Greek yogurt', 'Soya chunks', 'Tofu', 'Moong dal (yellow)', 'Moong sprouts', 'Kala chana (dry)', 'Whey protein', 'Milk', 'Peanut butter', 'Roasted chana'];

export type ShopItem = { name: string; qty: string; keeps: number };
export type Trip = { kind: 'major' | 'minor'; date: string; covers: [string, string]; items: ShopItem[] };
type Acc = Map<string, { n: number; u: Unit }>;

const fmtQty = (n: number, u: Unit) => {
  if (u === 'pcs') return `${Math.ceil(n)}`;
  if (n >= 1000) return `${Math.round(n / 100) / 10} ${u === 'g' ? 'kg' : 'L'}`;
  return `${Math.ceil(n / 50) * 50} ${u}`;
};
const addTo = (acc: Acc, name: string, n: number, u: Unit) => {
  const cur = acc.get(name) ?? { n: 0, u };
  acc.set(name, { n: cur.n + n, u });
};
function tally(items: { food: { id: string }; qty: number }[], acc: Acc = new Map()) {
  for (const it of items) for (const [name, n, u] of RAW[it.food.id] ?? []) addTo(acc, name, n * it.qty, u);
  return acc;
}
const toList = (acc: Acc) =>
  [...acc.entries()].map(([name, { n, u }]) => ({ name, qty: fmtQty(n, u), keeps: shelfDays(name) })).sort((a, b) => a.keeps - b.keeps || a.name.localeCompare(b.name));

/** What gets cooked on a date: tonight's dinner and the breakfast made for tomorrow. */
export const cookedOn = (date: string, plan: (d: string) => DayCook | null) => [...(plan(date)?.dinner.items ?? []), ...(plan(shift(date, 1))?.breakfast.items ?? [])];

/** Next date on or after `from` that falls on weekday `wd` (0 = Sunday). */
export function nextWeekday(from: string, wd: number) {
  return shift(from, (wd - new Date(`${from}T12:00:00Z`).getUTCDay() + 7) % 7);
}

/**
 * Two trips a week. The big shop (`major` weekday) buys what keeps a week or more for the whole
 * week, plus fresh things for the days until the top-up; the top-up (`minor` weekday) buys fresh
 * things for the rest of the week. Daily whey goes on the big shop as a stock check.
 */
export function shoppingTrips(from: string, plan: (d: string) => DayCook | null, shops = { major: 0, minor: 3 }, whey: WheyPlan = DEFAULT_WHEY): Trip[] {
  const major = nextWeekday(from, shops.major);
  const minor = nextWeekday(shift(major, 1), shops.minor);
  const end = shift(major, 6);
  const big: Acc = new Map();
  const top: Acc = new Map();
  for (let i = 0; i < 7; i++) {
    const d = shift(major, i);
    for (const [name, { n, u }] of tally(cookedOn(d, plan))) addTo(shelfDays(name) >= 7 || d < minor ? big : top, name, n, u);
  }
  const bigList = toList(big).filter((x) => x.name !== 'Whey protein');
  const wheyDays = Array.from({ length: 7 }, (_, i) => shift(major, i)).filter((d) => wheyGoal(d, whey) > 0).length;
  if (wheyDays) bigList.push({ name: 'Whey protein', qty: `${Math.round(wheyDays * whey.scoops * 30)} g — check the tub`, keeps: 365 });
  return [
    { kind: 'major', date: major, covers: [major, shift(minor, -1)], items: bigList },
    { kind: 'minor', date: minor, covers: [minor, end], items: toList(top) },
  ];
}

/** Aggregate raw ingredients for a set of planned days (dinner + breakfast of each). */
export function shoppingList(days: DayCook[]): ShopItem[] {
  return toList(tally(days.flatMap((d) => [...d.breakfast.items, ...d.dinner.items])));
}
