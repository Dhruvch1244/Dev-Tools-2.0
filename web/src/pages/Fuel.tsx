import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronLeft, ChevronRight, Copy, Minus, Plus, Search, Settings2, Trash2 } from 'lucide-react';
import { useList, useResource, useSettings } from '../lib/api';
import { addDays, parseDate, relativeDay, today } from '../lib/format';
import { listItem } from '../lib/motion';
import { FOODS, FOOD_CATS, searchFoods, type Food } from '../core/foods';
import { ACTIVITY, DEFAULT_PROFILE, MEALS, sumMacros, targets, type Profile } from '../core/fuel';
import type { CustomFood, FoodLog, Health } from '../lib/types';
import { useToast } from '../components/toast';
import { AnimatedNumber, Button, Card, Chip, IconButton, Input, Page, PageHeader, Rise, SectionTitle, Segmented, Sheet, cx } from '../components/ui';

const r1 = (n: number) => Math.round(n * 10) / 10;

/** F1 steering-wheel shift lights: green → red → purple as you approach the calorie target. */
function ShiftLights({ ratio }: { ratio: number }) {
  const n = 15;
  const lit = Math.round(Math.min(1.2, ratio) * n);
  const color = (i: number) => (ratio > 1.05 ? 'var(--purple)' : i < 5 ? 'var(--green)' : i < 10 ? 'var(--accent)' : 'var(--purple)');
  return (
    <div className="flex gap-1.5" role="meter" aria-valuenow={Math.round(ratio * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Calories eaten vs target">
      {Array.from({ length: n }, (_, i) => (
        <motion.span
          key={i}
          className="h-4 flex-1 rounded-full"
          initial={false}
          animate={{
            background: i < lit ? color(i) : 'var(--surface-2)',
            boxShadow: i < lit ? `0 0 12px 1px ${color(i)}` : '0 0 0 0 transparent',
            scale: i < lit ? 1 : 0.85,
          }}
          transition={{ duration: 0.25, delay: i * 0.025 }}
        />
      ))}
    </div>
  );
}

function MacroBar({ label, value, target, color }: { label: string; value: number; target: number; color: string }) {
  const pct = target ? Math.min(1, value / target) : 0;
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-[12px] font-bold uppercase tracking-wider">
        <span className="text-ink-2">{label}</span>
        <span className="font-mono tabular-nums">
          {Math.round(value)}
          <span className="text-ink-3"> / {target} g</span>
        </span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-sm bg-surface-2">
        <motion.div className="h-full -skew-x-12" style={{ background: color }} initial={{ width: 0 }} animate={{ width: `${pct * 100}%` }} transition={{ type: 'spring', stiffness: 70, damping: 16 }} />
      </div>
    </div>
  );
}

type AnyFood = Food | (CustomFood & { cat: 'Custom' });

function AddFoodSheet({ meal, date, onClose }: { meal: string | null; date: string; onClose: () => void }) {
  const { create } = useResource<FoodLog>('food_logs');
  const { data: custom = [] } = useList<CustomFood>('custom_foods');
  const customApi = useResource<CustomFood>('custom_foods');
  const { data: recentLogs = [] } = useList<FoodLog>('food_logs', { from: addDays(today(), -21) });
  const toast = useToast();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<string>('Recent');
  const [qty, setQty] = useState<Record<string, number>>({});
  const [making, setMaking] = useState(false);
  const [cf, setCf] = useState({ name: '', serving: '1 serving', kcal: '', protein: '', carbs: '', fat: '' });

  const all: AnyFood[] = useMemo(() => [...custom.map((c) => ({ ...c, cat: 'Custom' as const })), ...FOODS], [custom]);
  const recent = useMemo(() => {
    const ids = [...new Set(recentLogs.map((l) => l.food_id).filter(Boolean))] as string[];
    return ids.map((id) => all.find((f) => f.id === id)).filter(Boolean).slice(0, 20) as AnyFood[];
  }, [recentLogs, all]);
  const list = q ? searchFoods(all, q) : cat === 'Recent' ? (recent.length ? recent : FOODS.slice(0, 20)) : cat === 'Custom' ? all.filter((f) => f.cat === 'Custom') : all.filter((f) => f.cat === cat);

  const add = async (f: AnyFood) => {
    const n = qty[f.id] ?? 1;
    await create({ date, meal: meal!, food_id: f.id, name: f.name, qty: n, unit: f.serving, kcal: f.kcal * n, protein: f.protein * n, carbs: f.carbs * n, fat: f.fat * n });
    toast({ message: `${n} × ${f.name} → ${MEALS.find((m) => m.id === meal)?.label}` });
  };

  return (
    <Sheet open={!!meal} onClose={onClose} title={`Add to ${MEALS.find((m) => m.id === meal)?.label ?? ''}`}>
      <div className="relative mb-3">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search roti, dal, paneer…" className="field h-11 w-full !pl-9" />
      </div>
      {!q && (
        <div className="no-scrollbar -mx-1 mb-3 flex gap-1.5 overflow-x-auto px-1">
          {['Recent', 'Custom', ...FOOD_CATS].map((c) => (
            <Chip key={c} active={cat === c} onClick={() => setCat(c)}>
              {c}
            </Chip>
          ))}
        </div>
      )}
      <ul className="max-h-[46vh] space-y-1 overflow-y-auto pr-1">
        {list.map((f) => {
          const n = qty[f.id] ?? 1;
          return (
            <li key={f.id} className="flex items-center gap-2 rounded-md bg-bg px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{f.name}</p>
                <p className="truncate text-[11px] text-ink-3">
                  {f.serving} · {Math.round(f.kcal)} kcal · P{r1(f.protein)} C{r1(f.carbs)} F{r1(f.fat)}
                </p>
              </div>
              <div className="flex items-center rounded-md border border-line">
                <button aria-label="Less" className="px-1.5 py-1 text-ink-3 hover:text-ink" onClick={() => setQty({ ...qty, [f.id]: Math.max(0.5, n - 0.5) })}>
                  <Minus className="size-3.5" />
                </button>
                <span className="w-7 text-center font-mono text-xs">{n}</span>
                <button aria-label="More" className="px-1.5 py-1 text-ink-3 hover:text-ink" onClick={() => setQty({ ...qty, [f.id]: n + 0.5 })}>
                  <Plus className="size-3.5" />
                </button>
              </div>
              <Button size="sm" onClick={() => void add(f)}>
                Add
              </Button>
            </li>
          );
        })}
        {list.length === 0 && <li className="py-6 text-center text-sm text-ink-3">No match — add it as a custom food below.</li>}
      </ul>
      <div className="mt-3 border-t border-line pt-3">
        {!making ? (
          <Button variant="ghost" size="sm" onClick={() => (setMaking(true), setCf({ ...cf, name: q }))}>
            <Plus className="size-4" /> Custom food
          </Button>
        ) : (
          <form
            className="grid grid-cols-2 gap-2 sm:grid-cols-6"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!cf.name.trim() || !Number(cf.kcal)) return;
              await customApi.create({ name: cf.name.trim(), serving: cf.serving, kcal: +cf.kcal, protein: +cf.protein || 0, carbs: +cf.carbs || 0, fat: +cf.fat || 0 });
              setMaking(false);
              setCat('Custom');
              setQ('');
            }}
          >
            <Input className="col-span-2" placeholder="Name" value={cf.name} onChange={(e) => setCf({ ...cf, name: e.target.value })} />
            <Input className="col-span-2 sm:col-span-1" placeholder="Serving" value={cf.serving} onChange={(e) => setCf({ ...cf, serving: e.target.value })} />
            {(['kcal', 'protein', 'carbs', 'fat'] as const).map((k) => (
              <Input key={k} inputMode="decimal" placeholder={k} value={cf[k]} onChange={(e) => setCf({ ...cf, [k]: e.target.value.replace(/[^\d.]/g, '') })} className="sm:col-span-1" />
            ))}
            <Button type="submit" className="col-span-2 sm:col-span-6">
              Save custom food
            </Button>
          </form>
        )}
      </div>
    </Sheet>
  );
}

function ProfileSheet({ open, onClose, profile }: { open: boolean; onClose: () => void; profile: Profile }) {
  const { save } = useSettings();
  const [p, setP] = useState(profile);
  const t = targets(p);
  const num = (k: keyof Profile) => (e: React.ChangeEvent<HTMLInputElement>) => setP({ ...p, [k]: Number(e.target.value) || 0 });
  return (
    <Sheet open={open} onClose={onClose} title="Driver profile">
      <div className="space-y-4">
        <Segmented className="w-full" value={p.sex} onChange={(sex) => setP({ ...p, sex })} options={[{ value: 'male', label: 'Male' }, { value: 'female', label: 'Female' }]} />
        <div className="grid grid-cols-3 gap-2">
          <label className="text-xs font-bold uppercase tracking-wider text-ink-3">
            Age
            <Input type="number" value={p.age} onChange={num('age')} className="mt-1" />
          </label>
          <label className="text-xs font-bold uppercase tracking-wider text-ink-3">
            Height cm
            <Input type="number" value={p.height} onChange={num('height')} className="mt-1" />
          </label>
          <label className="text-xs font-bold uppercase tracking-wider text-ink-3">
            Weight kg
            <Input type="number" value={p.weight} onChange={num('weight')} className="mt-1" />
          </label>
        </div>
        <div className="space-y-1.5">
          {ACTIVITY.map((a) => (
            <button key={a.value} onClick={() => setP({ ...p, activity: a.value })} className={cx('flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm', p.activity === a.value ? 'border-accent bg-accent-soft' : 'border-line')}>
              {a.label} <span className="font-mono text-xs text-ink-3">×{a.value}</span>
            </button>
          ))}
        </div>
        <Segmented className="w-full" value={p.goal} onChange={(goal) => setP({ ...p, goal })} options={[{ value: 'cut', label: 'Cut' }, { value: 'maintain', label: 'Maintain' }, { value: 'bulk', label: 'Lean bulk' }]} />
        <table className="w-full text-sm">
          <tbody className="[&_td]:border-b [&_td]:border-line [&_td]:py-1.5">
            <tr><td className="text-ink-3">BMR (Mifflin–St Jeor)</td><td className="text-right font-mono">{t.bmr} kcal</td></tr>
            <tr><td className="text-ink-3">× activity = maintenance (TDEE)</td><td className="text-right font-mono">{t.tdee} kcal</td></tr>
            <tr><td className="text-ink-3">Goal adjustment</td><td className="text-right font-mono">{p.goal === 'cut' ? '−450' : p.goal === 'bulk' ? '+300' : '0'} kcal</td></tr>
            <tr><td className="font-bold">Daily target</td><td className="text-right font-mono font-bold text-accent">{t.kcal} kcal</td></tr>
            <tr><td className="text-ink-3">Protein / Carbs / Fat</td><td className="text-right font-mono">{t.protein} / {t.carbs} / {t.fat} g</td></tr>
          </tbody>
        </table>
        <Button className="w-full" onClick={() => (save({ fuel: p }), onClose())}>
          Save targets
        </Button>
      </div>
    </Sheet>
  );
}

function WeekChart({ logs, target }: { logs: FoodLog[]; target: number }) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(today(), i - 6));
  const totals = days.map((d) => ({ d, v: logs.filter((l) => l.date === d).reduce((a, l) => a + l.kcal, 0) }));
  const max = Math.max(target * 1.25, ...totals.map((t) => t.v));
  const [hover, setHover] = useState<number | null>(null);
  const shown = totals[hover ?? 6];
  return (
    <Card>
      <SectionTitle>Last 7 days</SectionTitle>
      <p className="text-xs text-ink-3">{relativeDay(shown.d)}</p>
      <p className="mb-3 text-2xl font-black italic tabular-nums">
        {Math.round(shown.v)} <span className="text-sm not-italic text-ink-3">/ {target} kcal</span>
      </p>
      <div className="relative flex h-32 items-end gap-2" onMouseLeave={() => setHover(null)}>
        <div className="pointer-events-none absolute inset-x-0 border-t border-dashed border-ink-3" style={{ bottom: `${(target / max) * 100}%` }}>
          <span className="absolute -top-4 right-0 text-[10px] font-bold uppercase text-ink-3">target</span>
        </div>
        {totals.map((t, i) => (
          <button key={t.d} className="flex h-full flex-1 flex-col items-center justify-end gap-1" onMouseEnter={() => setHover(i)} aria-label={`${t.d}: ${Math.round(t.v)} kcal`}>
            <motion.span
              className="w-full rounded-t-[4px]"
              style={{ background: t.v > target * 1.05 ? 'var(--purple)' : 'var(--accent)', opacity: hover === null || hover === i ? 1 : 0.45 }}
              initial={{ height: 0 }}
              animate={{ height: t.v ? `${(t.v / max) * 100}%` : '2px' }}
              transition={{ type: 'spring', stiffness: 80, damping: 16, delay: i * 0.05 }}
            />
            <span className="text-[10px] font-bold uppercase text-ink-3">{parseDate(t.d).toLocaleDateString(undefined, { weekday: 'narrow' })}</span>
          </button>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-ink-3">Purple bars: more than 5% over target.</p>
    </Card>
  );
}

export function FuelPage() {
  const { settings } = useSettings();
  const { data: health = [] } = useList<Health>('health', { from: addDays(today(), -60) });
  const latestWeight = health.find((h) => h.kind === 'weight')?.value;
  const profile: Profile = settings.fuel ?? { ...DEFAULT_PROFILE, weight: latestWeight ?? DEFAULT_PROFILE.weight };
  const t = targets(profile);
  const [date, setDate] = useState(today());
  const { data: logs = [] } = useList<FoodLog>('food_logs', { from: addDays(today(), -30) });
  const { create, remove } = useResource<FoodLog>('food_logs');
  const toast = useToast();
  const [adding, setAdding] = useState<string | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);

  const day = logs.filter((l) => l.date === date);
  const total = sumMacros(day);
  const left = t.kcal - total.kcal;

  const copyYesterday = async (meal: string) => {
    const y = logs.filter((l) => l.date === addDays(date, -1) && l.meal === meal);
    for (const l of y) await create({ date, meal, food_id: l.food_id, name: l.name, qty: l.qty, unit: l.unit, kcal: l.kcal, protein: l.protein, carbs: l.carbs, fat: l.fat });
    toast({ message: y.length ? `Copied ${y.length} items from yesterday` : 'Nothing logged there yesterday' });
  };
  const del = (l: FoodLog) => {
    remove(l.id);
    const { id: _, created_at: __, updated_at: ___, ...rest } = l;
    toast({ message: `Removed ${l.name}`, action: { label: 'Undo', onClick: () => void create(rest) } });
  };

  return (
    <Page>
      <PageHeader
        eyebrow="Pit wall · Fuel"
        title={
          <span className="flex items-center gap-1">
            <IconButton label="Previous day" onClick={() => setDate(addDays(date, -1))}>
              <ChevronLeft className="size-5" />
            </IconButton>
            {relativeDay(date)}
            <IconButton label="Next day" onClick={() => setDate(addDays(date, 1))} disabled={date >= today()}>
              <ChevronRight className="size-5" />
            </IconButton>
          </span>
        }
        action={
          <Button variant="ghost" onClick={() => setProfileOpen(true)}>
            <Settings2 className="size-4" /> {t.kcal} kcal target
          </Button>
        }
      />

      <Card className="mb-4">
        <div className="mb-4 grid gap-6 sm:grid-cols-[1fr_auto] sm:items-end">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.25em] text-ink-3">{left >= 0 ? 'Fuel remaining' : 'Over target'}</p>
            <p className={cx('text-6xl font-black italic leading-none tabular-nums', left < 0 && 'text-purple')}>
              <AnimatedNumber value={Math.abs(left)} />
              <span className="ml-2 text-lg not-italic text-ink-3">kcal</span>
            </p>
          </div>
          <div className="grid grid-cols-3 gap-4 text-right font-mono text-sm">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-ink-3">Eaten</p>
              <p className="text-xl font-bold">{Math.round(total.kcal)}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-ink-3">Target</p>
              <p className="text-xl font-bold">{t.kcal}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-ink-3">TDEE</p>
              <p className="text-xl font-bold text-ink-2">{t.tdee}</p>
            </div>
          </div>
        </div>
        <ShiftLights ratio={total.kcal / t.kcal} />
        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          <MacroBar label="Protein" value={total.protein} target={t.protein} color="var(--accent)" />
          <MacroBar label="Carbs" value={total.carbs} target={t.carbs} color="var(--yellow)" />
          <MacroBar label="Fat" value={total.fat} target={t.fat} color="var(--sky)" />
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {MEALS.map((m) => {
          const items = day.filter((l) => l.meal === m.id);
          const mt = sumMacros(items);
          return (
            <Card key={m.id}>
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-ink-3">{m.hint}</p>
                  <p className="text-xl font-black italic uppercase">{m.label}</p>
                </div>
                <div className="flex items-center gap-1">
                  <span className="mr-2 font-mono text-sm font-bold">{Math.round(mt.kcal)} kcal</span>
                  <IconButton label={`Copy yesterday's ${m.label}`} onClick={() => void copyYesterday(m.id)}>
                    <Copy className="size-4" />
                  </IconButton>
                  <Button size="sm" onClick={() => setAdding(m.id)}>
                    <Plus className="size-4" /> Add
                  </Button>
                </div>
              </div>
              <ul className="space-y-1">
                <AnimatePresence initial={false}>
                  {items.map((l) => (
                    <motion.li key={l.id} layout {...listItem} className="group flex items-center gap-3 rounded-md bg-bg px-3 py-2 text-sm">
                      <span className="h-5 w-1 -skew-x-12 bg-accent" />
                      <span className="min-w-0 flex-1 truncate">
                        <b className="font-semibold">{l.qty !== 1 ? `${l.qty} × ` : ''}</b>
                        {l.name}
                        <span className="ml-1.5 text-[11px] text-ink-3">P{r1(l.protein)}</span>
                      </span>
                      <span className="font-mono text-ink-2">{Math.round(l.kcal)}</span>
                      <button aria-label={`Remove ${l.name}`} onClick={() => del(l)} className="text-ink-3 opacity-0 transition group-hover:opacity-100 hover:text-danger max-sm:opacity-100">
                        <Trash2 className="size-3.5" />
                      </button>
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>
              {items.length === 0 && <p className="py-3 text-center text-xs text-ink-3">Nothing yet</p>}
            </Card>
          );
        })}
      </div>
      <Rise className="mt-4">
        <WeekChart logs={logs} target={t.kcal} />
      </Rise>
      <AddFoodSheet meal={adding} date={date} onClose={() => setAdding(null)} />
      <ProfileSheet key={JSON.stringify(profile)} open={profileOpen} onClose={() => setProfileOpen(false)} profile={profile} />
    </Page>
  );
}

