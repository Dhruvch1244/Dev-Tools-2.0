// Calorie & macro targets. Pure functions, no React.

export type Profile = { sex: 'male' | 'female'; age: number; height: number; weight: number; activity: number; goal: 'cut' | 'maintain' | 'bulk' };

export const ACTIVITY = [
  { value: 1.2, label: 'Desk job, little exercise' },
  { value: 1.375, label: 'Light: 1–3 workouts / week' },
  { value: 1.55, label: 'Moderate: 4–5 workouts / week' },
  { value: 1.725, label: 'Hard: 6–7 workouts / week' },
];

/** 5 lifting days a week (the user's 7-day split) is "moderate" by default. */
export const DEFAULT_PROFILE: Profile = { sex: 'male', age: 24, height: 175, weight: 72, activity: 1.55, goal: 'maintain' };

/** Mifflin–St Jeor — the most accurate of the common BMR equations for non-obese adults. */
export const bmr = (p: Profile) => 10 * p.weight + 6.25 * p.height - 5 * p.age + (p.sex === 'male' ? 5 : -161);

/**
 * Targets. Cut = −450 kcal (~0.4 kg/week, gentle enough to keep strength on a PPL split);
 * bulk = +300 kcal (lean gain). Protein scales with bodyweight and is higher on a cut to protect
 * muscle; fat is held at 25% of energy; carbs take the remainder (they fuel the training).
 */
export function targets(p: Profile) {
  const b = bmr(p);
  const tdee = b * p.activity;
  const kcal = Math.round(tdee + (p.goal === 'cut' ? -450 : p.goal === 'bulk' ? 300 : 0));
  const protein = Math.round(p.weight * (p.goal === 'cut' ? 2.0 : 1.8));
  const fat = Math.round((kcal * 0.25) / 9);
  const carbs = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4));
  return { bmr: Math.round(b), tdee: Math.round(tdee), kcal, protein, carbs, fat };
}

export type Macros = { kcal: number; protein: number; carbs: number; fat: number };
export const sumMacros = (rows: Macros[]): Macros =>
  rows.reduce((a, r) => ({ kcal: a.kcal + r.kcal, protein: a.protein + r.protein, carbs: a.carbs + r.carbs, fat: a.fat + r.fat }), { kcal: 0, protein: 0, carbs: 0, fat: 0 });

export const MEALS = [
  { id: 'breakfast', label: 'Breakfast', hint: 'Out-lap' },
  { id: 'lunch', label: 'Lunch', hint: 'Stint 1' },
  { id: 'snacks', label: 'Snacks', hint: 'Pit window' },
  { id: 'dinner', label: 'Dinner', hint: 'Final stint' },
] as const;
