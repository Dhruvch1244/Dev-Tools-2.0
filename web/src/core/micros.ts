// Micronutrients per serving (the same serving as foods.ts / foodsMore.ts), plus daily targets.
// Approximate: estimated from IFCT 2017 / USDA ingredient values and typical home recipes. Good
// enough to spot patterns over a week (chronically low fibre, B12 or iron), not for clinical use.
// Pure data + maths: no React imports.

export type MicroKey = 'fiber' | 'sugar' | 'sodium' | 'calcium' | 'iron' | 'potassium' | 'magnesium' | 'zinc' | 'vitC' | 'b12';
export type Micros = Partial<Record<MicroKey, number>>;

export const MICRO_META: Record<MicroKey, { label: string; unit: string; kind: 'goal' | 'limit'; why: string }> = {
  fiber: { label: 'Fibre', unit: 'g', kind: 'goal', why: 'Digestion, fullness, steady blood sugar' },
  calcium: { label: 'Calcium', unit: 'mg', kind: 'goal', why: 'Bones, muscle contraction' },
  iron: { label: 'Iron', unit: 'mg', kind: 'goal', why: 'Oxygen to muscles; plant iron absorbs poorly' },
  b12: { label: 'Vitamin B12', unit: 'µg', kind: 'goal', why: 'Nerves, red blood cells; only dairy on a veg diet' },
  zinc: { label: 'Zinc', unit: 'mg', kind: 'goal', why: 'Recovery, immunity, testosterone' },
  magnesium: { label: 'Magnesium', unit: 'mg', kind: 'goal', why: 'Sleep, cramps, energy' },
  potassium: { label: 'Potassium', unit: 'mg', kind: 'goal', why: 'Blood pressure, hydration, cramps' },
  vitC: { label: 'Vitamin C', unit: 'mg', kind: 'goal', why: 'Immunity; triples plant-iron absorption' },
  sodium: { label: 'Sodium', unit: 'mg', kind: 'limit', why: 'Keep under the limit for blood pressure' },
  sugar: { label: 'Sugar', unit: 'g', kind: 'limit', why: 'Total sugars incl. fruit and milk' },
};
export const MICRO_ORDER: MicroKey[] = ['fiber', 'b12', 'iron', 'calcium', 'zinc', 'magnesium', 'potassium', 'vitC', 'sodium', 'sugar'];

/** Daily targets — ICMR-NIN 2020 RDAs for Indian adults (sedentary-to-moderate); limits per WHO. */
export function microTargets(sex: 'male' | 'female' = 'male', kcal = 2200): Record<MicroKey, number> {
  const m = sex === 'male';
  return {
    fiber: Math.round((kcal / 1000) * 14), // 14 g per 1000 kcal
    calcium: 1000,
    iron: m ? 19 : 29,
    b12: 2.5,
    zinc: m ? 17 : 13,
    magnesium: m ? 440 : 370,
    potassium: 3500,
    vitC: m ? 80 : 65,
    sodium: 2000,
    sugar: 50,
  };
}

// [fiber g, sugar g, sodium mg, calcium mg, iron mg, potassium mg, magnesium mg, zinc mg, vitC mg, b12 µg]
type M = [number, number, number, number, number, number, number, number, number, number];
const KEYS: MicroKey[] = ['fiber', 'sugar', 'sodium', 'calcium', 'iron', 'potassium', 'magnesium', 'zinc', 'vitC', 'b12'];

const T: Record<string, M> = {
  // Breads
  roti: [3.4, 0.4, 120, 12, 1.4, 110, 40, 0.8, 0, 0],
  'roti-ghee': [3.4, 0.4, 120, 12, 1.4, 110, 40, 0.8, 0, 0],
  paratha: [3.5, 0.5, 250, 15, 1.5, 120, 40, 0.8, 0, 0],
  'aloo-paratha': [4.5, 1.5, 400, 25, 2, 380, 55, 1, 8, 0],
  'paneer-paratha': [3.8, 1.5, 380, 200, 1.7, 160, 50, 1.6, 1, 0.2],
  'gobi-paratha': [5, 1.5, 380, 35, 1.8, 260, 50, 1, 20, 0],
  thepla: [2.5, 0.5, 180, 30, 1.5, 120, 30, 0.6, 3, 0],
  puri: [1.3, 0.2, 90, 6, 0.6, 50, 15, 0.3, 0, 0],
  bhatura: [1.8, 2, 420, 40, 1.6, 110, 20, 0.6, 0, 0.1],
  naan: [2, 3, 450, 60, 2.6, 110, 25, 0.7, 0, 0.1],
  'butter-naan': [2, 3, 500, 65, 2.6, 115, 25, 0.7, 0, 0.1],
  'missi-roti': [4.5, 1, 250, 25, 2.2, 220, 50, 1, 1, 0],
  'makki-roti': [4, 0.5, 200, 10, 1.5, 150, 60, 1, 0, 0],
  'bajra-roti': [4.5, 0.5, 150, 15, 3, 160, 55, 1.3, 0, 0],
  'jowar-roti': [4, 0.5, 120, 10, 1.6, 150, 50, 0.7, 0, 0],
  'bread-white': [0.7, 1.5, 140, 40, 0.9, 30, 7, 0.2, 0, 0],
  'bread-brown': [1.8, 1.5, 135, 30, 0.9, 70, 20, 0.5, 0, 0],
  // Rice
  rice: [0.6, 0.1, 5, 15, 0.3, 50, 20, 0.8, 0, 0],
  'brown-rice': [2.7, 0.4, 8, 15, 0.7, 120, 65, 1.1, 0, 0],
  'jeera-rice': [0.8, 0.2, 300, 25, 0.8, 70, 25, 0.8, 0, 0],
  pulao: [2.5, 2, 400, 30, 1, 200, 30, 0.9, 8, 0],
  'veg-biryani': [4, 4, 800, 60, 2, 400, 50, 1.4, 12, 0.1],
  'chicken-biryani': [2.5, 3, 900, 50, 2, 450, 50, 2.5, 6, 0.4],
  'curd-rice': [0.8, 4, 350, 150, 0.4, 230, 25, 1.1, 1, 0.4],
  'lemon-rice': [1.5, 0.5, 350, 20, 0.6, 100, 30, 0.9, 8, 0],
  khichdi: [3.5, 1, 350, 35, 1.8, 300, 45, 1.3, 2, 0],
  'fried-rice': [2.5, 3, 900, 30, 1.2, 200, 30, 1, 10, 0],
  // Dal & curry
  'dal-tadka': [4.5, 2, 400, 40, 2.4, 380, 45, 1.2, 6, 0],
  'dal-fry': [4.5, 2, 420, 40, 2.4, 380, 45, 1.2, 6, 0],
  'moong-dal': [4, 1.5, 380, 35, 1.7, 350, 50, 1, 4, 0],
  'masoor-dal': [5, 1.5, 380, 30, 2.8, 400, 40, 1.4, 4, 0],
  'chana-dal': [6, 2, 400, 45, 2.6, 400, 55, 1.6, 4, 0],
  'dal-makhani': [6, 2.5, 500, 70, 2.8, 450, 55, 1.4, 3, 0.1],
  rajma: [7, 2, 450, 60, 3, 550, 60, 1.3, 5, 0],
  chole: [8, 3, 500, 70, 3.5, 450, 65, 1.8, 6, 0],
  kadhi: [1.5, 4, 600, 140, 1.2, 250, 25, 0.7, 2, 0.3],
  sambar: [4, 3, 450, 45, 1.6, 350, 35, 0.8, 12, 0],
  rasam: [1, 2, 450, 20, 0.6, 200, 15, 0.3, 10, 0],
  sprouts: [5, 3, 150, 30, 2, 350, 50, 1.2, 15, 0],
  'soya-curry': [5, 3, 450, 120, 5, 900, 120, 2.2, 8, 0],
  // Sabzi
  'aloo-gobi': [4, 3, 350, 35, 1, 500, 35, 0.5, 40, 0],
  'aloo-sabzi': [3, 1.5, 350, 20, 1, 600, 35, 0.5, 15, 0],
  'aloo-matar': [5, 3, 380, 30, 1.6, 550, 40, 0.9, 18, 0],
  'dum-aloo': [3, 3, 450, 40, 1.2, 600, 40, 0.6, 15, 0.1],
  bhindi: [4, 2.5, 300, 90, 0.9, 350, 60, 0.6, 20, 0],
  'baingan-bharta': [5, 5, 350, 25, 0.8, 400, 25, 0.4, 6, 0],
  'mix-veg': [4.5, 4, 380, 50, 1.2, 400, 35, 0.6, 25, 0],
  lauki: [2, 3, 300, 30, 0.5, 250, 20, 0.6, 12, 0],
  cabbage: [3, 4, 300, 50, 0.6, 250, 15, 0.3, 40, 0],
  mushroom: [2.5, 3, 400, 15, 1, 450, 20, 0.8, 4, 0.1],
  'palak-paneer': [3.5, 2.5, 450, 380, 3.5, 550, 90, 2, 20, 0.4],
  'paneer-butter-masala': [2, 6, 600, 380, 1.2, 300, 35, 2, 8, 0.4],
  'kadai-paneer': [2.5, 4, 550, 380, 1.3, 350, 35, 2, 40, 0.4],
  'matar-paneer': [4, 4, 500, 330, 1.6, 300, 40, 2, 12, 0.4],
  'shahi-paneer': [1.5, 6, 550, 400, 1.2, 280, 35, 2, 5, 0.5],
  'paneer-bhurji': [1.5, 3, 450, 480, 1, 250, 35, 2.6, 15, 0.6],
  // Non-veg (veg users never see these suggested; kept for completeness)
  'chicken-curry': [1.5, 3, 550, 30, 1.5, 400, 35, 2, 6, 0.4],
  'butter-chicken': [1.5, 5, 650, 60, 1.5, 400, 35, 2, 5, 0.4],
  'tandoori-chicken': [0.5, 2, 600, 30, 1.2, 400, 35, 2, 3, 0.4],
  'chicken-tikka': [0.5, 2, 550, 30, 1.2, 380, 32, 1.8, 3, 0.4],
  'chicken-breast': [0, 0, 75, 15, 1, 250, 29, 1, 0, 0.3],
  'egg-curry': [1.5, 3, 550, 70, 2, 300, 20, 1.3, 6, 1.1],
  'fish-curry': [1, 2, 550, 60, 1, 450, 40, 0.8, 6, 2],
  'mutton-curry': [1.5, 3, 550, 30, 3, 400, 30, 5, 5, 2.5],
  keema: [1.5, 2, 550, 30, 3, 400, 30, 5, 5, 2.5],
  'chicken-roll': [2.5, 3, 900, 60, 2.5, 350, 35, 1.8, 5, 0.3],
  // Breakfast
  poha: [2, 2, 500, 20, 2.6, 200, 30, 0.8, 8, 0],
  upma: [2.5, 2, 500, 25, 1.4, 180, 30, 0.7, 6, 0],
  idli: [0.8, 0.2, 130, 10, 0.4, 40, 10, 0.3, 0, 0],
  dosa: [1.2, 0.5, 250, 15, 0.8, 80, 15, 0.5, 0, 0],
  'masala-dosa': [3, 2, 550, 30, 1.6, 400, 35, 0.8, 10, 0],
  uttapam: [2, 2, 380, 25, 1, 200, 25, 0.6, 8, 0],
  'medu-vada': [2.5, 0.5, 250, 25, 1.4, 180, 30, 0.8, 0, 0],
  'besan-chilla': [3, 1, 300, 30, 1.8, 280, 45, 1, 6, 0],
  'moong-chilla': [3.5, 1, 280, 25, 1.6, 300, 50, 1, 5, 0],
  'sabudana-khichdi': [2, 1.5, 450, 25, 1.2, 400, 40, 0.8, 8, 0],
  dhokla: [2, 4, 550, 40, 1.4, 200, 35, 0.8, 2, 0],
  'oats-milk': [4, 13, 120, 320, 2, 550, 95, 2, 1, 1],
  'masala-oats': [4, 2, 550, 40, 2, 300, 70, 1.6, 6, 0],
  'boiled-egg': [0, 0.6, 62, 25, 0.9, 63, 5, 0.5, 0, 0.45],
  'egg-white': [0, 0.2, 55, 2, 0, 54, 4, 0, 0, 0],
  omelette: [0.5, 1, 350, 60, 1.8, 150, 12, 1.1, 3, 0.9],
  'egg-bhurji': [1, 2, 400, 60, 2, 200, 15, 1.1, 8, 0.9],
  'bread-omelette': [1.5, 3, 600, 130, 3.5, 200, 25, 1.5, 3, 0.9],
  // Dairy & drinks
  'milk-toned': [0, 12, 120, 300, 0.1, 380, 28, 1, 1, 1.1],
  'milk-full': [0, 12, 110, 300, 0.1, 350, 28, 1, 1, 1.1],
  curd: [0, 4, 45, 120, 0.1, 155, 12, 0.6, 1, 0.4],
  raita: [1, 4, 300, 130, 0.3, 250, 15, 0.6, 5, 0.4],
  paneer: [0, 2.5, 30, 480, 0.2, 100, 25, 2.5, 0, 0.6],
  lassi: [0, 30, 100, 300, 0.2, 380, 30, 1.2, 2, 0.9],
  chaas: [0.3, 3, 300, 120, 0.2, 180, 15, 0.5, 2, 0.3],
  chai: [0, 10, 40, 110, 0.1, 150, 12, 0.4, 0, 0.4],
  coffee: [0, 10, 45, 120, 0.1, 230, 20, 0.4, 0, 0.4],
  'black-coffee': [0, 0, 5, 5, 0, 115, 7, 0, 0, 0],
  whey: [0, 2, 60, 130, 0.3, 160, 20, 0.8, 0, 0.5],
  'coconut-water': [2.5, 6, 250, 60, 0.7, 600, 60, 0.3, 6, 0],
  'nimbu-pani': [0.2, 18, 250, 10, 0.1, 60, 5, 0, 20, 0],
  cola: [0, 35, 15, 10, 0.1, 10, 0, 0, 0, 0],
  // Snacks
  samosa: [2.5, 1.5, 420, 25, 1.4, 250, 25, 0.5, 6, 0],
  kachori: [3, 1.5, 450, 30, 1.8, 200, 35, 0.8, 1, 0],
  pakora: [3, 1.5, 450, 40, 2, 300, 40, 0.9, 8, 0],
  'pav-bhaji': [6, 8, 1100, 100, 3, 650, 55, 1.4, 30, 0.2],
  'vada-pav': [3, 3, 700, 60, 2, 350, 35, 0.8, 8, 0],
  'pani-puri': [3, 6, 600, 30, 1.6, 250, 25, 0.6, 6, 0],
  bhel: [3.5, 5, 650, 30, 2, 300, 35, 0.8, 10, 0],
  'sev-puri': [3, 5, 650, 40, 2, 300, 35, 0.8, 8, 0],
  dabeli: [3, 8, 650, 50, 2, 350, 35, 0.8, 8, 0],
  maggi: [2.5, 2, 1300, 30, 3, 180, 25, 0.8, 0, 0],
  'veg-momos': [2.5, 2, 650, 40, 1.4, 200, 25, 0.6, 8, 0],
  'chicken-momos': [1.5, 2, 650, 30, 1.4, 250, 25, 1.2, 3, 0.2],
  chowmein: [3.5, 5, 1300, 40, 2.5, 300, 35, 1, 15, 0],
  namkeen: [2.5, 1, 350, 20, 1.5, 180, 30, 0.6, 0, 0],
  chips: [1.3, 0.3, 170, 7, 0.5, 400, 20, 0.3, 6, 0],
  marie: [0.5, 6, 110, 20, 0.7, 30, 6, 0.2, 0, 0],
  'roasted-chana': [5, 3, 10, 55, 2, 260, 50, 1, 0, 0],
  makhana: [4, 0, 5, 18, 0.5, 150, 60, 0.4, 0, 0],
  // Fruits & nuts
  banana: [3.1, 14, 1, 6, 0.3, 420, 32, 0.2, 10, 0],
  apple: [4.4, 19, 2, 11, 0.2, 195, 9, 0.1, 8, 0],
  mango: [2.6, 23, 2, 18, 0.3, 280, 16, 0.1, 60, 0],
  papaya: [2.5, 11, 12, 30, 0.4, 260, 30, 0.1, 88, 0],
  orange: [3, 12, 0, 52, 0.1, 230, 13, 0.1, 70, 0],
  guava: [5.4, 9, 2, 18, 0.3, 420, 22, 0.2, 200, 0],
  dates: [2, 16, 0, 15, 0.3, 160, 12, 0.1, 0, 0],
  peanuts: [2.6, 1.2, 5, 28, 1.4, 200, 50, 1, 0, 0],
  almonds: [1.7, 0.6, 0, 37, 0.5, 100, 38, 0.4, 0, 0],
  walnuts: [0.7, 0.3, 0, 10, 0.3, 45, 16, 0.3, 0, 0],
  'peanut-butter': [1.5, 1.5, 75, 7, 0.3, 105, 27, 0.5, 0, 0],
  // Sweets
  'gulab-jamun': [0.3, 20, 40, 60, 0.4, 80, 8, 0.3, 0, 0.1],
  rasgulla: [0, 22, 30, 60, 0.2, 40, 5, 0.3, 0, 0.1],
  jalebi: [0.5, 25, 30, 10, 0.5, 30, 5, 0.2, 0, 0],
  kheer: [0.5, 25, 90, 220, 0.3, 300, 25, 0.8, 1, 0.7],
  'sooji-halwa': [1, 25, 50, 30, 0.8, 100, 20, 0.5, 0, 0],
  'gajar-halwa': [3, 28, 100, 200, 0.8, 450, 25, 0.7, 5, 0.5],
  'besan-ladoo': [1.5, 12, 10, 15, 1, 120, 25, 0.6, 0, 0],
  barfi: [0, 15, 40, 100, 0.2, 120, 10, 0.4, 0, 0.3],
  'ice-cream': [0.5, 15, 50, 85, 0.1, 130, 10, 0.4, 0, 0.3],
  // Extras
  salad: [2.5, 4, 10, 30, 0.5, 300, 20, 0.3, 20, 0],
  papad: [1.5, 0.2, 300, 15, 0.8, 100, 20, 0.3, 0, 0],
  pickle: [1, 1, 600, 10, 0.5, 40, 5, 0.1, 2, 0],
  'green-chutney': [1, 0.5, 150, 25, 0.8, 100, 10, 0.1, 15, 0],
  'coconut-chutney': [2, 1, 150, 10, 0.5, 100, 10, 0.3, 1, 0],
  ghee: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  butter: [0, 0, 30, 1, 0, 1, 0, 0, 0, 0],
  oil: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  sugar: [0, 5, 0, 0, 0, 0, 0, 0, 0, 0],
  'soya-chunks': [6.5, 3, 10, 120, 10, 1200, 140, 2.5, 0, 0],
  // South Indian
  'rava-dosa': [1, 1, 350, 20, 0.8, 80, 15, 0.4, 0, 0],
  'onion-uttapam': [2, 2, 380, 25, 1, 200, 25, 0.6, 4, 0],
  'set-dosa': [2, 1, 450, 30, 1.4, 150, 30, 0.9, 0, 0],
  'mysore-masala-dosa': [3, 2.5, 650, 35, 1.8, 400, 35, 0.9, 10, 0],
  'paper-dosa': [1.2, 0.5, 300, 15, 0.8, 80, 15, 0.5, 0, 0],
  'neer-dosa': [0.5, 0.3, 200, 8, 0.3, 50, 12, 0.5, 0, 0],
  appam: [0.6, 1, 150, 8, 0.3, 60, 10, 0.4, 0, 0],
  pesarattu: [4, 1, 300, 35, 2, 400, 55, 1.2, 4, 0],
  'rava-idli': [0.8, 1, 200, 20, 0.5, 60, 10, 0.3, 0, 0.1],
  'sambar-vada': [4.5, 2.5, 600, 50, 2.4, 400, 50, 1.2, 10, 0],
  pongal: [2, 0.5, 450, 30, 1.4, 200, 40, 1.2, 0, 0],
  'bisi-bele-bath': [4.5, 3, 600, 45, 2, 400, 45, 1.3, 10, 0],
  puliyogare: [1.5, 3, 500, 30, 1, 150, 30, 0.9, 1, 0],
  'tomato-rice': [1.5, 3, 450, 20, 0.8, 250, 25, 0.8, 12, 0],
  'coconut-rice': [2.5, 1, 350, 15, 0.8, 150, 30, 1, 1, 0],
  avial: [4, 3, 300, 50, 0.8, 400, 35, 0.5, 12, 0.1],
  kootu: [4, 2, 350, 40, 1.4, 350, 35, 0.8, 10, 0],
  poriyal: [3.5, 2.5, 300, 45, 1, 250, 25, 0.4, 12, 0],
  thoran: [3, 3, 280, 50, 0.6, 250, 20, 0.3, 35, 0],
  'kerala-parotta': [1.5, 1.5, 450, 15, 1.4, 70, 15, 0.4, 0, 0],
  idiyappam: [1.5, 0.2, 150, 10, 0.5, 60, 20, 0.6, 0, 0],
  puttu: [2, 1, 200, 10, 0.6, 120, 25, 0.8, 0, 0],
  'kadala-curry': [7, 3, 500, 70, 3, 400, 60, 1.5, 4, 0],
  'upma-kesari': [2, 15, 450, 30, 1.2, 150, 25, 0.7, 4, 0],
  'tomato-chutney': [0.8, 2.5, 200, 8, 0.3, 120, 6, 0.1, 6, 0],
  gunpowder: [2.5, 0.5, 250, 30, 1, 120, 30, 0.5, 0, 0],
  'filter-coffee': [0, 12, 50, 130, 0.1, 230, 20, 0.5, 0, 0.5],
  'buttermilk-masala': [0.3, 3, 350, 120, 0.2, 180, 15, 0.5, 2, 0.3],
  // Regional
  'litti-chokha': [8, 4, 800, 70, 4, 700, 80, 2, 15, 0],
  'sattu-drink': [5, 1, 300, 30, 2.5, 350, 60, 1.2, 8, 0],
  'dal-baati': [9, 4, 900, 90, 5, 600, 100, 2.5, 6, 0],
  'gatte-sabzi': [3, 3, 600, 120, 1.8, 250, 35, 0.9, 2, 0.2],
  'ker-sangri': [6, 2, 500, 80, 2, 300, 40, 0.6, 5, 0],
  undhiyu: [6, 4, 450, 70, 2, 550, 50, 0.9, 15, 0],
  khandvi: [1.5, 3, 450, 70, 1.2, 200, 30, 0.7, 2, 0.2],
  handvo: [3, 3, 450, 50, 1.6, 250, 40, 0.9, 6, 0.1],
  'thepla-aloo': [6, 3, 750, 70, 3, 650, 70, 1.5, 15, 0],
  'misal-pav': [9, 6, 1200, 90, 4, 650, 70, 2, 12, 0],
  'poha-kanda': [2.5, 2.5, 600, 25, 3, 250, 35, 0.9, 10, 0],
  'sabudana-vada': [2, 1, 450, 20, 0.8, 300, 30, 0.6, 6, 0],
  thalipeeth: [5, 1.5, 400, 50, 2.5, 300, 60, 1.3, 6, 0],
  'puran-poli': [4, 22, 200, 30, 2, 250, 40, 1, 0, 0],
  'zunka-bhakri': [7, 2, 600, 50, 3, 400, 70, 1.6, 6, 0],
  'macher-jhol': [1.5, 2, 550, 60, 1, 450, 40, 0.8, 8, 2],
  shukto: [4, 4, 350, 80, 1.2, 400, 35, 0.5, 12, 0.2],
  luchi: [1.2, 0.2, 180, 8, 0.8, 70, 15, 0.3, 0, 0],
  'aloo-posto': [3, 2, 400, 120, 1.5, 550, 70, 1, 12, 0],
  'cholar-dal': [6, 6, 450, 45, 2.5, 400, 55, 1.5, 3, 0],
  'mishti-doi': [0, 22, 50, 150, 0.1, 180, 13, 0.5, 1, 0.4],
  sandesh: [0, 14, 40, 130, 0.2, 60, 10, 0.6, 0, 0.3],
  'rajma-chawal': [8, 2, 600, 75, 3.5, 650, 85, 2.2, 5, 0],
  'chole-bhature': [12, 6, 1300, 150, 6.5, 650, 90, 2.5, 6, 0.2],
  'kadhi-chawal': [2, 4, 650, 160, 1.6, 320, 45, 1.5, 2, 0.3],
  'sarson-saag': [5, 2, 450, 180, 2.5, 450, 45, 0.6, 50, 0.1],
  'amritsari-kulcha': [6, 5, 1300, 120, 4.5, 600, 60, 1.6, 15, 0.2],
  'dal-pakwan': [7, 2, 800, 60, 3.5, 450, 70, 1.6, 4, 0],
  'rogan-josh': [1.5, 3, 600, 40, 3, 450, 35, 5, 4, 2.5],
  yakhni: [0.5, 3, 550, 120, 2.5, 400, 35, 4.5, 2, 2.5],
  haleem: [5, 2, 650, 50, 4, 500, 70, 5, 4, 2],
  'hyd-dum-biryani': [2.5, 3, 1000, 60, 3, 500, 55, 4, 5, 2],
  'appam-stew': [4, 5, 500, 40, 1, 500, 40, 0.8, 15, 0],
  'kerala-fish-curry': [1.5, 2, 600, 60, 1.2, 450, 45, 0.8, 6, 2],
  'chettinad-chicken': [2, 3, 650, 40, 2, 450, 40, 2, 6, 0.4],
  'momo-soup': [3, 3, 1100, 50, 2, 350, 30, 1, 8, 0.2],
  'bamboo-pork': [3, 2, 650, 30, 1.5, 450, 30, 3, 5, 0.8],
  akuri: [1, 2, 450, 70, 2, 250, 15, 1.2, 10, 1],
  dhansak: [5, 3, 600, 60, 3, 550, 50, 3, 8, 1.5],
  // Restaurant & fast food
  'paneer-tikka': [1.5, 3, 650, 500, 1.2, 300, 35, 2.6, 25, 0.6],
  'chicken-65': [1, 2, 900, 30, 1.5, 400, 35, 2, 3, 0.4],
  'chilli-chicken': [2, 6, 1100, 30, 1.6, 450, 35, 2, 30, 0.4],
  'chilli-paneer': [2, 7, 1100, 450, 1.5, 300, 35, 2.4, 35, 0.5],
  'gobi-manchurian': [4, 6, 1100, 50, 1.8, 450, 30, 0.6, 50, 0],
  'veg-manchurian': [3, 5, 900, 40, 1.5, 300, 25, 0.5, 15, 0],
  'hakka-noodles': [3.5, 4, 1200, 35, 2.5, 300, 35, 1, 15, 0],
  'chicken-noodles': [3, 4, 1300, 35, 2.5, 400, 40, 1.8, 10, 0.3],
  'schezwan-rice': [2.5, 5, 1300, 35, 1.5, 250, 35, 1, 15, 0],
  'egg-fried-rice': [2, 3, 1100, 50, 2, 250, 35, 1.4, 8, 0.6],
  'spring-roll': [2, 3, 550, 25, 1.2, 150, 15, 0.4, 6, 0],
  'hot-sour-soup': [1.5, 3, 1000, 25, 1, 200, 15, 0.4, 6, 0],
  'sweet-corn-soup': [2, 5, 900, 20, 0.6, 200, 20, 0.4, 4, 0.1],
  'tandoori-roti': [3.5, 0.5, 250, 15, 1.6, 120, 40, 0.8, 0, 0],
  'garlic-naan': [2, 3, 550, 70, 2.8, 120, 25, 0.8, 1, 0.1],
  'lachha-paratha': [3.5, 0.5, 400, 15, 1.6, 120, 40, 0.8, 0, 0],
  'malai-kofta': [3, 7, 650, 200, 1.4, 400, 35, 1.4, 8, 0.4],
  'dal-tadka-dhaba': [4.5, 2, 650, 45, 2.4, 380, 45, 1.2, 6, 0.1],
  'chicken-tikka-masala': [2, 6, 800, 60, 2, 450, 40, 2, 10, 0.4],
  'kadai-chicken': [2.5, 4, 750, 40, 2, 450, 40, 2, 30, 0.4],
  'mutton-biryani': [2.5, 3, 1000, 60, 3, 500, 55, 4, 5, 2],
  'egg-biryani': [2.5, 3, 900, 70, 2.5, 400, 45, 1.6, 5, 0.9],
  'paneer-biryani': [3, 4, 900, 350, 1.8, 400, 50, 2.2, 6, 0.4],
  shawarma: [3, 4, 1100, 80, 3, 450, 40, 2.5, 6, 0.5],
  'egg-roll': [2, 3, 750, 70, 2.5, 250, 25, 1.2, 5, 0.7],
  'paneer-roll': [2.5, 4, 850, 350, 2, 300, 35, 2, 8, 0.4],
  'burger-veg': [4, 7, 850, 100, 2.5, 350, 35, 1, 6, 0.1],
  'burger-chicken': [2.5, 7, 950, 100, 2.5, 380, 35, 1.5, 4, 0.3],
  'aloo-tikki-burger': [3.5, 6, 750, 80, 2, 350, 30, 0.8, 6, 0],
  'fries-medium': [3.5, 0.3, 300, 15, 0.8, 600, 30, 0.5, 6, 0],
  'pizza-margherita': [1.5, 2.5, 450, 150, 1.5, 150, 20, 1, 2, 0.4],
  'pizza-veg': [2, 3, 500, 140, 1.6, 200, 22, 1, 6, 0.3],
  'pizza-chicken': [1.5, 3, 550, 140, 1.6, 200, 22, 1.4, 3, 0.4],
  'garlic-bread': [1.5, 2, 400, 40, 1.4, 80, 15, 0.4, 1, 0],
  'pasta-white': [3, 6, 900, 300, 2, 350, 50, 2, 4, 0.8],
  'pasta-red': [4, 9, 850, 100, 2.5, 550, 55, 1.4, 20, 0.2],
  'sandwich-veg': [3.5, 4, 700, 80, 2, 300, 35, 0.8, 10, 0.1],
  'sandwich-chicken': [2.5, 4, 800, 80, 2, 350, 40, 1.4, 5, 0.3],
  'club-sandwich': [3, 5, 1300, 150, 3, 450, 45, 2, 6, 0.7],
  'subway-6-chicken': [4, 6, 800, 80, 3, 450, 45, 1.5, 15, 0.3],
  'subway-6-veg': [5, 6, 400, 60, 2.5, 400, 40, 1, 15, 0],
  'fried-chicken': [0.5, 0, 700, 20, 1, 250, 20, 1.8, 0, 0.3],
  nuggets: [1, 0.5, 550, 15, 1, 250, 20, 0.7, 0, 0.2],
  'wrap-chicken': [3, 4, 950, 80, 2.5, 400, 35, 1.6, 8, 0.3],
  'salad-chicken': [4, 5, 600, 60, 2, 650, 50, 1.6, 30, 0.4],
  'poke-bowl': [5, 8, 1200, 60, 2.5, 700, 70, 2, 15, 2],
  'falafel-wrap': [8, 4, 1100, 120, 4, 550, 70, 1.6, 10, 0],
  'hummus-pita': [7, 2, 650, 70, 3, 300, 60, 1.6, 2, 0],
  'cold-coffee': [0, 32, 120, 250, 0.2, 400, 30, 0.8, 1, 0.8],
  cappuccino: [0, 9, 90, 220, 0.1, 300, 25, 0.7, 1, 0.7],
  latte: [0, 14, 140, 340, 0.1, 450, 35, 1, 1, 1],
  milkshake: [0.5, 55, 250, 350, 0.5, 550, 40, 1.2, 2, 1],
  brownie: [2, 30, 200, 25, 1.8, 150, 35, 0.7, 0, 0.1],
  donut: [1, 14, 300, 30, 1.2, 70, 12, 0.4, 0, 0.1],
  muffin: [1.5, 32, 400, 60, 1.6, 150, 20, 0.6, 1, 0.2],
  croissant: [1.5, 6, 400, 30, 1.2, 80, 15, 0.5, 0, 0.1],
  // Packaged
  'parle-g': [0.5, 6.5, 70, 10, 1, 30, 5, 0.2, 0, 0],
  'good-day': [0.5, 8, 100, 10, 0.6, 40, 8, 0.2, 0, 0],
  digestive: [1.5, 5, 180, 15, 0.9, 60, 12, 0.3, 0, 0],
  bourbon: [1, 11, 100, 10, 1, 70, 15, 0.3, 0, 0],
  monaco: [0.5, 1, 300, 10, 0.6, 30, 6, 0.2, 0, 0],
  rusk: [1, 6, 100, 15, 0.8, 40, 8, 0.3, 0, 0],
  khari: [0.6, 1, 200, 8, 0.6, 30, 5, 0.2, 0, 0],
  'maggi-masala': [2.5, 2, 1300, 30, 3, 180, 25, 0.8, 0, 0],
  'cup-noodles': [2, 3, 1400, 30, 2, 150, 20, 0.6, 0, 0],
  kurkure: [1, 1, 300, 10, 0.5, 100, 12, 0.3, 0, 0],
  'aloo-bhujia': [2, 0.5, 350, 20, 1.2, 250, 30, 0.6, 1, 0],
  'moong-dal-namkeen': [2.5, 0.5, 250, 15, 1.4, 250, 35, 0.8, 0, 0],
  khakhra: [3, 0.5, 300, 20, 1.4, 130, 35, 0.7, 0, 0],
  'corn-flakes': [1, 15, 250, 250, 4, 350, 25, 0.8, 0, 0.9],
  muesli: [4, 18, 150, 300, 3, 550, 70, 1.6, 3, 1],
  granola: [3.5, 10, 30, 30, 1.4, 170, 50, 1.2, 0, 0],
  'protein-bar': [4, 10, 200, 150, 2, 200, 50, 1.6, 0, 0.5],
  'muesli-bar': [1.5, 8, 50, 15, 0.7, 80, 20, 0.5, 0, 0],
  'dark-chocolate': [2, 5, 5, 15, 2.4, 140, 45, 0.7, 0, 0],
  'dairy-milk': [0.5, 14, 25, 50, 0.4, 90, 12, 0.3, 0, 0.1],
  'amul-butter-slice': [0, 0, 80, 2, 0, 2, 0, 0, 0, 0],
  'cheese-slice': [0, 1, 250, 120, 0.1, 30, 5, 0.6, 0, 0.2],
  'amul-kool': [0, 20, 100, 200, 0.2, 280, 20, 0.7, 0, 0.6],
  'greek-yogurt': [0, 4, 36, 110, 0.1, 140, 11, 0.5, 0, 0.75],
  'high-protein-curd': [0, 8, 90, 250, 0.2, 300, 22, 1.2, 1, 1],
  'protein-milkshake': [1, 6, 150, 350, 0.3, 400, 35, 1.2, 0, 1],
  tofu: [2.3, 0.6, 10, 350, 5.4, 120, 60, 1.6, 0, 0],
  'peanut-chikki': [1.5, 10, 10, 15, 0.8, 120, 30, 0.6, 0, 0],
  'bread-multigrain': [2, 2, 130, 35, 1, 70, 20, 0.5, 0, 0],
  pav: [1, 2, 220, 40, 1.2, 50, 10, 0.3, 0, 0],
  jam: [0.2, 10, 5, 4, 0.1, 15, 1, 0, 2, 0],
  honey: [0, 17, 1, 1, 0.1, 10, 0, 0, 0, 0],
  ketchup: [0.1, 4, 150, 3, 0.1, 50, 2, 0, 2, 0],
  mayo: [0, 0.3, 90, 1, 0, 3, 0, 0, 0, 0],
  // Drinks
  'masala-chai-nosugar': [0, 4, 40, 110, 0.1, 150, 12, 0.4, 0, 0.4],
  'green-tea': [0, 0, 2, 0, 0, 20, 2, 0, 0, 0],
  'badam-milk': [1, 22, 100, 300, 0.5, 400, 45, 1.2, 1, 1],
  'haldi-doodh': [0.3, 12, 110, 300, 0.6, 380, 30, 1, 1, 1.1],
  'mango-lassi': [1, 40, 100, 280, 0.2, 450, 30, 1, 25, 0.8],
  'salted-lassi': [0, 9, 450, 280, 0.1, 350, 28, 1, 2, 0.8],
  jaljeera: [0.5, 5, 450, 15, 0.8, 60, 5, 0.1, 4, 0],
  'aam-panna': [1, 24, 300, 10, 0.3, 120, 8, 0, 20, 0],
  sugarcane: [0, 40, 30, 30, 1, 150, 15, 0.2, 2, 0],
  'orange-juice': [0.5, 21, 2, 25, 0.5, 450, 25, 0.1, 85, 0],
  'sweet-lime': [0.5, 18, 2, 30, 0.3, 300, 15, 0.1, 50, 0],
  'watermelon-juice': [0.6, 15, 2, 12, 0.4, 170, 15, 0.2, 12, 0],
  'banana-shake': [3, 33, 120, 300, 0.4, 750, 60, 1.2, 10, 1.1],
  'protein-shake-water': [0, 2, 60, 130, 0.3, 160, 20, 0.8, 0, 0.5],
  'protein-shake-milk': [0, 14, 180, 430, 0.4, 540, 48, 1.8, 1, 1.6],
  'energy-drink': [0, 27, 200, 30, 0, 10, 0, 0, 0, 5],
  'diet-cola': [0, 0, 40, 10, 0, 10, 0, 0, 0, 0],
  beer: [0, 0, 20, 20, 0.1, 140, 30, 0, 0, 0.1],
  whisky: [0, 0, 0, 0, 0, 1, 0, 0, 0, 0],
  'red-wine': [0, 1, 6, 12, 0.7, 190, 18, 0.2, 0, 0],
  ors: [0, 6, 600, 0, 0, 200, 0, 0, 0, 0],
  // Raw (per 100 g unless the serving says otherwise)
  'raw-chicken-breast': [0, 0, 65, 10, 0.7, 330, 28, 0.8, 0, 0.2],
  'raw-chicken-thigh': [0, 0, 85, 10, 0.9, 240, 23, 1.8, 0, 0.4],
  'raw-mutton': [0, 0, 70, 12, 2.5, 300, 23, 4, 0, 2.6],
  'raw-fish-rohu': [0, 0, 60, 650, 1, 280, 25, 0.6, 0, 1.5],
  'raw-prawns': [0, 0, 120, 70, 0.5, 260, 35, 1.3, 0, 1.1],
  'raw-egg': [0, 0.2, 70, 28, 0.9, 70, 6, 0.6, 0, 0.45],
  'raw-paneer': [0, 2.5, 30, 480, 0.2, 100, 25, 2.5, 0, 0.6],
  'raw-paneer-low': [0, 3, 40, 450, 0.2, 120, 25, 2.2, 0, 0.6],
  'raw-rice': [1.3, 0.1, 5, 10, 0.8, 115, 25, 1.1, 0, 0],
  'raw-basmati': [1, 0.1, 5, 10, 0.6, 100, 25, 1.1, 0, 0],
  'raw-atta': [11, 0.4, 2, 30, 4, 360, 125, 2.6, 0, 0],
  'raw-maida': [2.7, 0.3, 2, 15, 1.2, 110, 22, 0.7, 0, 0],
  'raw-besan': [11, 10, 60, 45, 4.9, 850, 165, 2.8, 0, 0],
  'raw-oats': [10, 1, 2, 54, 4.7, 430, 175, 4, 0, 0],
  'raw-poha': [3, 0, 10, 20, 4.5, 150, 40, 1.2, 0, 0],
  'raw-suji': [3.9, 0.5, 1, 17, 1.2, 186, 47, 1, 0, 0],
  'raw-toor-dal': [15, 3, 17, 73, 3.9, 1100, 120, 2.7, 0, 0],
  'raw-moong-dal': [16, 2, 15, 75, 4, 1150, 190, 2.7, 0, 0],
  'raw-masoor': [11, 2, 6, 56, 7.5, 680, 120, 4.8, 2, 0],
  'raw-chana-dal': [17, 10, 25, 56, 5.3, 720, 135, 3, 1, 0],
  'raw-rajma': [16, 2, 12, 140, 6.5, 1300, 140, 2.8, 4, 0],
  'raw-kabuli-chana': [17, 11, 24, 105, 6, 875, 115, 3.4, 4, 0],
  'raw-soya-chunks': [13, 6, 20, 240, 20, 2400, 280, 5, 0, 0],
  'raw-potato': [2.2, 0.8, 6, 12, 0.8, 420, 23, 0.3, 20, 0],
  'raw-sweet-potato': [3, 4.2, 55, 30, 0.6, 340, 25, 0.3, 2.4, 0],
  'raw-onion': [1.7, 4.2, 4, 23, 0.2, 146, 10, 0.2, 7, 0],
  'raw-tomato': [1.2, 2.6, 5, 10, 0.3, 237, 11, 0.2, 14, 0],
  'raw-spinach': [2.2, 0.4, 79, 99, 2.7, 560, 79, 0.5, 28, 0],
  'raw-broccoli': [2.6, 1.7, 33, 47, 0.7, 316, 21, 0.4, 89, 0],
  'raw-peas': [5.7, 5.7, 5, 25, 1.5, 245, 33, 1.2, 40, 0],
  'raw-corn': [2.7, 6.3, 15, 2, 0.5, 270, 37, 0.5, 7, 0],
  'raw-mushroom': [1, 2, 5, 3, 0.5, 318, 9, 0.5, 2, 0.04],
  'raw-cucumber': [0.5, 1.7, 2, 16, 0.3, 147, 13, 0.2, 3, 0],
  'raw-carrot': [2.8, 4.7, 69, 33, 0.3, 320, 12, 0.2, 6, 0],
  'raw-milk-toned': [0, 4.8, 48, 120, 0, 150, 11, 0.4, 0, 0.45],
  'raw-curd': [0, 4, 45, 120, 0.1, 155, 12, 0.6, 1, 0.4],
  'raw-ghee': [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  'raw-mustard-oil': [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  'raw-peanuts': [8.5, 4, 18, 92, 4.6, 705, 168, 3.3, 0, 0],
  'raw-almonds': [12.5, 4.4, 1, 269, 3.7, 733, 270, 3.1, 0, 0],
  'raw-cashews': [3.3, 6, 12, 37, 6.7, 660, 292, 5.8, 0.5, 0],
  'raw-coconut': [9, 6, 20, 14, 2.4, 356, 32, 1.1, 3, 0],
  'raw-banana': [2.6, 12, 1, 5, 0.3, 358, 27, 0.2, 9, 0],
  'raw-apple': [2.4, 10, 1, 6, 0.1, 107, 5, 0, 5, 0],
  'raw-dates': [7, 63, 2, 64, 1, 656, 54, 0.3, 0, 0],
  'raw-chia': [4.1, 0, 2, 76, 0.9, 49, 40, 0.6, 0, 0],
  'raw-flax': [2.7, 0.2, 3, 26, 0.6, 81, 39, 0.4, 0, 0],
  'raw-pumpkin-seeds': [0.6, 0.1, 1, 5, 0.9, 81, 59, 0.8, 0, 0],
  // More home food
  'methi-paratha': [4, 0.5, 300, 50, 2.5, 200, 45, 0.9, 6, 0],
  'mooli-paratha': [4, 1.5, 350, 35, 1.6, 230, 45, 0.8, 10, 0],
  'egg-paratha': [3.5, 0.8, 450, 45, 2.3, 180, 45, 1.3, 0, 0.45],
  'chapati-large': [4.4, 0.5, 150, 15, 1.8, 140, 50, 1.1, 0, 0],
  'ragi-roti': [3.5, 0.3, 120, 110, 1.2, 130, 40, 0.8, 0, 0],
  'ragi-mudde': [6, 0.6, 150, 300, 3, 330, 100, 1.8, 0, 0],
  'jeera-aloo': [3, 1.5, 400, 20, 1, 600, 35, 0.5, 15, 0],
  'aloo-baingan': [4.5, 4, 350, 25, 0.9, 500, 30, 0.5, 10, 0],
  tinda: [2.5, 3, 300, 30, 0.6, 200, 20, 0.4, 15, 0],
  karela: [4, 2, 300, 30, 0.8, 350, 25, 0.8, 50, 0],
  parwal: [3, 2, 300, 30, 1.5, 150, 15, 0.3, 25, 0],
  arbi: [5, 1, 350, 50, 1, 650, 40, 0.4, 6, 0],
  kaddu: [2.5, 8, 300, 40, 1, 400, 20, 0.4, 12, 0],
  'gobi-matar': [5, 4, 350, 35, 1.3, 400, 35, 0.7, 50, 0],
  'palak-dal': [5.5, 1.5, 420, 80, 3, 550, 70, 1.3, 15, 0],
  'moong-sprouts-curry': [5, 3, 400, 35, 2, 350, 45, 1, 12, 0],
  lobia: [7, 2, 400, 45, 2.5, 450, 90, 1.6, 3, 0],
  'kala-chana': [9, 3, 400, 80, 3.5, 450, 70, 1.8, 3, 0],
  'soya-bhurji': [6, 3, 400, 140, 6, 1000, 120, 2.3, 10, 0],
  'tofu-bhurji': [2.5, 2, 400, 350, 4.5, 250, 55, 1.5, 12, 0],
  'chicken-bhuna': [1.5, 3, 600, 30, 1.6, 420, 35, 2, 6, 0.4],
  'chicken-keema': [1.5, 2, 550, 25, 1.4, 380, 32, 2, 5, 0.4],
  'egg-masala-dry': [1, 2, 450, 60, 1.8, 250, 15, 1.1, 8, 0.9],
  'boiled-chana-salad': [8, 4, 300, 70, 3, 400, 60, 1.6, 15, 0],
  'fruit-chaat': [4, 20, 200, 25, 0.5, 400, 25, 0.3, 50, 0],
  'corn-chaat': [3.5, 7, 350, 10, 0.8, 350, 45, 0.7, 12, 0],
  'paneer-sandwich': [3, 4, 650, 300, 2, 250, 35, 1.8, 6, 0.3],
  'veg-sandwich': [3.5, 4, 550, 70, 1.8, 300, 35, 0.8, 12, 0],
  'besan-toast': [4, 3, 600, 60, 2.6, 350, 50, 1.2, 6, 0],
  'egg-sandwich': [2, 3, 550, 90, 2.4, 200, 30, 1.2, 3, 0.9],
  'peanut-butter-toast': [3.5, 4, 340, 70, 2, 230, 55, 1, 0, 0],
  'overnight-oats': [7, 15, 120, 350, 3, 600, 130, 2.6, 3, 1],
  'ragi-porridge': [3.5, 8, 100, 330, 1.5, 300, 50, 1, 0, 0.5],
  dalia: [5, 12, 100, 200, 2, 400, 70, 1.6, 1, 0.6],
  'veg-dalia': [6, 3, 400, 40, 2, 350, 65, 1.4, 12, 0],
  'sooji-cheela': [1.5, 1.5, 300, 25, 1, 150, 25, 0.6, 6, 0],
  'egg-white-omelette': [0.5, 1, 300, 10, 0.3, 250, 15, 0.1, 5, 0.1],
  'chicken-soup': [0.5, 1.5, 800, 20, 0.8, 300, 15, 0.8, 3, 0.3],
  'dal-soup': [3, 1.5, 500, 30, 1.6, 300, 35, 0.9, 6, 0],
  'tomato-soup': [1.5, 7, 700, 20, 1, 450, 20, 0.3, 20, 0],
  'papdi-chaat': [4, 10, 750, 150, 2, 450, 45, 1, 6, 0.3],
  'aloo-tikki-chaat': [5, 9, 800, 120, 2, 700, 50, 1, 15, 0.3],
  'dahi-bhalla': [3, 12, 700, 200, 1.8, 400, 50, 1.3, 4, 0.5],
  'ras-malai': [0, 30, 100, 250, 0.3, 200, 20, 0.8, 1, 0.6],
  'kaju-katli': [0.4, 7, 2, 4, 0.6, 60, 25, 0.5, 0, 0],
  'motichoor-ladoo': [1, 18, 20, 15, 0.8, 80, 15, 0.4, 0, 0],
  shrikhand: [0, 35, 60, 220, 0.2, 250, 20, 0.8, 1, 0.6],
  payasam: [1, 25, 100, 180, 0.6, 250, 25, 0.7, 1, 0.5],
  phirni: [0.3, 22, 80, 200, 0.2, 250, 22, 0.7, 1, 0.6],
  kulfi: [0.3, 22, 80, 230, 0.2, 280, 25, 0.8, 1, 0.6],
};

const asMicros = (m: M): Micros => Object.fromEntries(KEYS.map((k, i) => [k, m[i]]));

/** Per-serving micros for a catalogue food (undefined for custom foods with no data). */
export const microsOf = (id: string | null | undefined): Micros | undefined => (id && T[id] ? asMicros(T[id]) : undefined);
export const hasMicros = (id: string) => id in T;

type Loggable = { food_id?: string | null; qty: number; micros?: string | Micros | null };

/** Micros for one logged row: a stored snapshot (AI photo / custom estimates) wins, else the catalogue × qty. */
export function microsForLog(l: Loggable): Micros | undefined {
  if (l.micros) {
    try {
      return typeof l.micros === 'string' ? JSON.parse(l.micros) : l.micros;
    } catch {
      /* fall through to the catalogue */
    }
  }
  const per = microsOf(l.food_id);
  if (!per) return undefined;
  return Object.fromEntries(Object.entries(per).map(([k, v]) => [k, (v as number) * l.qty]));
}

/** Sum micros over logs, and how many logged kcal had no micro data (so the UI can say "partial"). */
export function sumMicros(logs: (Loggable & { kcal: number })[]) {
  const total: Record<MicroKey, number> = Object.fromEntries(KEYS.map((k) => [k, 0])) as Record<MicroKey, number>;
  let unknownKcal = 0;
  for (const l of logs) {
    const m = microsForLog(l);
    if (!m) {
      unknownKcal += l.kcal;
      continue;
    }
    for (const k of KEYS) total[k] += m[k] ?? 0;
  }
  return { total, unknownKcal };
}

const VEG_TIPS: Record<MicroKey, string> = {
  fiber: 'Swap white rice for brown/bajra roti, add a katori of chana, rajma or sprouts, keep the salad',
  b12: 'Milk, curd, paneer and whey are your only natural sources — on a veg diet a B12 supplement is commonly advised; ask a doctor',
  iron: 'Soya chunks, rajma, masoor, palak and poha; squeeze lemon on dal and keep chai away from meals',
  calcium: 'Curd, paneer, milk, ragi and tofu — two dairy servings covers most of it',
  zinc: 'Pumpkin seeds, chana, soya, cashews, paneer and oats',
  magnesium: 'Nuts, seeds, oats, dals and dark leafy greens',
  potassium: 'Coconut water, bananas, dals, potatoes and curd',
  vitC: 'Guava, amla, oranges, lemon and capsicum — have some with your iron-rich meals',
  sodium: 'Go easy on pickles, papad, namkeen, instant noodles and restaurant gravies',
  sugar: 'Watch chai sugar, sweets, juices and flavoured milks',
};

export type MicroStatus = { key: MicroKey; value: number; target: number; pct: number; status: 'low' | 'ok' | 'over'; tip?: string };

/** Score each micro against its target; `days` averages a multi-day window. */
export function microReport(total: Record<MicroKey, number>, targets: Record<MicroKey, number>, days = 1): MicroStatus[] {
  return MICRO_ORDER.map((key) => {
    const value = total[key] / days;
    const target = targets[key];
    const pct = target ? value / target : 0;
    const limit = MICRO_META[key].kind === 'limit';
    const status = limit ? (pct > 1 ? 'over' : 'ok') : pct < 0.7 ? 'low' : 'ok';
    return { key, value, target, pct, status, tip: status === 'ok' ? undefined : VEG_TIPS[key] };
  });
}

/**
 * Nutrients you've been short on: the 7-day average (days with food logged, ending `date`) under
 * 70 % of target. Needs 2+ logged days so one odd day doesn't steer the plan.
 */
export function weekGaps(logs: (Loggable & { kcal: number; date: string })[], date: string, sex: 'male' | 'female', kcal: number) {
  const from = new Date(`${date}T12:00:00Z`);
  from.setUTCDate(from.getUTCDate() - 6);
  const f = from.toISOString().slice(0, 10);
  const window = logs.filter((l) => l.date >= f && l.date <= date);
  const days = new Set(window.map((l) => l.date)).size;
  if (days < 2) return [];
  const targets = microTargets(sex, kcal);
  return microReport(sumMicros(window).total, targets, days)
    .filter((r) => r.status === 'low' && MICRO_META[r.key].kind === 'goal')
    .sort((a, b) => a.pct - b.pct)
    .map((r) => ({ key: r.key, target: r.target, pct: r.pct }));
}

/**
 * Everyday dishes richest in one nutrient per serving (share of the daily target), limited to
 * what your diet allows. Foods you already eat (logged, or on your cook's menu) rank first —
 * a suggestion you'll actually follow beats a "perfect" one you won't.
 */
export function richIn(
  key: MicroKey,
  foods: { id: string; name: string; serving: string; kcal: number; cat: string }[],
  target: number,
  n = 4,
  opts: { allowed: (id: string) => boolean; liked?: Set<string> },
) {
  const skip = /Raw|Non-veg|Sweets|Restaurant|Packaged|Drinks$/;
  return foods
    .filter((f) => !skip.test(f.cat) && T[f.id] && opts.allowed(f.id))
    .map((f) => {
      const share = (microsOf(f.id)![key] ?? 0) / target;
      const liked = !!opts.liked?.has(f.id);
      return { food: f, share, liked, score: share * (liked ? 1.6 : 1) };
    })
    .filter((x) => x.share >= 0.1)
    .sort((a, b) => b.score - a.score)
    .slice(0, n);
}

