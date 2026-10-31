import { useQuery, useQueryClient } from '@tanstack/react-query';
import { History, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import { timeAgo } from '../lib/format';

export type Scan<T> = { id: string; kind: 'machine' | 'food' | 'receipt'; title: string; input: string | null; result: T; thumb: string | null; created_at: string };

/** Past AI scans of one kind, newest first (the server keeps them; see server/scans.ts). */
export function useScans<T>(kind: Scan<T>['kind']) {
  const qc = useQueryClient();
  const { data = [] } = useQuery({ queryKey: ['scans', kind], queryFn: () => api<Scan<T>[]>(`/scans?kind=${kind}`) });
  return {
    scans: data,
    refresh: () => void qc.invalidateQueries({ queryKey: ['scans', kind] }),
    remove: async (id: string) => {
      qc.setQueryData<Scan<T>[]>(['scans', kind], (old) => old?.filter((s) => s.id !== id));
      await api(`/scans/${id}`, { method: 'DELETE' });
    },
  };
}

/** A tiny copy of the photo kept with the scan for the history list. */
export async function thumbOf(dataUrl: string, max = 200): Promise<string> {
  const img = await new Promise<HTMLImageElement>((ok, fail) => {
    const i = new Image();
    i.onload = () => ok(i);
    i.onerror = () => fail(new Error('bad image'));
    i.src = dataUrl;
  });
  const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement('canvas');
  c.width = Math.round(img.naturalWidth * k);
  c.height = Math.round(img.naturalHeight * k);
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.7);
}

/** Photo → thumbnail, or nothing (no photo, or the browser couldn't read it). */
export const maybeThumb = (photo: string | null) => (photo ? thumbOf(photo).catch(() => undefined) : Promise.resolve(undefined));

/** "Recent scans": tap one to open its saved answer again — no second AI call. */
export function ScanHistory<T>({ kind, onOpen, sub, limit = 8 }: { kind: Scan<T>['kind']; onOpen: (s: Scan<T>) => void; sub?: (s: Scan<T>) => string; limit?: number }) {
  const { scans, remove } = useScans<T>(kind);
  if (!scans.length) return null;
  return (
    <section className="space-y-1.5 pt-1">
      <p className="flex items-center gap-1.5 text-micro font-black uppercase tracking-[0.2em] text-ink-3">
        <History className="size-3.5" /> Recent scans
      </p>
      <ul className="space-y-1.5">
        {scans.slice(0, limit).map((s) => (
          <li key={s.id} className="flex items-center gap-3 rounded-lg bg-bg p-2">
            <button onClick={() => onOpen(s)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
              {s.thumb ? <img src={s.thumb} alt="" className="size-11 shrink-0 rounded-md object-cover" /> : <span className="grid size-11 shrink-0 place-items-center rounded-md bg-surface-2 text-lg">{kind === 'machine' ? '🏋️' : kind === 'food' ? '🍽️' : '🧾'}</span>}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold">{s.title}</span>
                <span className="block truncate text-tiny text-ink-3">
                  {timeAgo(s.created_at)}
                  {sub ? ` · ${sub(s)}` : s.input ? ` · “${s.input}”` : ''}
                </span>
              </span>
            </button>
            <button onClick={() => void remove(s.id)} aria-label={`Delete ${s.title}`} className="p-1.5 text-ink-3">
              <Trash2 className="size-4" />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
