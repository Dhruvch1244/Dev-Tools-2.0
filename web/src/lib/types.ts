import type { Repeat } from '../core/tasks';
import type { WorkConfig, WorkOverride } from '../core/work';
import type { CookConfig } from '../core/cook';
import type { Person } from '../core/people';
import type { DayPlan, PlanPrefs } from '../core/weekPlan';

type Stamped = { id: string; created_at: string; updated_at: string };

export type Task = Stamped & { title: string; notes: string | null; due: string | null; priority: number; done: number; done_at: string | null; repeat?: Repeat | null; remind_before?: number | null; kind?: 'plan' | 'bill' | null; place?: string | null; amount?: number | null; duration_min?: number | null; gcal_event_id?: string | null };
export type Note = Stamped & { title: string | null; body: string | null; pinned: number; color: string | null; list?: import('../core/notes').ListId | null; person?: string | null; done?: number };
export type Expense = Stamped & { amount: number; kind: 'expense' | 'income'; category: string; note: string | null; date: string };
export type Budget = Stamped & { category: string; amount: number };
export type Subscription = Stamped & { name: string; amount: number; cycle: 'monthly' | 'yearly' | 'weekly'; next_date: string; category: string };
export type Habit = Stamped & { name: string; emoji: string | null; color: string | null; archived: number; cue?: string | null; tiny?: string | null; days?: string | null };
export type HabitLog = { habit_id: string; date: string };
export type Health = Stamped & { date: string; kind: 'water' | 'sleep' | 'weight' | 'mood'; value: number };
export type Journal = Stamped & { date: string; body: string | null; mood: number | null; answers?: string | null; insights?: string | null };
export type Drop = Stamped & { kind: 'text' | 'file'; text: string | null; filename: string | null; mime: string | null; size: number | null; device: string | null; pinned?: number };
export type Settings = {
  /** The cached AI "state of my life" recap (Life page). */
  lifeSummary?: { at: string; text: string };
  /** Where you live — your dot on the Pit crew map and the distance to everyone. */
  home?: { city: string; lat: number; lon: number };
  name?: string;
  currency?: string;
  waterGoal?: number;
  /** Days the gym cycle has been pushed back (skipped/extra days). */
  gymShift?: number;
  gymTemplates?: Partial<Record<string, { name: string; sets: number; reps: string }[]>>;
  /** Today's AI-planned session (core/gymAi GymPlan), used instead of the template on that date. */
  gymPlan?: { date: string; day_type: import('../core/gym').DayType; plan: import('../core/gymAi').GymPlan };
  fuel?: { sex: 'male' | 'female'; age: number; height: number; weight: number; activity: number; goal: 'cut' | 'maintain' | 'bulk' };
  dsaStart?: string;
  dsaLang?: 'cpp' | 'java' | 'py';
  handles?: { codeforces?: string; leetcode?: string; codechef?: string };
  briefs?: Briefs;
  /** Default 'veg' (no meat, fish or eggs). */
  diet?: 'veg' | 'egg' | 'nonveg';
  /** Office schedule: connect/home weeks, shifts, commute. */
  work?: Partial<WorkConfig>;
  /** Per-day office overrides (leave, WFH swap, other shift), keyed by date. */
  workOverrides?: Record<string, WorkOverride>;
  cook?: Partial<CookConfig>;
  /** Daily whey goal (core/cook WheyPlan). */
  whey?: { scoops: number; from: string };
  /** Shopping days: big weekly shop and the mid-week top-up (0 = Sunday). */
  shops?: { major: number; minor: number };
  /** Daily supplements/medicines with a reminder time. */
  /** UPI id shown in 'please pay' messages. */
  upi?: string;
  planPrefs?: Partial<PlanPrefs>;
  /** Locked days of the auto-planned week, keyed by date. */
  weekPlan?: { days?: Record<string, DayPlan>; remind?: boolean };
  supplements?: { id: string; name: string; at: string; dose?: string }[];
  /** Swapped cook-plan dishes by date. */
  cookPicks?: Record<string, { breakfast?: string; dinner?: string }>;
};
export type LearnRow = Stamped & { module: string; stars: number; xp: number; attempts: number; done_at: string | null };
export type Workout = Stamped & { date: string; day_type: string; notes: string | null; started_at: string | null; finished_at: string | null };
export type GymSet = Stamped & { workout_id: string; date: string; exercise: string; set_no: number; weight: number; reps: number };
export type FoodLog = Stamped & { date: string; meal: string; food_id: string | null; name: string; qty: number; unit: string | null; kcal: number; protein: number; carbs: number; fat: number; micros?: string | null };
export type CustomFood = Stamped & { name: string; serving: string; kcal: number; protein: number; carbs: number; fat: number };
export type DsaProgress = { problem: string; status: 'todo' | 'attempted' | 'solved' | 'revisit'; confidence: number | null; minutes: number | null; notes: string | null; sol_cpp: string | null; sol_java: string | null; sol_py: string | null; solved_at: string | null; revisit_at: string | null; updated_at: string };
export type DsaTest = Stamped & { kind: 'weekly' | 'mega' | 'mock'; ref: string; started_at: string; finished_at: string | null; duration_min: number; results: string | null; score: number | null };
export type Activity = Stamped & { date: string; type: string; started_at: string | null; duration_min: number; distance_km: number | null; kcal: number | null; rpe: number | null; notes: string | null; details: string | null; route: string | null };
export type Routine = Stamped & { name: string; emoji: string | null; days: string; time: string; duration_min: number; steps: string | null; habit_id: string | null; remind: number; gcal_event_id: string | null; active: number };
export type RoutineLog = { routine_id: string; date: string; steps: string | null };
export type PersonRow = Stamped & Person;
export type SplitRow = Stamped & { expense_id: string | null; person_id: string; amount: number; note: string | null; date: string; settled_at: string | null; items?: string | null };
export type ContactRow = Stamped & { name: string; phone: string | null; birthday: string | null };
export type ShopRow = Stamped & { name: string; qty: string | null; done: number; source: string | null; trip?: 'major' | 'minor' | null };
export type SavedMeal = Stamped & { name: string; meal: string | null; items: string };
export type Briefs = { morning?: boolean; evening?: boolean; morningAt?: string; eveningAt?: string; water?: boolean };
