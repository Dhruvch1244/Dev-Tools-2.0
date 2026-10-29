import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useQuery } from '@tanstack/react-query';
import { ImagePlus, Loader2, Plus, RefreshCw, Search, Trash2, TrendingDown, TrendingUp, Upload } from 'lucide-react';
import { api, useList, useResource } from '../lib/api';
import { listItem } from '../lib/motion';
import { ASSETS, ASSET_ORDER, summary, type AssetKind, type Holding, type Quote } from '../core/portfolio';
import { shrink } from './AiSnap';
import { AnimatedNumber, Button, Card, Empty, Input, SectionTitle, Sheet, Textarea, cx } from './ui';
import { useToast } from './toast';

type Row = Holding & { created_at: string; updated_at: string };
const inr = (n: number, d = 0) => `₹${n.toLocaleString('en-IN', { maximumFractionDigits: d, minimumFractionDigits: d })}`;
const signed = (n: number) => `${n >= 0 ? '+' : '−'}${inr(Math.abs(n))}`;
const pct = (n: number) => `${n >= 0 ? '+' : '−'}${Math.abs(n * 100).toFixed(2)}%`;

/** Holdings valued live: total, today's move, P&L, allocation, and each position. */
export function Portfolio() {
  const { data: rows = [] } = useList<Row>('holdings');
  const { data: quotes = {}, isFetching, refetch, dataUpdatedAt } = useQuery({ queryKey: ['quotes', rows.map((r) => `${r.id}${r.symbol}`).join()], queryFn: () => api<Record<string, Quote | null>>('/money/quotes'), enabled: rows.length > 0, refetchInterval: 60_000, staleTime: 30_000 });
  const s = useMemo(() => summary(rows, quotes), [rows, quotes]);
  const [editing, setEditing] = useState<Partial<Holding> | null>(null);
  const [importing, setImporting] = useState(false);
  const up = (n: number) => (n >= 0 ? 'text-green' : 'text-danger');

  return (
    <div className="space-y-4">
      <Card className="relative overflow-hidden">
        <div className="flex items-start justify-between gap-2">
          <p className="text-micro font-black uppercase tracking-[0.2em] text-ink-3">Net worth tracked</p>
          {rows.length > 0 && (
            <button onClick={() => void refetch()} className="flex items-center gap-1 text-micro font-bold uppercase text-ink-3">
              <RefreshCw className={cx('size-3.5', isFetching && 'animate-spin')} /> {dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : 'Live'}
            </button>
          )}
        </div>
        <p className="mt-1 font-display text-4xl font-black italic tracking-tight">
          <AnimatedNumber value={s.total} format={(n) => inr(n)} />
        </p>
        {rows.length > 0 && (
          <div className="mt-2 grid grid-cols-2 gap-2">
            <div className="rounded-md bg-bg px-3 py-2">
              <p className="text-micro font-bold uppercase tracking-wider text-ink-3">Today</p>
              <p className={cx('flex items-center gap-1 font-mono text-sm font-bold', up(s.day))}>
                {s.day >= 0 ? <TrendingUp className="size-3.5" /> : <TrendingDown className="size-3.5" />} {signed(s.day)} <span className="text-tiny">{pct(s.dayPct)}</span>
              </p>
            </div>
            <div className="rounded-md bg-bg px-3 py-2">
              <p className="text-micro font-bold uppercase tracking-wider text-ink-3">Overall P&amp;L</p>
              <p className={cx('font-mono text-sm font-bold', up(s.pnl))}>
                {signed(s.pnl)} <span className="text-tiny">{pct(s.pnlPct)}</span>
              </p>
            </div>
          </div>
        )}
        {s.byKind.length > 0 && (
          <>
            <div className="mt-4 flex h-3 gap-[2px] overflow-hidden rounded-sm">
              {s.byKind.map((k) => (
                <motion.span key={k.kind} initial={{ flexGrow: 0 }} animate={{ flexGrow: k.share }} className="min-w-[3px]" style={{ background: ASSETS[k.kind].color, flexBasis: 0 }} title={`${ASSETS[k.kind].label} ${(k.share * 100).toFixed(0)}%`} />
              ))}
            </div>
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-tiny text-ink-2">
              {s.byKind.map((k) => (
                <span key={k.kind} className="flex items-center gap-1">
                  <span className="size-2 rounded-sm" style={{ background: ASSETS[k.kind].color }} /> {ASSETS[k.kind].label} <b className="font-mono">{(k.share * 100).toFixed(0)}%</b>
                </span>
              ))}
            </div>
            {s.top > 0.4 && s.rows.filter((r) => ASSETS[r.kind].live).length > 2 && <p className="mt-2 text-tiny text-amber">⚠ {s.topName} is {(s.top * 100).toFixed(0)}% of your market money — concentrated.</p>}
          </>
        )}
      </Card>

      <Card>
        <SectionTitle
          action={
            <span className="flex gap-3">
              <button onClick={() => setImporting(true)} className="flex items-center gap-1 text-mini font-bold uppercase text-accent">
                <Upload className="size-3.5" /> Import
              </button>
              <button onClick={() => setEditing({ kind: 'stock' })} className="flex items-center gap-1 text-mini font-bold uppercase text-accent">
                <Plus className="size-3.5" /> Add
              </button>
            </span>
          }
        >
          Holdings
        </SectionTitle>
        {rows.length === 0 ? (
          <Empty icon={<TrendingUp className="size-6" />} title="Track your investments" hint="Add stocks, mutual funds, crypto, FDs and cash — or import a Zerodha / Groww screenshot. Prices update live." />
        ) : (
          <ul className="space-y-1.5">
            <AnimatePresence initial={false}>
              {s.rows.map((r) => (
                <motion.li key={r.id} layout {...listItem}>
                  <button onClick={() => setEditing(r)} className="flex w-full items-center gap-3 rounded-md bg-bg px-3 py-2.5 text-left">
                    <span className="grid size-9 shrink-0 place-items-center rounded-md text-lg" style={{ background: `color-mix(in srgb, ${ASSETS[r.kind].color} 15%, transparent)` }}>
                      {ASSETS[r.kind].emoji}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold">{r.kind === 'stock' || r.kind === 'etf' || r.kind === 'crypto' ? (r.symbol ?? r.name) : r.name}</span>
                      <span className="block truncate font-mono text-tiny text-ink-3">
                        {r.price != null ? `${r.qty} × ${inr(r.price, 2)}` : ASSETS[r.kind].label}
                        {r.price != null && quotes[r.id]?.prev ? <span className={up(r.price - quotes[r.id]!.prev!)}> {pct((r.price - quotes[r.id]!.prev!) / quotes[r.id]!.prev!)}</span> : null}
                      </span>
                    </span>
                    <span className="text-right">
                      <span className="block font-mono text-sm font-bold">{inr(r.current)}</span>
                      {r.invested > 0 && r.pnl !== 0 && <span className={cx('block font-mono text-tiny', up(r.pnl))}>{pct(r.pnl / r.invested)}</span>}
                    </span>
                  </button>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        )}
        <p className="mt-3 text-micro text-ink-3">Prices: Yahoo Finance (NSE, ~delayed) and AMFI NAVs via mfapi.in. Not investment advice.</p>
      </Card>
      <HoldingSheet draft={editing} onClose={() => setEditing(null)} />
      <ImportSheet open={importing} onClose={() => setImporting(false)} />
    </div>
  );
}

function HoldingSheet({ draft, onClose }: { draft: Partial<Holding> | null; onClose: () => void }) {
  const { create, update, remove } = useResource<Row>('holdings');
  const [d, setD] = useState<Partial<Holding>>(draft ?? { kind: 'stock' });
  const [was, setWas] = useState(draft);
  const [q, setQ] = useState('');
  const [term, setTerm] = useState('');
  if (draft !== was) (setWas(draft), draft && setD(draft), setQ(''), setTerm(''));
  const kind = (d.kind ?? 'stock') as AssetKind;
  const live = ASSETS[kind].live;
  const { data: hits = [], isFetching } = useQuery({ queryKey: ['msearch', kind, term], queryFn: () => api<{ symbol: string; name: string; exchange?: string }[]>(`/money/search?kind=${kind}&q=${encodeURIComponent(term)}`), enabled: live && term.length >= 2, staleTime: Infinity });
  const num = (v: string) => (v.trim() === '' ? null : Number(v.replace(/[^\d.]/g, '')));
  const label = 'text-micro font-black uppercase tracking-[0.2em] text-ink-3';
  const ok = !!d.name?.trim() && (live ? !!d.symbol && d.qty != null : d.value != null);
  const save = () => {
    const row = { kind, symbol: d.symbol ?? null, name: d.name!.trim(), qty: live ? d.qty ?? null : null, avg_price: d.avg_price ?? null, value: live ? null : d.value ?? null };
    if (d.id) update({ id: d.id, ...row });
    else void create(row);
    onClose();
  };
  return (
    <Sheet open={!!draft} onClose={onClose} title={d.id ? d.name : 'Add a holding'}>
      <div className="space-y-4">
        {!d.id && (
          <div className="grid grid-cols-4 gap-1">
            {ASSET_ORDER.map((k) => (
              <button key={k} onClick={() => setD({ kind: k })} className={cx('flex h-14 flex-col items-center justify-center rounded-md text-micro font-bold', kind === k ? 'bg-accent text-white' : 'bg-surface-2 text-ink-2')}>
                <span className="text-lg">{ASSETS[k].emoji}</span> {ASSETS[k].label.split(' ')[0]}
              </button>
            ))}
          </div>
        )}
        {live && !d.id && (
          <div>
            <form onSubmit={(e) => (e.preventDefault(), setTerm(q.trim()))} className="flex gap-2">
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={ASSETS[kind].hint} enterKeyHint="search" />
              <Button type="submit" variant="soft" aria-label="Search">
                {isFetching ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
              </Button>
            </form>
            {hits.length > 0 && (
              <ul className="mt-2 max-h-56 space-y-1 overflow-y-auto">
                {hits.map((h) => (
                  <li key={h.symbol}>
                    <button onClick={() => (setD({ ...d, symbol: h.symbol, name: h.name }), setTerm(''), setQ(''))} className={cx('flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm', d.symbol === h.symbol ? 'bg-accent-soft' : 'bg-bg')}>
                      {kind !== 'mf' && <b className="font-mono">{h.symbol}</b>} <span className="min-w-0 truncate text-ink-2">{h.name}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        {(d.name || !live) && (
          <label className="block">
            <span className={label}>Name</span>
            <Input className="mt-1.5" value={d.name ?? ''} onChange={(e) => setD({ ...d, name: e.target.value })} placeholder={ASSETS[kind].hint} />
            {live && d.symbol && <span className="mt-1 block font-mono text-tiny text-ink-3">{kind === 'mf' ? `AMFI ${d.symbol}` : d.symbol}</span>}
          </label>
        )}
        {live ? (
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className={label}>{kind === 'mf' ? 'Units' : 'Quantity'}</span>
              <Input className="mt-1.5" inputMode="decimal" value={d.qty ?? ''} onChange={(e) => setD({ ...d, qty: num(e.target.value) })} />
            </label>
            <label className="block">
              <span className={label}>Avg buy price</span>
              <Input className="mt-1.5" inputMode="decimal" value={d.avg_price ?? ''} onChange={(e) => setD({ ...d, avg_price: num(e.target.value) })} placeholder="₹" />
            </label>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className={label}>Current value</span>
              <Input className="mt-1.5" inputMode="decimal" value={d.value ?? ''} onChange={(e) => setD({ ...d, value: num(e.target.value) })} placeholder="₹" />
            </label>
            <label className="block">
              <span className={label}>Put in (optional)</span>
              <Input className="mt-1.5" inputMode="decimal" value={d.avg_price ?? ''} onChange={(e) => setD({ ...d, avg_price: num(e.target.value), qty: e.target.value ? 1 : null })} placeholder="₹" />
            </label>
          </div>
        )}
        <div className="flex gap-2">
          {d.id && (
            <Button variant="danger" className="h-12" aria-label="Delete holding" onClick={() => (remove(d.id!), onClose())}>
              <Trash2 className="size-4" />
            </Button>
          )}
          <Button className="h-12 flex-1" disabled={!ok} onClick={save}>
            Save
          </Button>
        </div>
      </div>
    </Sheet>
  );
}

/** Screenshot or pasted text from a broker app → holdings to review, then add them all. */
function ImportSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { create } = useResource<Row>('holdings');
  const toast = useToast();
  const [text, setText] = useState('');
  const [image, setImage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [found, setFound] = useState<Omit<Holding, 'id'>[] | null>(null);
  const read = async () => {
    setBusy(true);
    try {
      const r = await api<{ holdings: Omit<Holding, 'id'>[] }>('/money/parse', { method: 'POST', body: JSON.stringify({ text, image }) });
      setFound(r.holdings);
      if (!r.holdings.length) toast({ message: 'Couldn’t find any holdings in that' });
    } catch (e) {
      toast({ message: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };
  const addAll = async () => {
    for (const h of found ?? []) await create(h);
    toast({ message: `Added ${found!.length} holdings` });
    setFound(null);
    setText('');
    setImage(null);
    onClose();
  };
  return (
    <Sheet open={open} onClose={onClose} title="Import holdings">
      <div className="space-y-3">
        <p className="text-sm text-ink-2">Screenshot your Zerodha / Groww / Kuvera holdings, or paste them as text. The AI reads it; you check before anything is saved.</p>
        <label className="flex h-24 cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-line-strong text-sm text-ink-2">
          {image ? <img src={image} alt="" className="h-full object-contain" /> : (<><ImagePlus className="size-5" /> Add a screenshot</>)}
          <input type="file" accept="image/*" className="hidden" onChange={async (e) => e.target.files?.[0] && setImage(await shrink(e.target.files[0], 1600))} />
        </label>
        <Textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder="…or paste: RELIANCE 10 @ 2450, Parag Parikh Flexi Cap 120.5 units, FD SBI 2,00,000" />
        {found ? (
          <>
            <ul className="space-y-1">
              {found.map((h, i) => (
                <li key={i} className="flex items-center gap-2 rounded-md bg-bg px-3 py-2 text-sm">
                  <span>{ASSETS[h.kind].emoji}</span>
                  <span className="min-w-0 flex-1 truncate">{h.symbol ?? h.name}</span>
                  <span className="font-mono text-tiny text-ink-2">{h.value != null ? inr(h.value) : `${h.qty}${h.avg_price ? ` @ ${inr(h.avg_price, 2)}` : ''}`}</span>
                  <button aria-label="Drop" onClick={() => setFound(found.filter((_, j) => j !== i))} className="text-ink-3">
                    <Trash2 className="size-3.5" />
                  </button>
                </li>
              ))}
            </ul>
            <Button className="h-12 w-full" disabled={!found.length} onClick={() => void addAll()}>
              Add {found.length} holdings
            </Button>
          </>
        ) : (
          <Button className="h-12 w-full" disabled={busy || (!text.trim() && !image)} onClick={() => void read()}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />} Read holdings
          </Button>
        )}
      </div>
    </Sheet>
  );
}
