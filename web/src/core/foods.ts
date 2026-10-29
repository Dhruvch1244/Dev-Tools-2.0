// Common Indian household dishes, per typical home serving. Values are approximate (home cooking
// varies a lot with oil/ghee) — compiled from IFCT-style tables and common recipe averages.
// A katori here means ~150 g of cooked dish. Pure data: no React imports.

export type Food = { id: string; name: string; serving: string; kcal: number; protein: number; carbs: number; fat: number; cat: FoodCat };
import { MORE } from './foodsMore';

export type FoodCat = 'Breads' | 'Rice' | 'Dal & Curry' | 'Sabzi' | 'Non-veg' | 'Breakfast' | 'Dairy & Drinks' | 'Snacks' | 'Fruits & Nuts' | 'Sweets' | 'Extras' | 'South Indian' | 'Regional' | 'Restaurant & Fast food' | 'Packaged' | 'Drinks' | 'Raw (per 100 g)' | 'More home food';

type Row = [id: string, name: string, serving: string, kcal: number, protein: number, carbs: number, fat: number];
const group = (cat: FoodCat, rows: Row[]): Food[] => rows.map(([id, name, serving, kcal, protein, carbs, fat]) => ({ id, name, serving, kcal, protein, carbs, fat, cat }));

export const FOODS: Food[] = [
  ...group('Breads', [
    ['roti', 'Roti / Phulka', '1 medium (35 g atta)', 104, 3.6, 21, 0.6],
    ['roti-ghee', 'Roti with ghee', '1 medium', 145, 3.6, 21, 5],
    ['paratha', 'Plain paratha', '1 piece', 220, 4.5, 30, 9],
    ['aloo-paratha', 'Aloo paratha', '1 piece', 290, 6, 40, 12],
    ['paneer-paratha', 'Paneer paratha', '1 piece', 320, 11, 34, 15],
    ['gobi-paratha', 'Gobi paratha', '1 piece', 260, 6, 36, 10],
    ['thepla', 'Methi thepla', '1 piece', 120, 3, 16, 5],
    ['puri', 'Puri', '1 piece', 100, 1.8, 11, 5.5],
    ['bhatura', 'Bhatura', '1 piece', 300, 6, 40, 13],
    ['naan', 'Naan', '1 piece', 260, 8, 45, 5],
    ['butter-naan', 'Butter naan', '1 piece', 320, 8, 45, 12],
    ['missi-roti', 'Missi roti', '1 piece', 140, 5, 22, 3.5],
    ['makki-roti', 'Makki ki roti', '1 piece', 180, 3.5, 30, 5.5],
    ['bajra-roti', 'Bajra roti', '1 piece', 160, 4.5, 28, 3.5],
    ['jowar-roti', 'Jowar roti', '1 piece', 140, 4.5, 28, 1.5],
    ['bread-white', 'White bread', '1 slice', 70, 2.5, 13, 1],
    ['bread-brown', 'Brown bread', '1 slice', 65, 3, 12, 1],
  ]),
  ...group('Rice', [
    ['rice', 'Steamed rice', '1 katori (150 g)', 195, 4, 42, 0.5],
    ['brown-rice', 'Brown rice', '1 katori', 170, 4, 36, 1.4],
    ['jeera-rice', 'Jeera rice', '1 katori', 240, 4.5, 42, 6],
    ['pulao', 'Veg pulao', '1 katori', 260, 5, 42, 8],
    ['veg-biryani', 'Veg biryani', '1 plate (250 g)', 420, 9, 62, 15],
    ['chicken-biryani', 'Chicken biryani', '1 plate (300 g)', 540, 26, 62, 20],
    ['curd-rice', 'Curd rice', '1 katori', 220, 6, 32, 7],
    ['lemon-rice', 'Lemon rice', '1 katori', 250, 4.5, 40, 8],
    ['khichdi', 'Dal khichdi', '1 katori', 210, 7.5, 34, 5],
    ['fried-rice', 'Veg fried rice', '1 plate', 380, 8, 58, 12],
  ]),
  ...group('Dal & Curry', [
    ['dal-tadka', 'Dal tadka (toor)', '1 katori', 180, 9, 22, 6],
    ['dal-fry', 'Dal fry', '1 katori', 190, 9, 22, 7],
    ['moong-dal', 'Moong dal', '1 katori', 150, 9, 20, 4],
    ['masoor-dal', 'Masoor dal', '1 katori', 160, 10, 20, 4],
    ['chana-dal', 'Chana dal', '1 katori', 200, 10, 26, 6],
    ['dal-makhani', 'Dal makhani', '1 katori', 280, 11, 26, 14],
    ['rajma', 'Rajma', '1 katori', 220, 10, 30, 6],
    ['chole', 'Chole', '1 katori', 260, 11, 34, 9],
    ['kadhi', 'Kadhi pakora', '1 katori', 230, 7, 18, 14],
    ['sambar', 'Sambar', '1 katori', 130, 6, 18, 4],
    ['rasam', 'Rasam', '1 katori', 60, 2, 9, 2],
    ['sprouts', 'Sprouts salad', '1 katori', 110, 8, 18, 1],
    ['soya-curry', 'Soya chunks curry', '1 katori', 230, 20, 16, 9],
  ]),
  ...group('Sabzi', [
    ['aloo-gobi', 'Aloo gobi', '1 katori', 170, 4, 18, 9],
    ['aloo-sabzi', 'Aloo sabzi (dry)', '1 katori', 190, 3, 26, 9],
    ['aloo-matar', 'Aloo matar', '1 katori', 200, 5.5, 24, 9],
    ['dum-aloo', 'Dum aloo', '1 katori', 250, 4, 26, 15],
    ['bhindi', 'Bhindi masala', '1 katori', 150, 3.5, 12, 10],
    ['baingan-bharta', 'Baingan bharta', '1 katori', 140, 3, 12, 9],
    ['mix-veg', 'Mixed veg', '1 katori', 160, 4.5, 16, 9],
    ['lauki', 'Lauki sabzi', '1 katori', 100, 2, 10, 6],
    ['cabbage', 'Patta gobhi sabzi', '1 katori', 110, 2.5, 10, 7],
    ['mushroom', 'Mushroom masala', '1 katori', 170, 5, 10, 12],
    ['palak-paneer', 'Palak paneer', '1 katori', 270, 14, 10, 20],
    ['paneer-butter-masala', 'Paneer butter masala', '1 katori', 360, 14, 14, 28],
    ['kadai-paneer', 'Kadai paneer', '1 katori', 300, 14, 12, 22],
    ['matar-paneer', 'Matar paneer', '1 katori', 280, 13, 16, 18],
    ['shahi-paneer', 'Shahi paneer', '1 katori', 380, 14, 14, 30],
    ['paneer-bhurji', 'Paneer bhurji', '1 katori', 280, 18, 6, 20],
  ]),
  ...group('Non-veg', [
    ['chicken-curry', 'Chicken curry', '1 katori (150 g)', 290, 25, 6, 18],
    ['butter-chicken', 'Butter chicken', '1 katori', 380, 26, 10, 26],
    ['tandoori-chicken', 'Tandoori chicken', '2 leg pieces', 260, 32, 4, 13],
    ['chicken-tikka', 'Chicken tikka', '6 pieces', 230, 30, 4, 10],
    ['chicken-breast', 'Grilled chicken breast', '100 g', 165, 31, 0, 3.6],
    ['egg-curry', 'Egg curry', '2 eggs + gravy', 300, 15, 10, 22],
    ['fish-curry', 'Fish curry', '1 katori', 240, 22, 6, 14],
    ['mutton-curry', 'Mutton curry', '1 katori', 340, 24, 6, 24],
    ['keema', 'Keema', '1 katori', 320, 22, 8, 22],
    ['chicken-roll', 'Chicken kathi roll', '1 roll', 420, 22, 42, 18],
  ]),
  ...group('Breakfast', [
    ['poha', 'Poha', '1 plate (200 g)', 270, 5.5, 46, 7],
    ['upma', 'Upma', '1 plate', 250, 6, 38, 8],
    ['idli', 'Idli', '1 piece', 58, 2, 12, 0.2],
    ['dosa', 'Plain dosa', '1 piece', 165, 4, 27, 4.5],
    ['masala-dosa', 'Masala dosa', '1 piece', 330, 7, 46, 13],
    ['uttapam', 'Uttapam', '1 piece', 220, 6, 34, 6],
    ['medu-vada', 'Medu vada', '1 piece', 140, 4, 13, 8],
    ['besan-chilla', 'Besan chilla', '1 piece', 150, 7, 18, 5],
    ['moong-chilla', 'Moong dal chilla', '1 piece', 130, 8, 16, 3.5],
    ['sabudana-khichdi', 'Sabudana khichdi', '1 plate', 380, 3, 60, 14],
    ['dhokla', 'Dhokla', '4 pieces', 160, 6, 22, 5],
    ['oats-milk', 'Oats with milk', '1 bowl (40 g oats)', 250, 11, 35, 7],
    ['masala-oats', 'Masala oats', '1 bowl', 200, 6, 30, 6],
    ['boiled-egg', 'Boiled egg', '1 large', 78, 6.3, 0.6, 5.3],
    ['egg-white', 'Egg white', '1 egg', 17, 3.6, 0.2, 0.1],
    ['omelette', 'Omelette', '2 eggs', 190, 13, 1.5, 14],
    ['egg-bhurji', 'Egg bhurji', '2 eggs', 220, 13, 4, 17],
    ['bread-omelette', 'Bread omelette', '2 slices + 2 eggs', 330, 18, 28, 16],
  ]),
  ...group('Dairy & Drinks', [
    ['milk-toned', 'Toned milk', '1 glass (250 ml)', 150, 8, 12, 7.5],
    ['milk-full', 'Full cream milk', '1 glass (250 ml)', 215, 8, 12, 15],
    ['curd', 'Curd / dahi', '1 katori (100 g)', 60, 3.5, 4.5, 3.2],
    ['raita', 'Raita', '1 katori', 90, 4, 7, 4.5],
    ['paneer', 'Paneer (raw)', '100 g', 265, 18, 3.5, 20],
    ['lassi', 'Sweet lassi', '1 glass', 250, 7, 38, 7],
    ['chaas', 'Chaas / buttermilk', '1 glass', 40, 2, 4, 1.5],
    ['chai', 'Chai (milk + sugar)', '1 cup', 90, 2, 12, 3],
    ['coffee', 'Coffee (milk + sugar)', '1 cup', 100, 3, 13, 3.5],
    ['black-coffee', 'Black coffee', '1 cup', 2, 0.3, 0, 0],
    ['whey', 'Whey protein', '1 scoop (30 g)', 120, 24, 3, 1.5],
    ['coconut-water', 'Coconut water', '1 glass', 45, 0.5, 9, 0.5],
    ['nimbu-pani', 'Nimbu pani (sweet)', '1 glass', 80, 0, 20, 0],
    ['cola', 'Cola', '1 can (330 ml)', 140, 0, 39, 0],
  ]),
  ...group('Snacks', [
    ['samosa', 'Samosa', '1 piece', 260, 4, 30, 14],
    ['kachori', 'Kachori', '1 piece', 290, 5, 30, 17],
    ['pakora', 'Pakora / bhajiya', '5 pieces', 250, 5, 22, 16],
    ['pav-bhaji', 'Pav bhaji', '1 plate (2 pav)', 450, 11, 60, 18],
    ['vada-pav', 'Vada pav', '1 piece', 290, 6, 40, 12],
    ['pani-puri', 'Pani puri', '6 pieces', 180, 3, 30, 5],
    ['bhel', 'Bhel puri', '1 plate', 260, 6, 40, 8],
    ['sev-puri', 'Sev puri', '6 pieces', 300, 6, 38, 14],
    ['dabeli', 'Dabeli', '1 piece', 300, 6, 45, 11],
    ['maggi', 'Maggi', '1 pack', 350, 8, 50, 14],
    ['veg-momos', 'Veg momos', '6 pieces', 240, 7, 36, 7],
    ['chicken-momos', 'Chicken momos', '6 pieces', 280, 14, 30, 11],
    ['chowmein', 'Veg chowmein', '1 plate', 400, 9, 55, 16],
    ['namkeen', 'Namkeen / bhujia', '30 g', 160, 4, 14, 10],
    ['chips', 'Potato chips', '1 small pack (30 g)', 160, 2, 15, 10],
    ['marie', 'Marie biscuits', '4 pieces', 120, 2, 20, 3.5],
    ['roasted-chana', 'Roasted chana', '30 g', 110, 6, 18, 2],
    ['makhana', 'Roasted makhana', '30 g', 110, 3, 22, 0.3],
  ]),
  ...group('Fruits & Nuts', [
    ['banana', 'Banana', '1 medium', 105, 1.3, 27, 0.4],
    ['apple', 'Apple', '1 medium', 95, 0.5, 25, 0.3],
    ['mango', 'Mango', '1 cup sliced', 100, 1.4, 25, 0.6],
    ['papaya', 'Papaya', '1 cup', 60, 0.7, 15, 0.2],
    ['orange', 'Orange', '1 medium', 60, 1.2, 15, 0.2],
    ['guava', 'Guava', '1 medium', 70, 2.6, 14, 1],
    ['dates', 'Dates', '3 pieces', 70, 0.6, 18, 0.1],
    ['peanuts', 'Peanuts', '30 g', 170, 7.5, 5, 14],
    ['almonds', 'Almonds', '10 pieces', 70, 2.5, 2.5, 6],
    ['walnuts', 'Walnuts', '4 halves', 52, 1.2, 1.1, 5.2],
    ['peanut-butter', 'Peanut butter', '1 tbsp', 95, 3.5, 3, 8],
  ]),
  ...group('Sweets', [
    ['gulab-jamun', 'Gulab jamun', '1 piece', 150, 2, 22, 6],
    ['rasgulla', 'Rasgulla', '1 piece', 120, 2.5, 24, 1.5],
    ['jalebi', 'Jalebi', '2 pieces (50 g)', 200, 1.5, 30, 8],
    ['kheer', 'Kheer', '1 katori', 230, 6, 32, 9],
    ['sooji-halwa', 'Sooji halwa', '1 katori', 300, 4, 40, 14],
    ['gajar-halwa', 'Gajar halwa', '1 katori', 320, 6, 40, 16],
    ['besan-ladoo', 'Besan ladoo', '1 piece', 180, 3, 20, 10],
    ['barfi', 'Barfi', '1 piece', 140, 3, 18, 6],
    ['ice-cream', 'Ice cream', '1 scoop', 140, 2.5, 17, 7],
  ]),
  ...group('Extras', [
    ['salad', 'Green salad', '1 plate', 40, 1.5, 8, 0.3],
    ['papad', 'Roasted papad', '1 piece', 40, 2.5, 7, 0.3],
    ['pickle', 'Achaar', '1 tbsp', 30, 0.2, 1, 3],
    ['green-chutney', 'Green chutney', '2 tbsp', 15, 0.5, 2, 0.5],
    ['coconut-chutney', 'Coconut chutney', '2 tbsp', 70, 1, 3, 6],
    ['ghee', 'Ghee', '1 tsp (5 g)', 45, 0, 0, 5],
    ['butter', 'Butter', '1 tsp', 36, 0, 0, 4],
    ['oil', 'Cooking oil', '1 tsp', 40, 0, 0, 4.5],
    ['sugar', 'Sugar', '1 tsp', 20, 0, 5, 0],
    ['soya-chunks', 'Soya chunks (dry)', '50 g', 175, 26, 16, 0.3],
  ]),
  ...Object.entries(MORE).flatMap(([cat, rows]) => group(cat as FoodCat, rows)),
];

export const FOOD_CATS = [...new Set(FOODS.map((f) => f.cat))];

/** Match all query words anywhere in the name, so "pan but" finds "Paneer butter masala". */
export function searchFoods<T extends { name: string }>(foods: T[], q: string) {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return foods;
  return foods.filter((f) => {
    const n = f.name.toLowerCase();
    return words.every((w) => n.includes(w));
  });
}

// ---------- Diet ----------
// Explicit lists, not keyword matching: "kanda poha" contains "anda" and "veggie" contains "egg".
// Baked goods and mayo stay vegetarian — eggless versions are the norm in India.
const MEAT = new Set(
  `chicken-biryani chicken-curry butter-chicken tandoori-chicken chicken-tikka chicken-breast fish-curry mutton-curry keema chicken-roll
  chicken-momos macher-jhol rogan-josh yakhni haleem hyd-dum-biryani kerala-fish-curry chettinad-chicken bamboo-pork chicken-65
  chilli-chicken chicken-noodles chicken-tikka-masala kadai-chicken mutton-biryani shawarma burger-chicken pizza-chicken sandwich-chicken
  subway-6-chicken fried-chicken nuggets wrap-chicken salad-chicken raw-chicken-breast raw-chicken-thigh raw-mutton raw-fish-rohu
  raw-prawns chicken-bhuna chicken-keema chicken-soup momo-soup dhansak club-sandwich`.split(/\s+/),
);
const EGG = new Set(
  `egg-curry boiled-egg egg-white omelette egg-bhurji bread-omelette akuri egg-fried-rice egg-biryani egg-roll raw-egg egg-paratha
  egg-masala-dry egg-sandwich egg-white-omelette`.split(/\s+/),
);

/** veg = no meat, fish or eggs (dairy fine) · egg = eggetarian · nonveg = everything. */
export type Diet = 'veg' | 'egg' | 'nonveg';
export const DIETS: { value: Diet; label: string; hint: string }[] = [
  { value: 'veg', label: 'Vegetarian', hint: 'No meat, fish or eggs · dairy is fine' },
  { value: 'egg', label: 'Eggetarian', hint: 'Vegetarian + eggs' },
  { value: 'nonveg', label: 'Non-veg', hint: 'Everything' },
];
export const foodKind = (id: string) => (MEAT.has(id) ? 'meat' : EGG.has(id) ? 'egg' : 'veg');
export const allowedFor = (diet: Diet, id: string) => {
  const k = foodKind(id);
  return diet === 'nonveg' || k === 'veg' || (diet === 'egg' && k === 'egg');
};
