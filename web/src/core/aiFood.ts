// AI meal logging: the prompt that asks Claude to read a meal photo (or a description), and the
// normaliser that turns its JSON into log-ready rows. Catalogue matches are recomputed from our own
// food table — the model only decides *what* and *how much*; numbers come from data when we have it.
// Pure: no React, no I/O.

import { FOODS, allowedFor, type Diet } from './foods';
import { MICRO_ORDER, microsOf, type MicroKey, type Micros } from './micros';

export type AiItem = {
  food_id: string | null;
  name: string;
  qty: number;
  unit: string;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  micros: Micros;
  confidence: 'high' | 'medium' | 'low';
  /** True when the item isn't allowed by the user's diet (e.g. egg or meat on a veg plate). */
  offDiet: boolean;
};
export type AiResult = { items: AiItem[]; note: string };

const byId = new Map(FOODS.map((f) => [f.id, f]));

export const AI_FOOD_SYSTEM = `You are a precise nutrition estimator who knows Indian home, regional and restaurant food very well.
You get a photo of a meal and/or a short description. Identify every distinct food and drink.
For each item:
- If it is the same dish as an entry in the CATALOGUE, return its "id" and "qty" in multiples of that entry's serving (e.g. 2 rotis → id "roti", qty 2; a big bowl of dal ≈ 1.5 katori → qty 1.5). Prefer catalogue matches.
- Otherwise omit "id" and estimate everything for the portion shown: kcal, protein, carbs, fat (g), and fiber (g), sugar (g), sodium (mg), calcium (mg), iron (mg), potassium (mg), magnesium (mg), zinc (mg), vitC (mg), b12 (µg).
- Judge portion size from plate/katori/hand size; assume typical home oil unless it looks oily/restaurant.
- "confidence": "high" if clearly visible and identifiable, "medium" if the dish or portion is a guess, "low" if barely visible.
- "portion": a short human description like "2 rotis" or "1 katori".
Reply with ONLY a JSON object, no prose, no code fences:
{"items":[{"id":"roti","name":"Roti","qty":2,"portion":"2 rotis","confidence":"high"}, {"name":"Mango pickle","portion":"1 tsp","kcal":25,"protein":0,"carbs":1,"fat":2,"fiber":0.3,"sodium":300,"confidence":"medium"}],"note":"one short sentence: what you assumed, or what would make the estimate better"}
If there is no food in the image, return {"items":[],"note":"…"}.`;

/** The whole catalogue as compact lines for the prompt — non-veg too, so an egg on the plate is
 * named honestly and flagged off-diet rather than mislabelled as something veg. */
export const catalogueForPrompt = () =>
  FOODS.map((f) => `${f.id} | ${f.name} | ${f.serving} | ${f.kcal} kcal | ${f.protein} g P`)
    .join('\n');

export function aiUserText(opts: { text?: string; diet: Diet; hasImage: boolean }) {
  const dietLine = { veg: 'The eater is vegetarian (dairy yes; no meat, fish or eggs). If something looks like egg/meat, still list it honestly.', egg: 'The eater is eggetarian.', nonveg: 'The eater eats everything.' }[opts.diet];
  return [
    opts.hasImage ? 'Estimate the meal in this photo.' : 'Estimate this meal.',
    opts.text?.trim() ? `The eater says: "${opts.text.trim().slice(0, 500)}" — trust this for names and amounts.` : '',
    dietLine,
    'CATALOGUE (id | name | serving | kcal | protein):',
    catalogueForPrompt(),
  ]
    .filter(Boolean)
    .join('\n\n');
}

const num = (v: unknown, max = 5000) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.min(n, max) : 0;
};
const r1 = (n: number) => Math.round(n * 10) / 10;

/** Pull the first JSON object out of a reply (models sometimes wrap it in prose or fences). */
export function extractJson(text: string): unknown {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('No JSON in the reply');
  return JSON.parse(text.slice(start, end + 1));
}

/** Validate and normalise the model's JSON into log-ready rows. */
export function normaliseAi(raw: unknown, diet: Diet): AiResult {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as { items?: unknown; note?: unknown };
  const list = Array.isArray(obj.items) ? obj.items.slice(0, 20) : [];
  const items: AiItem[] = [];
  for (const it of list as Record<string, unknown>[]) {
    if (!it || typeof it !== 'object') continue;
    const confidence = it.confidence === 'high' || it.confidence === 'low' ? it.confidence : 'medium';
    const food = typeof it.id === 'string' ? byId.get(it.id) : undefined;
    if (food) {
      const qty = Math.max(0.25, Math.round(num(it.qty || 1, 20) * 4) / 4);
      const per = microsOf(food.id) ?? {};
      items.push({
        food_id: food.id,
        name: food.name,
        qty,
        unit: food.serving,
        kcal: Math.round(food.kcal * qty),
        protein: r1(food.protein * qty),
        carbs: r1(food.carbs * qty),
        fat: r1(food.fat * qty),
        micros: Object.fromEntries(Object.entries(per).map(([k, v]) => [k, r1((v as number) * qty)])),
        confidence,
        offDiet: !allowedFor(diet, food.id),
      });
      continue;
    }
    const name = typeof it.name === 'string' ? it.name.trim().slice(0, 80) : '';
    const kcal = num(it.kcal, 3000);
    if (!name || !kcal) continue;
    const micros: Micros = {};
    for (const k of MICRO_ORDER) if (k in it) micros[k as MicroKey] = r1(num(it[k], 20000));
    items.push({
      food_id: null,
      name,
      qty: 1,
      unit: typeof it.portion === 'string' ? it.portion.slice(0, 40) : '1 portion',
      kcal: Math.round(kcal),
      protein: r1(num(it.protein, 300)),
      carbs: r1(num(it.carbs, 500)),
      fat: r1(num(it.fat, 300)),
      micros,
      confidence,
      offDiet: diet !== 'nonveg' && /\b(chicken|mutton|fish|prawn|egg|omelette|keema|meat|pork|beef|bacon|ham|salami|tuna|crab)\b/i.test(name) && !(diet === 'egg' && /\begg|omelette/i.test(name) && !/chicken|mutton|fish|prawn|keema|meat|pork|beef/i.test(name)),
    });
  }
  return { items, note: typeof obj.note === 'string' ? obj.note.slice(0, 300) : '' };
}

/** Rescale an item to a new quantity (catalogue items scale exactly; estimates scale linearly). */
export function rescale(item: AiItem, qty: number): AiItem {
  const k = qty / item.qty;
  return {
    ...item,
    qty,
    kcal: Math.round(item.kcal * k),
    protein: r1(item.protein * k),
    carbs: r1(item.carbs * k),
    fat: r1(item.fat * k),
    micros: Object.fromEntries(Object.entries(item.micros).map(([key, v]) => [key, r1((v as number) * k)])),
  };
}
