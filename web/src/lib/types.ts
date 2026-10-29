type Stamped = { id: string; created_at: string; updated_at: string };

export type Task = Stamped & { title: string; notes: string | null; due: string | null; priority: number; done: number; done_at: string | null };
export type Note = Stamped & { title: string | null; body: string | null; pinned: number; color: string | null };
export type Expense = Stamped & { amount: number; kind: 'expense' | 'income'; category: string; note: string | null; date: string };
export type Budget = Stamped & { category: string; amount: number };
export type Subscription = Stamped & { name: string; amount: number; cycle: 'monthly' | 'yearly' | 'weekly'; next_date: string; category: string };
export type Habit = Stamped & { name: string; emoji: string | null; color: string | null; archived: number };
export type HabitLog = { habit_id: string; date: string };
export type Health = Stamped & { date: string; kind: 'water' | 'sleep' | 'weight' | 'mood'; value: number };
export type Journal = Stamped & { date: string; body: string | null; mood: number | null };
export type Drop = Stamped & { kind: 'text' | 'file'; text: string | null; filename: string | null; mime: string | null; size: number | null; device: string | null };
export type Settings = {
  name?: string;
  currency?: string;
  waterGoal?: number;
  /** Days the gym cycle has been pushed back (skipped/extra days). */
  gymShift?: number;
  gymTemplates?: Partial<Record<string, { name: string; sets: number; reps: string }[]>>;
  fuel?: { sex: 'male' | 'female'; age: number; height: number; weight: number; activity: number; goal: 'cut' | 'maintain' | 'bulk' };
  dsaStart?: string;
  dsaLang?: 'cpp' | 'java' | 'py';
  handles?: { codeforces?: string; leetcode?: string; codechef?: string };
  briefs?: Briefs;
};
export type Workout = Stamped & { date: string; day_type: string; notes: string | null; started_at: string | null; finished_at: string | null };
export type GymSet = Stamped & { workout_id: string; date: string; exercise: string; set_no: number; weight: number; reps: number };
export type FoodLog = Stamped & { date: string; meal: string; food_id: string | null; name: string; qty: number; unit: string | null; kcal: number; protein: number; carbs: number; fat: number };
export type CustomFood = Stamped & { name: string; serving: string; kcal: number; protein: number; carbs: number; fat: number };
export type DsaProgress = { problem: string; status: 'todo' | 'attempted' | 'solved' | 'revisit'; confidence: number | null; minutes: number | null; notes: string | null; sol_cpp: string | null; sol_java: string | null; sol_py: string | null; solved_at: string | null; revisit_at: string | null; updated_at: string };
export type DsaTest = Stamped & { kind: 'weekly' | 'mega' | 'mock'; ref: string; started_at: string; finished_at: string | null; duration_min: number; results: string | null; score: number | null };
export type Activity = Stamped & { date: string; type: string; started_at: string | null; duration_min: number; distance_km: number | null; kcal: number | null; rpe: number | null; notes: string | null; details: string | null; route: string | null };
export type Routine = Stamped & { name: string; emoji: string | null; days: string; time: string; duration_min: number; steps: string | null; habit_id: string | null; remind: number; gcal_event_id: string | null; active: number };
export type RoutineLog = { routine_id: string; date: string; steps: string | null };
export type SavedMeal = Stamped & { name: string; meal: string | null; items: string };
export type Briefs = { morning?: boolean; evening?: boolean; morningAt?: string; eveningAt?: string };
