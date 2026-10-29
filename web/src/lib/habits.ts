import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, useList, wasQueued } from './api';
import { addDays, haptic, today } from './format';
import { dueOn, parseDays, streak as streakOf, type HabitHistory } from '../core/habits';
import type { Habit, HabitLog } from './types';

/** Habits with their check-ins (last ~6 months), streaks that respect each habit's days, and a toggle. */
export function useHabits() {
  const { data: all = [] } = useList<Habit>('habits');
  const from = addDays(today(), -190);
  const { data: logs = [] } = useQuery({ queryKey: ['habit_logs', from], queryFn: () => api<HabitLog[]>(`/habit_logs?from=${from}`) });
  const qc = useQueryClient();
  const toggle = useMutation({
    mutationFn: (v: HabitLog) => api('/habit_logs/toggle', { method: 'POST', body: JSON.stringify(v) }),
    onMutate: (v) =>
      qc.setQueryData<HabitLog[]>(['habit_logs', from], (old = []) =>
        old.some((l) => l.habit_id === v.habit_id && l.date === v.date) ? old.filter((l) => !(l.habit_id === v.habit_id && l.date === v.date)) : [...old, v],
      ),
    onSettled: (d) => (wasQueued(d) ? undefined : qc.invalidateQueries({ queryKey: ['habit_logs'] })),
  });
  const habits = all.filter((h) => !h.archived);
  const history: HabitHistory[] = useMemo(() => {
    const by = new Map<string, Set<string>>();
    for (const l of logs) by.set(l.habit_id, (by.get(l.habit_id) ?? new Set()).add(l.date));
    return habits.map((h) => ({ id: h.id, days: parseDays(h.days), done: by.get(h.id) ?? new Set() }));
  }, [habits, logs]);
  const of = (id: string) => history.find((h) => h.id === id) ?? { id, days: parseDays(null), done: new Set<string>() };
  const isDone = (id: string, date: string) => of(id).done.has(date);
  const streak = (id: string) => streakOf(of(id).done, of(id).days, today());
  const isDue = (id: string, date = today()) => dueOn(of(id).days, date);
  return { habits, history, of, isDone, isDue, streak, toggle: (habit_id: string, date: string) => (haptic(12), toggle.mutate({ habit_id, date })) };
}
