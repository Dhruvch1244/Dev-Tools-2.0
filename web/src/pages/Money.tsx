import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { AlertTriangle, ArrowDownLeft, ArrowUpRight, ChevronLeft, ChevronRight, Plus, ReceiptText, Repeat, Target, Trash2, Wallet } from 'lucide-react';
import { useList, useResource, useSettings } from '../lib/api';
import { EXPENSE_CATEGORIES, emojiFor } from '../lib/categories';
import { listItem, spring } from '../lib/motion';
import { addDays, addMonths, daysBetween, monthKey, monthRange, money, parseDate, relativeDay, today } from '../lib/format';
import type { Budget, Expense, Subscription } from '../lib/types';
import { ExpenseForm } from '../components/forms';
import { useToast } from '../components/toast';
import { BillSheet, OwedCard } from '../components/BillSplit';
import { Portfolio } from '../components/Portfolio';
import { MoneyAdvisor } from '../components/MoneyAdvisor';
import { useSearchParams } from 'react-router';
import { AnimatedNumber, Button, Card, Chip, Empty, IconButton, Input, Page, PageHeader, Rise, SectionTitle, Segmented, Sheet, SwipeRow, cx } from '../components/ui';

const monthlyCost = (s: Subscription) => (s.cycle === 'yearly' ? s.amount / 12 : s.cycle === 'weekly' ? (s.amount * 52) / 12 : s.amount);

/** Horizontal bars, one hue, sorted by size. Budget (if set) shows as a tick on the track. */
function CategoryBars({ rows, budgets, currency }: { rows: { category: string; total: number }[]; budgets: Record<string, number>; currency: string }) {
  const max = Math.max(1, ...rows.map((r) => Math.max(r.total, budgets[r.category] ?? 0)));
  const sum = rows.reduce((a, r) => a + r.total, 0);
  return (
    <ul className="space-y-3.5">
      {rows.map((r, i) => {
        const budget = budgets[r.category];
        const over = budget !== undefined && r.total > budget;
        return (
          <li key={r.category} className="group" title={`${r.category}: ${money(r.total, currency)} · ${Math.round((r.total / sum) * 100)}% of spending${budget ? ` · budget ${money(budget, currency)}` : ''}`}>
            <div className="mb-1.5 flex items-baseline justify-between gap-2 text-sm">
              <span className="flex items-center gap-2">
                <span>{emojiFor(r.category)}</span>
                <span className="font-medium">{r.category}</span>
                {over && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-danger/15 px-2 py-0.5 text-tiny font-semibold text-danger">
                    <AlertTriangle className="size-3" /> over by {money(r.total - budget, currency, true)}
                  </span>
                )}
              </span>
              <span className="tabular-nums text-ink-2">
                {money(r.total, currency, true)}
                {budget !== undefined && <span className="text-ink-3"> / {money(budget, currency, true)}</span>}
              </span>
            </div>
            <div className="relative h-2.5 rounded-full bg-surface-2">
              <motion.div
                className="h-full rounded-full transition-[filter] group-hover:brightness-125"
                style={{ background: over ? 'var(--danger)' : 'var(--accent)' }}
                initial={{ width: 0 }}
                animate={{ width: `${(r.total / max) * 100}%` }}
                transition={{ type: 'spring', stiffness: 70, damping: 18, delay: i * 0.05 }}
              />
              {budget !== undefined && <span className="absolute -top-1 h-[18px] w-0.5 rounded-full bg-ink" style={{ left: `calc(${(budget / max) * 100}% - 1px)` }} />}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** Daily spend columns for the month with a hover readout. */
function DailyColumns({ month, expenses, currency }: { month: string; expenses: Expense[]; currency: string }) {
  const { to } = monthRange(month);
  const days = Number(to.slice(8));
  const totals = Array.from({ length: days }, (_, i) => {
    const d = `${month}-${String(i + 1).padStart(2, '0')}`;
    return { d, v: expenses.filter((e) => e.kind === 'expense' && e.date === d).reduce((a, e) => a + e.amount, 0) };
  });
  const max = Math.max(1, ...totals.map((t) => t.v));
  const [hover, setHover] = useState<number | null>(null);
  const shown = hover ?? totals.findLastIndex((t) => t.d <= today());
  return (
    <div className="flex flex-1 flex-col">
      <div className="mb-3 flex h-10 items-end justify-between">
        <div>
          <p className="text-xs text-ink-3">{shown >= 0 ? relativeDay(totals[shown].d) : 'Daily spend'}</p>
          <p className="font-display text-2xl font-semibold tabular-nums">{money(shown >= 0 ? totals[shown].v : 0, currency)}</p>
        </div>
        <p className="text-xs text-ink-3">Peak {money(max === 1 ? 0 : max, currency, true)}</p>
      </div>
      <div className="flex min-h-28 flex-1 items-end gap-[2px]" onMouseLeave={() => setHover(null)}>
        {totals.map((t, i) => (
          <button
            key={t.d}
            aria-label={`${t.d}: ${money(t.v, currency)}`}
            onMouseEnter={() => setHover(i)}
            onClick={() => setHover(i)}
            className="flex h-full flex-1 items-end"
          >
            <motion.span
              className="w-full rounded-t-[4px]"
              style={{ background: 'var(--accent)', opacity: hover === null || hover === i ? (t.d > today() ? 0.25 : 1) : 0.35 }}
              initial={{ height: 0 }}
              animate={{ height: t.v ? `${Math.max(4, (t.v / max) * 100)}%` : '2px' }}
              transition={{ type: 'spring', stiffness: 90, damping: 16, delay: i * 0.012 }}
            />
          </button>
        ))}
      </div>
      <div className="mt-1.5 flex justify-between text-micro text-ink-3">
        <span>1</span>
        <span>{Math.ceil(days / 2)}</span>
        <span>{days}</span>
      </div>
    </div>
  );
}

function BudgetSheet({ open, onClose, budgets }: { open: boolean; onClose: () => void; budgets: Budget[] }) {
  const { create, update, remove } = useResource<Budget>('budgets');
  const [category, setCategory] = useState('Food');
  const [amount, setAmount] = useState('');
  const existing = budgets.find((b) => b.category === category);
  return (
    <Sheet open={open} onClose={onClose} title="Monthly budgets">
      <div className="mb-4 flex flex-wrap gap-2">
        {EXPENSE_CATEGORIES.map((c) => (
          <Chip key={c.name} active={category === c.name} onClick={() => (setCategory(c.name), setAmount(String(budgets.find((b) => b.category === c.name)?.amount ?? '')))}>
            {c.emoji} {c.name}
          </Chip>
        ))}
      </div>
      <form
        className="flex gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          const n = Number(amount);
          if (!n) return;
          if (existing) update({ id: existing.id, amount: n });
          else await create({ category, amount: n });
          setAmount('');
        }}
      >
        <Input inputMode="decimal" placeholder={`Limit for ${category}`} value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))} />
        <Button type="submit">{existing ? 'Update' : 'Set'}</Button>
      </form>
      <ul className="mt-5 space-y-2">
        {budgets.map((b) => (
          <li key={b.id} className="flex items-center justify-between rounded-2xl bg-surface px-4 py-2.5 text-sm">
            <span>
              {emojiFor(b.category)} {b.category}
            </span>
            <span className="flex items-center gap-2 tabular-nums">
              {b.amount}
              <IconButton label={`Remove ${b.category} budget`} onClick={() => remove(b.id)}>
                <Trash2 className="size-4" />
              </IconButton>
            </span>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}

function Subscriptions({ currency }: { currency: string }) {
  const { data: subs = [] } = useList<Subscription>('subscriptions');
  const { create, update, remove } = useResource<Subscription>('subscriptions');
  const expenses = useResource<Expense>('expenses');
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: '', amount: '', cycle: 'monthly' as Subscription['cycle'], next_date: today() });
  const total = subs.reduce((a, s) => a + monthlyCost(s), 0);

  const markPaid = (s: Subscription) => {
    const next = s.cycle === 'yearly' ? addMonths(s.next_date, 12) : s.cycle === 'weekly' ? addDays(s.next_date, 7) : addMonths(s.next_date, 1);
    update({ id: s.id, next_date: next });
    const logged = expenses.create({ amount: s.amount, kind: 'expense', category: s.category, note: s.name, date: today() });
    toast({ message: `${s.name} paid · next ${relativeDay(next)}`, action: { label: 'Undo', onClick: () => (update({ id: s.id, next_date: s.next_date }), void logged.then((e) => expenses.remove(e.id))) } });
  };

  return (
    <Card>
      <SectionTitle
        action={
          <Button size="sm" variant="soft" onClick={() => setAdding(true)}>
            <Plus className="size-4" /> Add
          </Button>
        }
      >
        <span className="flex items-center gap-2">
          <Repeat className="size-4 text-accent" /> Subscriptions
        </span>
      </SectionTitle>
      <p className="mb-4 text-sm text-ink-3">
        <span className="font-semibold text-ink">{money(total, currency)}</span> / month · {money(total * 12, currency, true)} / year
      </p>
      <ul className="space-y-2">
        <AnimatePresence initial={false}>
          {subs.map((s) => {
            const days = daysBetween(today(), s.next_date);
            return (
              <motion.li key={s.id} layout {...listItem}>
                <SwipeRow onDelete={() => remove(s.id)}>
                  <div className="flex items-center gap-3 rounded-2xl bg-surface px-4 py-3">
                    <div className="grid size-10 place-items-center rounded-xl bg-accent-soft font-display font-bold text-accent">{s.name[0]?.toUpperCase()}</div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{s.name}</p>
                      <p className={cx('text-xs', days < 0 ? 'font-medium text-danger' : days <= 3 ? 'font-medium text-warn' : 'text-ink-3')}>
                        {days < 0 ? `Overdue · ${relativeDay(s.next_date)}` : relativeDay(s.next_date)} · {s.cycle}
                      </p>
                    </div>
                    <span className="text-sm font-semibold tabular-nums">{money(s.amount, currency)}</span>
                    {days <= 3 && (
                      <Button size="sm" variant="soft" onClick={() => markPaid(s)}>
                        Paid
                      </Button>
                    )}
                  </div>
                </SwipeRow>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ul>
      {subs.length === 0 && <p className="py-4 text-center text-sm text-ink-3">Track Netflix, rent, gym… and get nudged before they renew.</p>}
      <Sheet open={adding} onClose={() => setAdding(false)} title="New subscription">
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!form.name.trim() || !Number(form.amount)) return;
            await create({ name: form.name.trim(), amount: Number(form.amount), cycle: form.cycle, next_date: form.next_date, category: 'Bills' });
            setForm({ name: '', amount: '', cycle: 'monthly', next_date: today() });
            setAdding(false);
          }}
        >
          <Input autoFocus placeholder="Name (e.g. Spotify)" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <div className="flex gap-2">
            <Input inputMode="decimal" placeholder="Amount" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value.replace(/[^\d.]/g, '') })} />
            <input type="date" aria-label="Next payment" value={form.next_date} onChange={(e) => setForm({ ...form, next_date: e.target.value })} className="field w-44 shrink-0" />
          </div>
          <Segmented
            className="w-full"
            value={form.cycle}
            onChange={(cycle) => setForm({ ...form, cycle })}
            options={[
              { value: 'weekly', label: 'Weekly' },
              { value: 'monthly', label: 'Monthly' },
              { value: 'yearly', label: 'Yearly' },
            ]}
          />
          <Button type="submit" className="w-full">
            Add subscription
          </Button>
        </form>
      </Sheet>
    </Card>
  );
}

export function MoneyPage() {
  const { settings } = useSettings();
  const currency = settings.currency ?? 'INR';
  const [month, setMonth] = useState(monthKey(today()));
  const [dir, setDir] = useState(1);
  const { data: expenses = [] } = useList<Expense>('expenses', monthRange(month));
  const { data: budgetRows = [] } = useList<Budget>('budgets');
  const { create, remove } = useResource<Expense>('expenses');
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [budgetsOpen, setBudgetsOpen] = useState(false);
  const [bill, setBill] = useState(false);
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') ?? 'spend') as 'spend' | 'invest' | 'advisor';

  const { spent, income, byCategory, byDay } = useMemo(() => {
    const spent = expenses.filter((e) => e.kind === 'expense').reduce((a, e) => a + e.amount, 0);
    const income = expenses.filter((e) => e.kind === 'income').reduce((a, e) => a + e.amount, 0);
    const cat = new Map<string, number>();
    for (const e of expenses) if (e.kind === 'expense') cat.set(e.category, (cat.get(e.category) ?? 0) + e.amount);
    const byCategory = [...cat].map(([category, total]) => ({ category, total })).sort((a, b) => b.total - a.total);
    const byDay = new Map<string, Expense[]>();
    for (const e of expenses) byDay.set(e.date, [...(byDay.get(e.date) ?? []), e]);
    return { spent, income, byCategory, byDay: [...byDay] };
  }, [expenses]);

  const budgets = Object.fromEntries(budgetRows.map((b) => [b.category, b.amount]));
  const totalBudget = budgetRows.reduce((a, b) => a + b.amount, 0);
  // Only categories that have a budget count against it — rent shouldn't blow a food budget.
  const budgeted = byCategory.filter((c) => c.category in budgets).reduce((a, c) => a + c.total, 0);
  const shift = (n: number) => (setDir(n), setMonth(monthKey(addMonths(`${month}-01`, n))));
  const fmt = (n: number) => money(Math.round(n), currency);
  const label = parseDate(`${month}-01`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  const del = (e: Expense) => {
    remove(e.id);
    const { id: _, created_at: __, updated_at: ___, ...rest } = e;
    toast({ message: 'Entry deleted', action: { label: 'Undo', onClick: () => void create(rest) } });
  };

  return (
    <Page>
      <PageHeader
        eyebrow={tab === 'spend' ? 'Money' : 'Money · live'}
        title={
          tab !== 'spend' ? (
            tab === 'invest' ? 'Portfolio' : 'Advisor'
          ) : (
            <span className="flex items-center gap-1">
              <IconButton label="Previous month" onClick={() => shift(-1)}>
                <ChevronLeft className="size-5" />
              </IconButton>
              <span className="relative inline-grid overflow-hidden">
                <AnimatePresence mode="popLayout" initial={false} custom={dir}>
                  <motion.span
                    key={month}
                    custom={dir}
                    variants={{ enter: (d: number) => ({ y: d * 40, opacity: 0 }), center: { y: 0, opacity: 1 }, exit: (d: number) => ({ y: d * -40, opacity: 0 }) }}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    transition={spring}
                    className="whitespace-nowrap"
                  >
                    {label}
                  </motion.span>
                </AnimatePresence>
              </span>
              <IconButton label="Next month" onClick={() => shift(1)}>
                <ChevronRight className="size-5" />
              </IconButton>
            </span>
          )
        }
        action={
          <div className="flex gap-2">
            <Button variant="soft" onClick={() => setBill(true)}>
              <ReceiptText className="size-4" /> Scan bill
            </Button>
            <Button onClick={() => setAdding(true)} className="max-lg:hidden">
              <Plus className="size-4" /> Add entry
            </Button>
          </div>
        }
      />

      <Segmented
        className="mb-4 w-full"
        value={tab}
        onChange={(v) => setParams(v === 'spend' ? {} : { tab: v }, { replace: true })}
        options={[
          { value: 'spend', label: 'Spending' },
          { value: 'invest', label: 'Portfolio' },
          { value: 'advisor', label: 'Advisor' },
        ]}
      />
      {tab === 'invest' && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <Portfolio />
          <MoneyAdvisor />
        </div>
      )}
      {tab === 'advisor' && <MoneyAdvisor />}
      {tab === 'spend' && (
        <>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Card className="relative overflow-hidden sm:col-span-1">
            <p className="flex items-center gap-1.5 text-sm text-ink-3">
              <ArrowUpRight className="size-4" /> Spent
            </p>
            <p className="mt-1 font-display text-4xl font-semibold tracking-tight">
              <AnimatedNumber value={spent} format={fmt} />
            </p>
            {totalBudget > 0 && (
              <>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-2">
                  <motion.div className="h-full rounded-full" style={{ background: budgeted > totalBudget ? 'var(--danger)' : 'var(--accent)' }} initial={{ width: 0 }} animate={{ width: `${Math.min(100, (budgeted / totalBudget) * 100)}%` }} transition={{ type: 'spring', stiffness: 60, damping: 16 }} />
                </div>
                <p className="mt-1.5 text-xs text-ink-3">
                  {budgeted > totalBudget ? `${money(budgeted - totalBudget, currency, true)} over` : `${money(totalBudget - budgeted, currency, true)} left`} in budgets ({money(totalBudget, currency, true)})
                </p>
              </>
            )}
          </Card>
          <Card>
            <p className="flex items-center gap-1.5 text-sm text-ink-3">
              <ArrowDownLeft className="size-4" /> Received
            </p>
            <p className="mt-1 font-display text-4xl font-semibold tracking-tight text-good">
              <AnimatedNumber value={income} format={fmt} />
            </p>
          </Card>
          <Card>
            <p className="flex items-center gap-1.5 text-sm text-ink-3">
              <Wallet className="size-4" /> Net
            </p>
            <p className={cx('mt-1 font-display text-4xl font-semibold tracking-tight', income - spent < 0 && 'text-danger')}>
              <AnimatedNumber value={income - spent} format={fmt} />
            </p>
          </Card>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-5">
          <Card className="flex flex-col lg:col-span-3">
            <DailyColumns month={month} expenses={expenses} currency={currency} />
          </Card>
          <Card className="lg:col-span-2">
            <SectionTitle
              action={
                <Button size="sm" variant="ghost" onClick={() => setBudgetsOpen(true)}>
                  <Target className="size-4" /> Budgets
                </Button>
              }
            >
              Where it went
            </SectionTitle>
            {byCategory.length ? <CategoryBars rows={byCategory} budgets={budgets} currency={currency} /> : <p className="py-6 text-center text-sm text-ink-3">No spending this month.</p>}
          </Card>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-5">
          <Card className="min-w-0 lg:col-span-3">
            <SectionTitle>Transactions</SectionTitle>
            {byDay.length === 0 && <Empty icon={<Wallet className="size-6" />} title="Nothing logged" hint="Tap + to log what you spend. It takes two seconds." />}
            <div className="space-y-5">
              {byDay.map(([date, rows]) => (
                <div key={date}>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-3">{relativeDay(date)}</p>
                  <ul className="space-y-1.5">
                    <AnimatePresence initial={false}>
                      {rows.map((e) => (
                        <motion.li key={e.id} layout {...listItem}>
                          <SwipeRow onDelete={() => del(e)}>
                            <div className="group flex items-center gap-3 rounded-2xl bg-surface px-3 py-2.5">
                              <span className="grid size-10 place-items-center rounded-xl bg-surface-2 text-lg">{emojiFor(e.category)}</span>
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-medium">{e.note || e.category}</p>
                                <p className="text-xs text-ink-3">{e.category}</p>
                              </div>
                              <span className={cx('font-semibold tabular-nums', e.kind === 'income' && 'text-good')}>
                                {e.kind === 'income' ? '+' : '−'}
                                {money(e.amount, currency)}
                              </span>
                              <IconButton label="Delete entry" onClick={() => del(e)} className="opacity-0 transition-opacity group-hover:opacity-100 max-sm:hidden">
                                <Trash2 className="size-4" />
                              </IconButton>
                            </div>
                          </SwipeRow>
                        </motion.li>
                      ))}
                    </AnimatePresence>
                  </ul>
                </div>
              ))}
            </div>
          </Card>
          <Rise className="min-w-0 space-y-4 lg:col-span-2">
            <OwedCard onScan={() => setBill(true)} />
            <Subscriptions currency={currency} />
          </Rise>
        </div>

        </>
      )}

      <Sheet open={adding} onClose={() => setAdding(false)} title="New entry">
        <ExpenseForm autoFocus onDone={() => setAdding(false)} />
      </Sheet>
      <BillSheet open={bill} onClose={() => setBill(false)} />
      <BudgetSheet open={budgetsOpen} onClose={() => setBudgetsOpen(false)} budgets={budgetRows} />
    </Page>
  );
}
