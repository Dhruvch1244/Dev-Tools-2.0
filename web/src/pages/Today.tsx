import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowRight, CheckCircle2, Droplets, Flame, ListTodo, Repeat, Send, Wallet } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { api, useList, useResource, useSettings } from '../lib/api';
import { bouncy, easeOut } from '../lib/motion';
import { daysBetween, greeting, monthKey, monthRange, money, relativeDay, timeAgo, today } from '../lib/format';
import type { Budget, Drop, Expense, Subscription, Task } from '../lib/types';
import { AnimatedNumber, Card, Page, ProgressRing, Rise, SectionTitle, cx } from '../components/ui';
import { TaskRow, useTaskToggle } from './Tasks';
import { DAY_META, dayTypeOn } from '../core/gym';
import { targets, DEFAULT_PROFILE, sumMacros } from '../core/fuel';
import { planDay, type MealId } from '../core/mealPlan';
import { problemsForDay, currentWeek, WEEKS } from '../core/dsa/plan';
import { useDsa, useSeason } from '../lib/dsa';
import type { Activity, FoodLog } from '../lib/types';
import { useHabits, useHealthToday } from './Life';
import { TodaySchedule } from './Routines';

function Headline({ name }: { name?: string }) {
  const text = `${greeting()}${name ? `, ${name}` : ''}.`;
  return (
    <h1 className="font-display text-[clamp(2.4rem,7vw,4.5rem)] font-semibold leading-[0.95] tracking-tight" aria-label={text}>
      {text.split(' ').map((word, wi, words) => (
        <span key={wi} className="inline-block whitespace-nowrap" aria-hidden>
          {[...word].map((ch, ci) => (
            <motion.span
              key={ci}
              className={cx('inline-block', wi === words.length - 1 && name && 'text-gradient')}
              initial={{ opacity: 0, y: '0.5em', rotateX: -70, filter: 'blur(8px)' }}
              animate={{ opacity: 1, y: 0, rotateX: 0, filter: 'blur(0px)' }}
              transition={{ duration: 0.7, ease: easeOut, delay: 0.15 + (words.slice(0, wi).join(' ').length + ci) * 0.025 }}
            >
              {ch}
            </motion.span>
          ))}
          {wi < words.length - 1 && ' '}
        </span>
      ))}
    </h1>
  );
}

function Clock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const hm = now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  return (
    <p className="mt-3 flex flex-wrap items-center gap-x-3 text-ink-2">
      <span>{now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</span>
      <span className="size-1 rounded-full bg-ink-3" />
      <span className="font-mono tabular-nums">
        {hm.split('').map((c, i) => (
          <AnimatePresence key={i} mode="popLayout" initial={false}>
            <motion.span key={c} className="inline-block" initial={{ y: -10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 10, opacity: 0 }} transition={bouncy}>
              {c}
            </motion.span>
          </AnimatePresence>
        ))}
      </span>
    </p>
  );
}

function Stat({ to, icon, label, children, sub, ring, color }: { to: string; icon: React.ReactNode; label: string; children: React.ReactNode; sub?: string; ring?: number; color?: string }) {
  return (
    <Card className="!p-0">
      <Link to={to} className="group flex h-full items-center gap-4 p-5">
        {ring !== undefined ? (
          <ProgressRing value={ring} color={color}>
            <span style={{ color }}>{icon}</span>
          </ProgressRing>
        ) : (
          <div className="grid size-11 place-items-center rounded-2xl bg-accent-soft" style={{ color }}>
            {icon}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-ink-3">{label}</p>
          <p className="truncate font-display text-2xl font-semibold tracking-tight">{children}</p>
          {sub && <p className="truncate text-xs text-ink-3">{sub}</p>}
        </div>
        <ArrowRight className="size-4 -translate-x-1 text-ink-3 opacity-0 transition group-hover:translate-x-0 group-hover:opacity-100" />
      </Link>
    </Card>
  );
}

/** Gym · Fuel · DSA at a glance — the three personal programmes. */
function RaceWeekend() {
  const { settings } = useSettings();
  const t = today();
  const day = dayTypeOn(t, settings.gymShift ?? 0);
  const meta = DAY_META[day];
  const { data: food = [] } = useList<FoodLog>('food_logs', { from: t, to: t });
  const kcal = sumMacros(food).kcal;
  const tg = targets(settings.fuel ?? DEFAULT_PROFILE);
  const target = tg.kcal;
  // Next meal from the time-aware plan, e.g. "Lunch 1:30 pm · Roti, dal, sabzi, curd".
  const nextMeal = (() => {
    const per = (m: MealId) => sumMacros(food.filter((l) => l.meal === m));
    const now = new Date();
    const plan = planDay({
      nowHM: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
      logged: { breakfast: per('breakfast'), lunch: per('lunch'), snacks: per('snacks'), dinner: per('dinner') },
      remaining: { kcal: target - kcal, protein: tg.protein - sumMacros(food).protein },
      usualIds: food.map((f) => f.food_id ?? '').filter(Boolean),
      diet: settings.diet ?? 'veg',
    });
    const n = plan.find((p) => ['now', 'late', 'next'].includes(p.status) && p.options[0]);
    return n ? `${n.meal[0].toUpperCase() + n.meal.slice(1)} ${n.status === 'next' ? n.at : 'now'} · ${n.options[0].name}` : null;
  })();
  const { start } = useSeason();
  const { get } = useDsa();
  const laps = problemsForDay(start, t);
  const wk = currentWeek(start, t);
  const lapsDone = laps.filter((p) => ['solved', 'revisit'].includes(get(p.id)?.status ?? '')).length;
  const { data: acts = [] } = useList<Activity>('activities', { from: t, to: t });
  const actMin = acts.reduce((a, x) => a + x.duration_min, 0);
  const actKcal = acts.reduce((a, x) => a + (x.kcal ?? 0), 0);
  const tiles = [
    { to: '/gym', k: 'Gym', v: day === 'rest' ? 'Rest day' : `${meta.label} day`, s: meta.focus, c: meta.color },
    { to: '/fuel', k: 'Fuel', v: `${Math.max(0, Math.round(target - kcal))} kcal left`, s: nextMeal ?? `${Math.round(kcal)} / ${target} eaten`, c: 'var(--green)' },
    { to: '/sport', k: 'Sport', v: actMin ? `${Math.round(actMin)} min today` : 'Not yet today', s: actMin ? `${Math.round(actKcal)} kcal burned` : 'Run, walk or badminton', c: 'var(--sky)' },
    { to: '/dsa', k: 'DSA', v: wk === 0 ? 'Pre-season' : laps.length ? `${lapsDone}/${laps.length} laps` : 'Qualifying day', s: wk === 0 ? `Round 1 starts ${start}` : `R${Math.min(wk, 13)} · ${WEEKS[Math.min(wk, 13) - 1]?.gp} GP`, c: 'var(--purple)' },
  ];
  return (
    <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {tiles.map((x, i) => (
        <motion.div key={x.k} initial={{ opacity: 0, x: -30, skewX: -10 }} animate={{ opacity: 1, x: 0, skewX: 0 }} transition={{ delay: 0.35 + i * 0.08, type: 'spring', stiffness: 260, damping: 24 }}>
          <Link to={x.to} className="group relative block overflow-hidden rounded-xl border border-line bg-surface p-4 transition hover:border-accent">
            <span className="absolute inset-y-0 left-0 w-[3px]" style={{ background: x.c }} />
            <p className="text-[10px] font-black uppercase tracking-[0.25em] text-ink-3">{x.k}</p>
            <p className="text-2xl font-black italic uppercase leading-tight">{x.v}</p>
            <p className="truncate text-xs text-ink-3">{x.s}</p>
            <ArrowRight className="absolute right-4 top-1/2 size-5 -translate-y-1/2 text-ink-3 opacity-0 transition group-hover:translate-x-1 group-hover:opacity-100" />
          </Link>
        </motion.div>
      ))}
    </div>
  );
}

export function TodayPage() {
  const { settings } = useSettings();
  const currency = settings.currency ?? 'INR';
  const t = today();
  const { data: tasks = [] } = useList<Task>('tasks');
  const { remove } = useResource<Task>('tasks');
  const { isDone, toggle } = useTaskToggle();
  const { data: expenses = [] } = useList<Expense>('expenses', monthRange(monthKey(t)));
  const { data: budgets = [] } = useList<Budget>('budgets');
  const { data: subs = [] } = useList<Subscription>('subscriptions');
  const { data: drops = [] } = useQuery({ queryKey: ['drops'], queryFn: () => api<Drop[]>('/drops') });
  const { habits, isDone: habitDone, toggle: toggleHabit, streak } = useHabits();
  const health = useHealthToday();

  const dueToday = tasks.filter((x) => !x.done && x.due && x.due.slice(0, 10) <= t);
  const doneToday = tasks.filter((x) => x.done && x.done_at && x.done_at.slice(0, 10) === t).length;
  const spent = expenses.filter((e) => e.kind === 'expense').reduce((a, e) => a + e.amount, 0);
  const spentToday = expenses.filter((e) => e.kind === 'expense' && e.date === t).reduce((a, e) => a + e.amount, 0);
  const budgetTotal = budgets.reduce((a, b) => a + b.amount, 0);
  const budgeted = expenses.filter((e) => e.kind === 'expense' && budgets.some((b) => b.category === e.category)).reduce((a, e) => a + e.amount, 0);
  const habitsDone = habits.filter((h) => habitDone(h.id, t)).length;
  const water = health.get('water') ?? 0;
  const waterGoal = settings.waterGoal ?? 8;
  const upcoming = subs.filter((s) => daysBetween(t, s.next_date) <= 7);
  const best = habits.reduce((m, h) => Math.max(m, streak(h.id)), 0);

  return (
    <Page>
      <Rise className="mb-8 sm:mb-10">
        <Headline name={settings.name} />
        <Clock />
      </Rise>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat to="/tasks" icon={<ListTodo className="size-5" />} label="Due today" ring={dueToday.length + doneToday ? doneToday / (dueToday.length + doneToday) : 0} color="var(--accent)" sub={`${doneToday} done today`}>
          <AnimatedNumber value={dueToday.length} /> left
        </Stat>
        <Stat
          to="/money"
          icon={<Wallet className="size-5" />}
          label="Spent this month"
          ring={budgetTotal ? budgeted / budgetTotal : undefined}
          color={budgetTotal && budgeted > budgetTotal ? 'var(--danger)' : 'var(--pink)'}
          sub={`${money(spentToday, currency)} today${budgetTotal ? ` · ${Math.round((budgeted / budgetTotal) * 100)}% of budgets` : ''}`}
        >
          <AnimatedNumber value={spent} format={(n) => money(n, currency, true)} />
        </Stat>
        <Stat to="/life" icon={<Flame className="size-5" />} label="Habits" ring={habits.length ? habitsDone / habits.length : 0} color="var(--amber)" sub={best ? `Best streak ${best} days` : 'Build a streak'}>
          <AnimatedNumber value={habitsDone} />/{habits.length}
        </Stat>
        <Stat to="/life" icon={<Droplets className="size-5" />} label="Water" ring={water / waterGoal} color="#5cb8ff" sub={water >= waterGoal ? 'Goal reached 🎉' : `${waterGoal - water} more to go`}>
          <AnimatedNumber value={water} /> glasses
        </Stat>
      </div>

      <RaceWeekend />

      <div className="mt-4 grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <SectionTitle action={<Link to="/tasks" className="text-xs font-medium text-accent hover:underline">All tasks</Link>}>On your plate</SectionTitle>
          <ul className="space-y-2">
            <AnimatePresence initial={false}>
              {dueToday.map((task) => (
                <TaskRow key={task.id} task={task} done={isDone(task)} onToggle={() => toggle(task)} onDelete={() => remove(task.id)} />
              ))}
            </AnimatePresence>
          </ul>
          {dueToday.length === 0 && (
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="flex items-center gap-3 rounded-2xl bg-good/10 px-4 py-4 text-sm text-good">
              <CheckCircle2 className="size-5" /> Nothing due. You're all caught up.
            </motion.div>
          )}
        </Card>

        <div className="space-y-4 lg:col-span-2">
          <Card>
            <SectionTitle action={<Link to="/routines" className="text-xs font-medium text-accent hover:underline">Routines</Link>}>Schedule</SectionTitle>
            <TodaySchedule compact />
          </Card>
          <Card>
            <SectionTitle>Today's habits</SectionTitle>
            {habits.length === 0 ? (
              <Link to="/life" className="text-sm text-accent hover:underline">
                Add your first habit →
              </Link>
            ) : (
              <div className="flex flex-wrap gap-2">
                {habits.map((h) => {
                  const on = habitDone(h.id, t);
                  return (
                    <motion.button
                      key={h.id}
                      onClick={() => toggleHabit(h.id, t)}
                      whileTap={{ scale: 0.9 }}
                      transition={bouncy}
                      aria-pressed={on}
                      className={cx('relative inline-flex h-10 items-center gap-2 overflow-hidden rounded-full border px-4 text-sm font-medium transition-colors', on ? 'border-transparent text-white' : 'border-line bg-surface text-ink-2')}
                    >
                      <motion.span initial={false} animate={{ scale: on ? 1 : 0 }} transition={{ type: 'spring', stiffness: 300, damping: 24 }} className="absolute inset-0 origin-left rounded-full" style={{ background: h.color ?? 'var(--accent)' }} />
                      <span className="relative">{h.emoji}</span>
                      <span className="relative">{h.name}</span>
                    </motion.button>
                  );
                })}
              </div>
            )}
          </Card>

          {upcoming.length > 0 && (
            <Card>
              <SectionTitle>
                <span className="flex items-center gap-2">
                  <Repeat className="size-4 text-accent" /> Renewing soon
                </span>
              </SectionTitle>
              <ul className="space-y-2 text-sm">
                {upcoming.map((s) => (
                  <li key={s.id} className="flex justify-between">
                    <span>{s.name}</span>
                    <span className={cx('tabular-nums', s.next_date < t ? 'text-danger' : 'text-ink-2')}>
                      {money(s.amount, currency)} · {relativeDay(s.next_date)}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card>
            <SectionTitle action={<Link to="/drop" className="text-xs font-medium text-accent hover:underline">Open Drop</Link>}>
              <span className="flex items-center gap-2">
                <Send className="size-4 text-accent" /> Latest drops
              </span>
            </SectionTitle>
            {drops.length === 0 ? (
              <p className="text-sm text-ink-3">Send text or files between phone and laptop.</p>
            ) : (
              <ul className="space-y-2">
                {drops.slice(0, 3).map((d) => (
                  <li key={d.id} className="flex items-center justify-between gap-3 rounded-xl bg-surface px-3 py-2 text-sm">
                    <span className="truncate">{d.kind === 'text' ? d.text : `📎 ${d.filename}`}</span>
                    <span className="shrink-0 text-xs text-ink-3">{timeAgo(d.created_at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
      <p className="mt-10 text-center text-xs text-ink-3 max-lg:hidden">Tip: press ⌘K / Ctrl+K anywhere to add something.</p>
    </Page>
  );
}
