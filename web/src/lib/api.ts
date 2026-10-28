import { useEffect, useState } from 'react';
import { QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Settings } from './types';

export const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: true, retry: 1 } },
});

export async function api<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const isJson = typeof init.body === 'string';
  const res = await fetch('/api' + path, { ...init, headers: isJson ? { 'content-type': 'application/json' } : undefined });
  if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? res.statusText);
  return (res.status === 204 ? undefined : await res.json()) as T;
}

type Range = { from?: string; to?: string };
const qs = (r?: Range) => {
  const p = new URLSearchParams(Object.entries(r ?? {}).filter(([, v]) => v) as [string, string][]).toString();
  return p ? `?${p}` : '';
};

/** List a generic resource. The query key's first element is the resource name, which live-sync invalidates. */
export function useList<T>(resource: string, range?: Range) {
  return useQuery({ queryKey: [resource, range ?? {}], queryFn: () => api<T[]>(`/r/${resource}${qs(range)}`) });
}

type Row = { id: string };

/** Create/update/remove with optimistic cache writes so every tap feels instant. */
export function useResource<T extends Row>(resource: string) {
  const qc = useQueryClient();
  const patchCaches = (fn: (rows: T[]) => T[]) => qc.setQueriesData<T[]>({ queryKey: [resource] }, (old) => (Array.isArray(old) ? fn(old) : old));
  const settle = () => qc.invalidateQueries({ queryKey: [resource] });

  const create = useMutation({
    mutationFn: (data: Partial<T>) => api<T>(`/r/${resource}`, { method: 'POST', body: JSON.stringify(data) }),
    onSettled: settle,
  });
  const update = useMutation({
    mutationFn: ({ id, ...data }: Partial<T> & Row) => api<T>(`/r/${resource}/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    onMutate: ({ id, ...data }) => patchCaches((rows) => rows.map((r) => (r.id === id ? { ...r, ...data } : r))),
    onSettled: settle,
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/r/${resource}/${id}`, { method: 'DELETE' }),
    onMutate: (id) => patchCaches((rows) => rows.filter((r) => r.id !== id)),
    onSettled: settle,
  });
  return { create: create.mutateAsync, update: update.mutate, remove: remove.mutate };
}

export function useSettings() {
  const qc = useQueryClient();
  const { data = {} } = useQuery({ queryKey: ['settings'], queryFn: () => api<Settings>('/settings') });
  const save = (patch: Settings) => {
    qc.setQueryData<Settings>(['settings'], (s) => ({ ...s, ...patch }));
    void api('/settings', { method: 'PUT', body: JSON.stringify(patch) });
  };
  return { settings: data, save };
}

/** Subscribes to server-sent change events and refetches whatever another device just wrote. */
export function useLiveSync() {
  const qc = useQueryClient();
  const [online, setOnline] = useState(false);
  useEffect(() => {
    let es: EventSource | null = null;
    let retry: ReturnType<typeof setTimeout>;
    const connect = () => {
      es = new EventSource('/api/events');
      es.addEventListener('hello', () => {
        setOnline(true);
        void qc.invalidateQueries();
      });
      es.addEventListener('change', (e) => void qc.invalidateQueries({ queryKey: [(e as MessageEvent).data] }));
      es.onerror = () => {
        setOnline(false);
        es?.close();
        retry = setTimeout(connect, 3000);
      };
    };
    connect();
    return () => {
      clearTimeout(retry);
      es?.close();
    };
  }, [qc]);
  return online;
}
