import { useEffect, useState } from 'react';
import { QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Settings } from './types';

export const queryClient = new QueryClient({
  // Mutations always run: when the laptop is unreachable, api() queues the write itself (below),
  // which survives the app being closed — react-query's own paused mutations would not.
  defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: true, retry: 1 }, mutations: { networkMode: 'always' } },
});

export const uuid = () =>
  typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, (c) => (Number(c) ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (Number(c) / 4)))).toString(16));

// ---------------------------------------------------------------------------------------------
// Outbox: JSON writes that couldn't reach the laptop (basement gym, flaky data) are kept on the
// phone and replayed in order once it's reachable again. Only network failures are queued — a
// request the server answered with an error is a real error and still throws.
// ---------------------------------------------------------------------------------------------
type Pending = { path: string; method: string; body?: string; at: number };
const OUTBOX = 'outbox';
const readOutbox = (): Pending[] => {
  try {
    return JSON.parse(localStorage.getItem(OUTBOX) ?? '[]');
  } catch {
    return [];
  }
};
const writeOutbox = (q: Pending[]) => {
  try {
    localStorage.setItem(OUTBOX, JSON.stringify(q));
  } catch {}
  window.dispatchEvent(new CustomEvent('outbox', { detail: q.length }));
};
export const outboxSize = () => readOutbox().length;
/** Marks a response that was queued, not answered — callers skip refetching (the service worker would
 * answer from its older cache and the optimistic row would vanish until sync). */
export const QUEUED = '__queued';
export const wasQueued = (d: unknown) => !!d && typeof d === 'object' && QUEUED in d;

let flushing = false;
export async function flushOutbox() {
  if (flushing) return;
  flushing = true;
  let sent = 0;
  try {
    for (;;) {
      const [next, ...rest] = readOutbox();
      if (!next) break;
      let res: Response;
      try {
        res = await fetch('/api' + next.path, { method: next.method, body: next.body, headers: next.body ? { 'content-type': 'application/json' } : undefined });
      } catch {
        break; // still unreachable — try again later
      }
      if (res.status >= 500) break;
      // 2xx done; 4xx can never succeed (bad data), so drop it rather than block the queue forever.
      writeOutbox(rest);
      sent++;
    }
  } finally {
    flushing = false;
  }
  if (sent) void queryClient.invalidateQueries();
  return sent;
}
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => void flushOutbox());
  setInterval(() => readOutbox().length && void flushOutbox(), 15_000);
}

export async function api<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const isJson = typeof init.body === 'string';
  const method = (init.method ?? 'GET').toUpperCase();
  let res: Response;
  try {
    res = await fetch('/api' + path, { ...init, headers: isJson ? { 'content-type': 'application/json' } : undefined });
  } catch (e) {
    if (method === 'GET' || (init.body !== undefined && !isJson)) throw e; // reads and file uploads can't be queued
    writeOutbox([...readOutbox(), { path, method, body: init.body as string | undefined, at: Date.now() }]);
    // Hand back what the server would have: creates echo the row (its id came from the client).
    const now = new Date().toISOString();
    return (method === 'POST' && path.startsWith('/r/') && isJson ? { ...JSON.parse(init.body as string), created_at: now, updated_at: now, [QUEUED]: true } : { ok: true, [QUEUED]: true }) as T;
  }
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
  const settle = (data?: unknown) => (wasQueued(data) ? undefined : qc.invalidateQueries({ queryKey: [resource] }));

  const create = useMutation({
    mutationFn: (data: Partial<T>) => api<T>(`/r/${resource}`, { method: 'POST', body: JSON.stringify(data) }),
    // Show the new row immediately (it already has its final id), even if the write gets queued.
    onMutate: (data) => {
      const now = new Date().toISOString();
      patchCaches((rows) => (rows.some((r) => r.id === data.id) ? rows : [{ ...data, created_at: now, updated_at: now } as unknown as T, ...rows]));
    },
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
  // The client mints the id, so offline-created rows can be referenced (sets → workout) before they sync.
  return { create: (data: Partial<T>) => create.mutateAsync({ ...data, id: (data as Partial<Row>).id ?? uuid() } as Partial<T>), update: update.mutate, remove: remove.mutate };
}

/** Take back a tick-off on the server: reopens it (back to its old date if it rolled) and drops a paid bill's expense. */
export function useUndoTask() {
  const qc = useQueryClient();
  return async (id: string) => {
    await api(`/tasks/${id}/undo`, { method: 'POST' });
    void qc.invalidateQueries({ queryKey: ['tasks'] });
    void qc.invalidateQueries({ queryKey: ['expenses'] });
  };
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
        void flushOutbox().then(() => qc.invalidateQueries());
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

/** Number of writes waiting on this phone to reach the laptop. */
export function useOutbox() {
  const [n, setN] = useState(outboxSize);
  useEffect(() => {
    const on = (e: Event) => setN((e as CustomEvent<number>).detail);
    window.addEventListener('outbox', on);
    return () => window.removeEventListener('outbox', on);
  }, []);
  return n;
}
