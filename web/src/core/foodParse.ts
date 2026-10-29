// "2 roti, dal tadka and 1 katori rice" → [{2 × Roti}, {1 × Dal tadka}, {1 × Steamed rice}].
// Plain token matching against the food list (no AI): quantities, unit words and common Hindi /
// Hinglish names are understood. Pure, no React.

export type Matchable = { id: string; name: string; serving: string; kcal: number; protein: number; carbs: number; fat: number };
export type Parsed<F extends Matchable> = { text: string; qty: number; food: F | null; alternatives: F[] };

const NUM_WORDS: Record<string, number> = { a: 1, an: 1, one: 1, ek: 1, two: 2, do: 2, three: 3, teen: 3, four: 4, char: 4, five: 5, paanch: 5, six: 6, half: 0.5, aadha: 0.5, double: 2, '½': 0.5 };
const UNIT_WORDS = new Set(['x', '×', 'katori', 'katoris', 'bowl', 'bowls', 'plate', 'plates', 'piece', 'pieces', 'pc', 'pcs', 'glass', 'glasses', 'cup', 'cups', 'serving', 'servings', 'scoop', 'scoops', 'slice', 'slices', 'nos', 'no', 'of', 'g', 'gm', 'grams', 'ml', 'tbsp', 'tsp', 'spoon', 'spoons']);
/** Words people type → words in the food list. */
const ALIASES: Record<string, string> = {
  chapati: 'roti',
  chapatti: 'roti',
  phulka: 'roti',
  fulka: 'roti',
  chawal: 'rice',
  bhaat: 'rice',
  dahi: 'curd',
  yogurt: 'curd',
  anda: 'egg',
  ande: 'egg',
  eggs: 'egg',
  doodh: 'milk',
  tea: 'chai',
  sabji: 'sabzi',
  subzi: 'sabzi',
  chole: 'chole',
  chhole: 'chole',
  paratha: 'paratha',
  parantha: 'paratha',
  daal: 'dal',
  dhal: 'dal',
  murgh: 'chicken',
  bhindi: 'bhindi',
  aloo: 'aloo',
  alu: 'aloo',
  protein: 'whey',
  shake: 'shake',
  biryani: 'biryani',
  briyani: 'biryani',
  coffee: 'coffee',
  banana: 'banana',
  kela: 'banana',
  seb: 'apple',
  idly: 'idli',
  dosai: 'dosa',
};

const clean = (w: string) => w.toLowerCase().replace(/[^a-z0-9½.]/g, '');

/** Higher is better. Every query word should hit a name word (prefix match); extra name words cost a little. */
function score(queryWords: string[][], name: string) {
  // Aliases apply to what the user typed only — aliasing names too turned "Green tea" into "Green chai".
  const nameWords = name.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  let s = 0;
  // Each typed word may match as written or via its alias ("chawal" hits both "Rajma chawal" and "rice").
  for (const forms of queryWords) {
    if (forms.some((q) => nameWords.includes(q))) s += 3;
    else if (forms.some((q) => nameWords.some((n) => n.startsWith(q) || (q.length > 3 && q.startsWith(n))))) s += 2;
    else return 0;
  }
  return s - 0.25 * Math.max(0, nameWords.length - queryWords.length);
}

export function parseFoodText<F extends Matchable>(text: string, foods: F[], recentIds: string[] = []): Parsed<F>[] {
  const chunks = text
    .split(/,|\+|\n|;|\band\b|\baur\b|\bwith\b|\bke saath\b|&/i)
    .map((c) => c.trim())
    .filter(Boolean);
  return chunks.map((chunk) => {
    let qty = 1;
    const words: string[][] = [];
    for (const raw of chunk.split(/\s+/)) {
      const lw = raw.toLowerCase();
      const num = /^(\d+(?:\.\d+)?)(x|×)?$/.exec(lw);
      if (num && words.length === 0) qty = Number(num[1]);
      else if (lw in NUM_WORDS && words.length === 0) qty = NUM_WORDS[lw];
      else if (!UNIT_WORDS.has(lw)) {
        const w = clean(raw);
        if (w) words.push(ALIASES[w] && ALIASES[w] !== w ? [w, ALIASES[w]] : [w]);
      }
    }
    const ranked = foods
      .map((f) => ({ f, s: score(words, f.name) + (recentIds.includes(f.id) ? 1.5 : 0) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s);
    return { text: chunk, qty: qty || 1, food: ranked[0]?.f ?? null, alternatives: ranked.slice(1, 4).map((x) => x.f) };
  });
}

/** Foods ranked for closing a protein gap: protein per kcal, nudged toward things the user eats. */
export function proteinFixes<F extends Matchable>(gapG: number, foods: F[], recentIds: string[]) {
  const seen = new Set<string>();
  return foods
    // Ready-to-eat items only (raw ingredients aren't a snack), protein-dense, one per kind.
    .filter((f) => !f.id.startsWith('raw-') && f.protein >= 6 && f.protein * 4 >= f.kcal * 0.3)
    .map((f) => ({ f, s: (f.protein / Math.max(f.kcal, 1)) * (recentIds.includes(f.id) ? 1.6 : 1) }))
    .sort((a, b) => b.s - a.s)
    .filter(({ f }) => {
      const kind = f.name.toLowerCase().split(/[\s(]/)[0];
      return seen.has(kind) ? false : (seen.add(kind), true);
    })
    .slice(0, 4)
    .map(({ f }) => {
      const qty = Math.min(4, Math.max(0.5, Math.round((gapG / f.protein) * 2) / 2));
      return { food: f, qty, protein: Math.round(f.protein * qty), kcal: Math.round(f.kcal * qty) };
    });
}
