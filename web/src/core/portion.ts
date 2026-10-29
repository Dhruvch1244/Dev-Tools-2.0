// Human portions instead of multipliers: "1.5 × Matar paneer (1 katori)" reads as
// "Matar paneer · 1½ katori (~225 g)", "3 × Roti" as "3 rotis", "1.5 × Whey" as "1½ scoops (45 g)".
// Pure: no React, no I/O.

const FRAC: Record<string, string> = { '0.25': '¼', '0.5': '½', '0.75': '¾', '0.33': '⅓', '0.67': '⅔' };

/** 1.5 → "1½", 0.5 → "½", 2 → "2", 1.3 → "1.3". */
export function nice(n: number) {
  const whole = Math.floor(n + 1e-9);
  const frac = Math.round((n - whole) * 100) / 100;
  if (!frac) return String(whole);
  const f = FRAC[frac.toFixed(2).replace(/0$/, '')] ?? FRAC[String(frac)];
  return f ? `${whole || ''}${f}` : String(Math.round(n * 10) / 10);
}

const PLURAL: Record<string, string> = { katori: 'katoris', piece: 'pieces', glass: 'glasses', bowl: 'bowls', scoop: 'scoops', slice: 'slices', cup: 'cups', plate: 'plates', sandwich: 'sandwiches', roll: 'rolls', wrap: 'wraps', bar: 'bars', bottle: 'bottles', can: 'cans', medium: 'medium', large: 'large', small: 'small', burger: 'burgers', tsp: 'tsp', tbsp: 'tbsp' };
/** Typical weight of one unit when the serving doesn't say. */
const GRAMS: Record<string, number> = { katori: 150, bowl: 250, plate: 350, glass: 250, cup: 150, tbsp: 15, tsp: 5, scoop: 30 };

/** Foods counted as whole things, named by the count ("3 rotis", "4 idlis"). */
const COUNTED: Record<string, [string, string]> = {
  roti: ['roti', 'rotis'],
  idli: ['idli', 'idlis'],
  'besan-chilla': ['besan chilla', 'besan chillas'],
  'moong-chilla': ['moong chilla', 'moong chillas'],
  thepla: ['thepla', 'theplas'],
  'paneer-paratha': ['paneer paratha', 'paneer parathas'],
  'aloo-paratha': ['aloo paratha', 'aloo parathas'],
  paratha: ['paratha', 'parathas'],
  dosa: ['dosa', 'dosas'],
  banana: ['banana', 'bananas'],
  apple: ['apple', 'apples'],
  'bread-brown': ['slice brown bread', 'slices brown bread'],
};

type FoodLike = { id?: string | null; name: string; serving: string };

/**
 * The amount for `qty` servings, e.g. serving "1 katori (100 g)" × 1.5 → "1½ katori (~150 g)",
 * "100 g" × 0.5 → "50 g", "4 pieces" × 1.5 → "6 pieces", "1 scoop (30 g)" × 2 → "2 scoops (60 g)".
 */
export function amount(serving: string, qty: number): string {
  const s = serving.trim();
  // Plain weight/volume: just scale it.
  const w = /^(\d+(?:\.\d+)?)\s*(g|ml|kg|L)$/i.exec(s);
  if (w) return `${Math.round(Number(w[1]) * qty)} ${w[2]}`;
  const m = /^(\d+(?:\.\d+)?)\s+([a-zA-Z]+)(.*)$/.exec(s);
  if (!m) return qty === 1 ? s : `${nice(qty)} × ${s}`;
  const n = Number(m[1]) * qty;
  const unit = m[2].toLowerCase();
  const rest = m[3].trim();
  const singular = unit.replace(/(es|s)$/, (x) => (PLURAL[unit.replace(/(es|s)$/, '')] ? '' : x));
  // Indian usage: "1½ katori", "2 katoris".
  const word = n >= 2 ? (PLURAL[singular] ?? unit) : singular;
  // Grams: from the serving's own "(100 g)" if it's a weight of the whole serving, else a typical value.
  const inParens = /^\((\d+(?:\.\d+)?)\s*(g|ml)\)$/.exec(rest);
  const per = inParens ? Number(inParens[1]) / Number(m[1]) : GRAMS[singular];
  const unitG = inParens?.[2] ?? (singular === 'glass' ? 'ml' : 'g');
  const grams = per ? ` (~${Math.round((per * n) / 5) * 5} ${unitG})` : rest && !inParens ? ` ${rest}` : '';
  return `${nice(n)} ${word}${grams}`;
}

/** One line for a food at a quantity: "3 rotis", "Matar paneer · 1½ katori (~225 g)". */
export function portionText(food: FoodLike, qty: number): string {
  const c = food.id ? COUNTED[food.id] : undefined;
  if (c) {
    const n = Number(/^(\d+)/.exec(food.serving)?.[1] ?? 1) * qty;
    return `${nice(n)} ${n >= 2 ? c[1] : c[0]}`;
  }
  return `${food.name} · ${amount(food.serving, qty)}`;
}
