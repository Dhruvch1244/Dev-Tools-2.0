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
export type Settings = { name?: string; currency?: string; waterGoal?: number };
