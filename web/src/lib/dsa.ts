import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { marked } from 'marked';
import { api, useSettings, wasQueued } from './api';
import { addDays, today } from './format';
import { DEFAULT_START } from '../core/dsa/plan';
import type { DsaProgress } from './types';

// Raw HTML in notes is dropped rather than rendered — markdown covers everything notes need.
marked.use({ renderer: { html: () => '' }, gfm: true });
export const md = (s: string) => marked.parse(s, { async: false }) as string;

export function useDsa() {
  const qc = useQueryClient();
  const { data = [], isSuccess } = useQuery({ queryKey: ['dsa'], queryFn: () => api<DsaProgress[]>('/dsa') });
  const byId = new Map(data.map((p) => [p.problem, p]));
  const save = useMutation({
    mutationFn: ({ problem, ...patch }: Partial<DsaProgress> & { problem: string }) => api<DsaProgress>(`/dsa/${problem}`, { method: 'PUT', body: JSON.stringify(patch) }),
    onMutate: ({ problem, ...patch }) =>
      qc.setQueryData<DsaProgress[]>(['dsa'], (old = []) => {
        const hit = old.some((p) => p.problem === problem);
        const base = { problem, status: 'todo', confidence: null, minutes: null, notes: null, sol_cpp: null, sol_java: null, sol_py: null, solved_at: null, revisit_at: null, updated_at: '' } as DsaProgress;
        return hit ? old.map((p) => (p.problem === problem ? { ...p, ...patch } : p)) : [...old, { ...base, ...patch }];
      }),
    onSettled: (d) => (wasQueued(d) ? undefined : qc.invalidateQueries({ queryKey: ['dsa'] })),
  });
  return { list: data, ready: isSuccess, get: (id: string) => byId.get(id), save: save.mutate };
}

export function useSeason() {
  const { settings, save } = useSettings();
  return { start: settings.dsaStart ?? DEFAULT_START, setStart: (d: string) => save({ dsaStart: d }), lang: settings.dsaLang ?? 'cpp', setLang: (l: 'cpp' | 'java' | 'py') => save({ dsaLang: l }) };
}

/** Spaced revision: shakier solves come back sooner. Each successful revisit stretches the gap. */
const GAP: Record<number, number> = { 1: 2, 2: 5, 3: 14 };
export const firstRevisit = (confidence: number) => addDays(today(), GAP[confidence] ?? 5);
export function nextRevisit(p: DsaProgress) {
  const last = p.revisit_at && p.solved_at ? Math.max(2, Math.round((Date.parse(p.revisit_at) - Date.parse(p.solved_at.slice(0, 10))) / 86_400_000)) : GAP[p.confidence ?? 2];
  return addDays(today(), Math.round(last * 2.5));
}
