import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useQuery } from '@tanstack/react-query';
import { Flame, Phone, Plus, Trash2, Trophy, Zap } from 'lucide-react';
import { api, useList, useResource } from '../lib/api';
import { addDays, haptic, parseDate, relativeDay, today } from '../lib/format';
import { bouncy } from '../lib/motion';
import { useHabits } from '../lib/habits';
import { HABIT_IDEAS, POINTS, atRisk, bestStreak, streak, dueOn, level, parseDays, perfectDay, perfectStreak, pointsOn, rate, stackLine, weeksGrid } from '../core/habits';
import { nextContact } from '../core/people';
import type { Habit, PersonRow } from '../lib/types';
import { Button, Card, Input, SectionTitle, Sheet, cx } from './ui';
import { useToast } from './toast';

const COLORS = ['#e10600', '#ffd23f', '#2bd46b', '#4fb3ff', '#ff5fa2', '#c9a2ff', '#ffb547'];
const DAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const label = 'text-micro font-black uppercase tracking-[0.2em] text-ink-3';

/** Daily-call people (Mom…) and anyone due a call today — ticked like habits, with their own streak. */
export function useCalls() {
  const t = today();
  const from = addDays(t, -60);
  const { data: people = [] } = useList<PersonRow>('people');
  const { update } = useResource<PersonRow>('people');
  const { data: calls = [] } = useQuery({ queryKey: ['checks', 'call', from], queryFn: () => api<{ ref: string; date: string }[]>(`/checks?kind=call&from=${from}`) });
  const called = (id: string, date: string) => calls.some((c) => c.ref === id && c.date === date);
  const today_ = people.filter((p) => p.every_days === 1 || nextContact(p, t) === t || called(p.id, t));
  const streak = (id: string) => {
    let d = called(id, t) ? t : addDays(t, -1);
    let n = 0;
    while (called(id, d)) (n++, (d = addDays(d, -1)));
    return n;
  };
  const toggle = (p: PersonRow) => {
    haptic(14);
    if (called(p.id, t)) {
      const prev = calls.filter((c) => c.ref === p.id && c.date < t).map((c) => c.date).sort().at(-1) ?? null;
      update({ id: p.id, last_contact: prev });
    } else update({ id: p.id, last_contact: t });
  };
  return { people: today_, called, streak, toggle };
}

/** Level, points and the perfect-day streak — the "championship" at the top of the page. */
export function HabitHero({ extraToday }: { extraToday: { done: number; due: number } }) {
  const { history } = useHabits();
  const t = today();
  const stats = useMemo(() => {
    let career = 0;
    for (let d = addDays(t, -189); d <= t; d = addDays(d, 1)) career += pointsOn(history, d);
    const monday = addDays(t, -((parseDate(t).getDay() + 6) % 7));
    let week = 0;
    for (let d = monday; d <= t; d = addDays(d, 1)) week += pointsOn(history, d);
    return { career, week, perfect: perfectStreak(history, t), todayPts: pointsOn(history, t) };
  }, [history, t]);
  const lv = level(stats.career);
  const dueHabits = history.filter((h) => dueOn(h.days, t));
  const done = dueHabits.filter((h) => h.done.has(t)).length + extraToday.done;
  const due = dueHabits.length + extraToday.due;
  const pct = due ? done / due : 0;
  const perfectToday = perfectDay(history, t) && extraToday.done === extraToday.due;
  return (
    <div className="relative overflow-hidden rounded-xl border border-line bg-surface p-4">
      <div className="pointer-events-none absolute -right-6 -top-6 size-40 rounded-full bg-accent/10 blur-2xl" />
      <div className="relative flex items-center gap-4">
        <svg viewBox="0 0 80 80" className="size-24 shrink-0 -rotate-90">
          <circle cx="40" cy="40" r="34" fill="none" stroke="var(--surface-2)" strokeWidth="8" />
          <motion.circle cx="40" cy="40" r="34" fill="none" stroke={perfectToday ? 'var(--green)' : 'var(--accent)'} strokeWidth="8" strokeLinecap="round" strokeDasharray={2 * Math.PI * 34} initial={{ strokeDashoffset: 2 * Math.PI * 34 }} animate={{ strokeDashoffset: 2 * Math.PI * 34 * (1 - pct) }} transition={{ type: 'spring', stiffness: 60, damping: 14 }} />
          <text x="40" y="40" textAnchor="middle" dominantBaseline="central" transform="rotate(90 40 40)" className="fill-ink font-display text-[18px] font-black italic">
            {done}/{due}
          </text>
        </svg>
        <div className="min-w-0 flex-1">
          <p className={label}>Driver level</p>
          <p className="font-display text-2xl font-black uppercase italic leading-tight">
            {lv.emoji} {lv.name}
          </p>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-2">
            <motion.div className="h-full bg-accent" initial={{ width: 0 }} animate={{ width: `${lv.progress * 100}%` }} transition={{ type: 'spring', stiffness: 60, damping: 16 }} />
          </div>
          <p className="mt-1 text-tiny text-ink-3">{lv.next ? `${(lv.next.at - stats.career).toLocaleString('en-IN')} pts to ${lv.next.name}` : 'Top of the sport'}</p>
        </div>
      </div>
      <div className="relative mt-4 grid grid-cols-3 gap-2 text-center">
        {[
          { k: 'This week', v: stats.week.toLocaleString('en-IN'), s: 'pts', icon: <Trophy className="size-3.5 text-yellow" /> },
          { k: 'Perfect days', v: String(stats.perfect), s: 'in a row', icon: <Zap className="size-3.5 text-green" /> },
          { k: 'Today', v: `+${stats.todayPts}`, s: 'pts', icon: <Flame className="size-3.5 text-accent" /> },
        ].map((x) => (
          <div key={x.k} className="rounded-md bg-bg px-2 py-2">
            <p className="flex items-center justify-center gap-1 text-micro font-bold uppercase tracking-wider text-ink-3">
              {x.icon} {x.k}
            </p>
            <p className="font-display text-xl font-black italic">
              {x.v} <span className="text-tiny font-normal not-italic text-ink-3">{x.s}</span>
            </p>
          </div>
        ))}
      </div>
      <AnimatePresence>
        {perfectToday && (
          <motion.p initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="relative mt-3 flex items-center justify-center gap-2 rounded-md bg-green/15 py-2 text-mini font-black uppercase tracking-widest text-green">
            🏁 Perfect day · +{POINTS.perfect} bonus
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}

/** "Never miss twice": habits you skipped last time that are due again today. */
export function NeverMissTwice() {
  const { habits, of, toggle } = useHabits();
  const t = today();
  const risky = habits.filter((h) => atRisk(of(h.id).done, of(h.id).days, t));
  if (!risky.length) return null;
  return (
    <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="rounded-xl border border-accent/50 bg-accent/10 p-3">
      <p className="text-micro font-black uppercase tracking-[0.2em] text-accent-2">⚠ Never miss twice</p>
      <p className="mt-1 text-sm text-ink-2">Missed last time — do even the tiny version today and the streak story stays alive.</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {risky.map((h) => (
          <button key={h.id} onClick={() => toggle(h.id, t)} className="rounded-md bg-bg px-2.5 py-1.5 text-left text-tiny">
            <span className="font-bold">
              {h.emoji} {h.name}
            </span>
            {h.tiny && <span className="text-ink-3"> · tiny: {h.tiny}</span>}
          </button>
        ))}
      </div>
    </motion.div>
  );
}

/** Today's tiles: due habits and today's calls. One tap = done, with a little burst. */
export function TodayBoard({ onNew }: { onNew: () => void }) {
  const t = today();
  const { habits, isDone, isDue, streak, toggle } = useHabits();
  const calls = useCalls();
  const due = habits.filter((h) => isDue(h.id, t) || isDone(h.id, t));
  const off = habits.filter((h) => !due.includes(h));
  return (
    <Card>
      <SectionTitle action={<button onClick={onNew} className="flex items-center gap-1 text-mini font-bold uppercase text-accent"><Plus className="size-3.5" /> Habit</button>}>Today’s grid</SectionTitle>
      {due.length === 0 && calls.people.length === 0 ? (
        <p className="text-sm text-ink-3">Nothing due today. Add a habit — start tiny.</p>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {due.map((h, i) => {
            const on = isDone(h.id, t);
            const s = streak(h.id);
            const color = h.color ?? COLORS[i % COLORS.length];
            return (
              <motion.button key={h.id} whileTap={{ scale: 0.94 }} transition={bouncy} onClick={() => toggle(h.id, t)} aria-pressed={on} className={cx('relative overflow-hidden rounded-xl border p-3 text-left', on ? 'border-transparent' : 'border-line bg-bg')}>
                <motion.span initial={false} animate={{ scale: on ? 1 : 0, opacity: on ? 1 : 0 }} transition={{ type: 'spring', stiffness: 260, damping: 22 }} className="absolute inset-0 origin-bottom-left" style={{ background: `color-mix(in srgb, ${color} 22%, transparent)` }} />
                <AnimatePresence>
                  {on && (
                    <motion.span key="burst" initial={{ scale: 0.4, opacity: 0.9 }} animate={{ scale: 2.6, opacity: 0 }} transition={{ duration: 0.6 }} className="absolute right-3 top-3 size-6 rounded-full" style={{ background: color }} />
                  )}
                </AnimatePresence>
                <span className="relative flex items-start justify-between">
                  <span className="text-2xl">{h.emoji}</span>
                  <span className={cx('flex items-center gap-0.5 font-mono text-tiny font-bold', s ? 'text-amber' : 'text-ink-3')}>
                    <Flame className={cx('size-3.5', s && 'fill-current')} />
                    {s}
                  </span>
                </span>
                <span className={cx('relative mt-1 block truncate text-sm font-bold', on && 'line-through decoration-2')}>{h.name}</span>
                <span className="relative block truncate text-tiny text-ink-3">{on ? `+${POINTS.tick} pts` : h.tiny ? `tiny: ${h.tiny}` : 'tap when done'}</span>
              </motion.button>
            );
          })}
          {calls.people.map((p) => {
            const on = calls.called(p.id, t);
            const s = calls.streak(p.id);
            return (
              <motion.div key={p.id} whileTap={{ scale: 0.94 }} className={cx('relative overflow-hidden rounded-xl border p-3', on ? 'border-transparent bg-pink/15' : 'border-line bg-bg')}>
                <button onClick={() => calls.toggle(p)} aria-pressed={on} className="block w-full text-left">
                  <span className="flex items-start justify-between">
                    <span className="text-2xl">{p.emoji ?? '📞'}</span>
                    <span className={cx('flex items-center gap-0.5 font-mono text-tiny font-bold', s ? 'text-pink' : 'text-ink-3')}>
                      <Flame className={cx('size-3.5', s && 'fill-current')} />
                      {s}
                    </span>
                  </span>
                  <span className={cx('mt-1 block truncate text-sm font-bold', on && 'line-through decoration-2')}>Call {p.name}</span>
                  <span className="block truncate text-tiny text-ink-3">{on ? 'talked today ✓' : p.every_days === 1 ? 'daily call' : 'due today'}</span>
                </button>
                {p.phone && !on && (
                  <a href={`tel:${p.phone}`} aria-label={`Call ${p.name}`} className="absolute bottom-2 right-2 grid size-8 place-items-center rounded-md bg-green/15 text-green">
                    <Phone className="size-3.5" />
                  </a>
                )}
              </motion.div>
            );
          })}
        </div>
      )}
      {off.length > 0 && <p className="mt-2 text-tiny text-ink-3">Off today: {off.map((h) => `${h.emoji ?? ''} ${h.name}`).join(' · ')}</p>}
    </Card>
  );
}

/** One habit: its stack line, streaks, 30-day rate and a 12-week grid. Tap to edit. */
export function HabitCard({ habit, index, onEdit }: { habit: Habit; index: number; onEdit: () => void }) {
  const t = today();
  const { of, toggle } = useHabits();
  const h = of(habit.id);
  const color = habit.color ?? COLORS[index % COLORS.length];
  const grid = useMemo(() => weeksGrid(t), [t]);
  const cur = streak(h.done, h.days, t);
  const best = bestStreak(h.done, h.days, addDays(t, -189), t);
  const pct = Math.round(rate(h.done, h.days, t) * 100);
  const line = stackLine(habit);
  const days = parseDays(habit.days);
  return (
    <motion.div layout className="rounded-xl border border-line bg-surface p-3">
      <button onClick={onEdit} className="flex w-full items-start gap-3 text-left">
        <span className="grid size-11 shrink-0 place-items-center rounded-lg text-2xl" style={{ background: `color-mix(in srgb, ${color} 18%, transparent)` }}>
          {habit.emoji}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-bold">{habit.name}</span>
          <span className="block truncate text-tiny text-ink-3">{line ?? (days.length === 7 ? 'Every day' : days.map((d) => DAY_LETTERS[d]).join(' '))}</span>
        </span>
        <span className="text-right">
          <span className={cx('flex items-center justify-end gap-0.5 font-display text-xl font-black italic', cur ? 'text-amber' : 'text-ink-3')}>
            <Flame className={cx('size-4', cur && 'fill-current')} />
            {cur}
          </span>
          <span className="block text-micro text-ink-3">best {best}</span>
        </span>
      </button>
      <div className="mt-3 flex gap-[3px]" aria-label="Last 12 weeks">
        {grid.map((week, w) => (
          <div key={w} className="flex flex-1 flex-col gap-[3px]">
            {week.map((d) => {
              const on = h.done.has(d);
              const future = d > t;
              const due = dueOn(h.days, d);
              return (
                <button
                  key={d}
                  disabled={future}
                  onClick={() => toggle(habit.id, d)}
                  title={`${relativeDay(d)}${on ? ' · done' : due ? '' : ' · off day'}`}
                  className={cx('aspect-square w-full rounded-[3px]', d === t && 'ring-1 ring-ink')}
                  style={{ background: future ? 'transparent' : on ? color : due ? 'var(--surface-2)' : 'color-mix(in srgb, var(--surface-2) 40%, transparent)' }}
                />
              );
            })}
          </div>
        ))}
      </div>
      <div className="mt-2 flex items-center justify-between text-micro text-ink-3">
        <span>12 weeks · tap a square to fix a day</span>
        <span className={cx('font-bold', pct >= 80 ? 'text-green' : pct >= 50 ? 'text-amber' : 'text-ink-3')}>{pct}% last 30 days</span>
      </div>
    </motion.div>
  );
}

type Draft = { id?: string; name: string; emoji: string; cue: string; tiny: string; days: number[]; color: string };
export const blankHabit: Draft = { name: '', emoji: '✨', cue: '', tiny: '', days: [0, 1, 2, 3, 4, 5, 6], color: COLORS[0] };
export const habitDraft = (h: Habit): Draft => ({ id: h.id, name: h.name, emoji: h.emoji ?? '✨', cue: h.cue ?? '', tiny: h.tiny ?? '', days: parseDays(h.days), color: h.color ?? COLORS[0] });

/** Make a habit stick: name it, stack it on a cue, give it a 2-minute version, pick its days. */
export function HabitSheet({ draft, onClose }: { draft: Draft | null; onClose: () => void }) {
  const { create, update, remove } = useResource<Habit>('habits');
  const { data: all = [] } = useList<Habit>('habits');
  const toast = useToast();
  const [d, setD] = useState<Draft>(draft ?? blankHabit);
  const [was, setWas] = useState(draft);
  if (draft !== was) (setWas(draft), draft && setD(draft));
  const save = async () => {
    const row = { name: d.name.trim(), emoji: d.emoji || '✨', cue: d.cue.trim() || null, tiny: d.tiny.trim() || null, days: d.days.length === 7 ? null : JSON.stringify([...d.days].sort()), color: d.color, archived: 0 };
    if (d.id) update({ id: d.id, ...row });
    else await create(row);
    toast({ message: d.id ? 'Habit updated' : `${row.emoji} ${row.name} — lights out and away we go` });
    onClose();
  };
  const ideas = HABIT_IDEAS.filter((i) => !all.some((h) => h.name.toLowerCase() === i.name.toLowerCase()));
  return (
    <Sheet open={!!draft} onClose={onClose} title={d.id ? 'Edit habit' : 'New habit'}>
      <div className="space-y-4">
        {!d.id && ideas.length > 0 && (
          <div>
            <p className={label}>Ideas</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {ideas.map((i) => (
                <button key={i.name} onClick={() => setD({ ...d, name: i.name, emoji: i.emoji, cue: i.cue, tiny: i.tiny, days: i.days ?? [0, 1, 2, 3, 4, 5, 6] })} className="rounded-md bg-surface-2 px-2.5 py-1.5 text-tiny font-bold text-ink-2">
                  {i.emoji} {i.name}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="flex gap-2">
          <input aria-label="Emoji" value={d.emoji} onChange={(e) => setD({ ...d, emoji: [...e.target.value].slice(-1).join('') })} className="field w-14 text-center text-lg" />
          <Input placeholder="Read 10 pages, stretch, no sugar…" value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} />
        </div>
        <label className="block">
          <span className={label}>After I… (the cue it stacks on)</span>
          <Input className="mt-1.5" placeholder="get into bed · finish the gym · log out of work" value={d.cue} onChange={(e) => setD({ ...d, cue: e.target.value })} />
        </label>
        <label className="block">
          <span className={label}>2-minute version (for bad days)</span>
          <Input className="mt-1.5" placeholder="read one page" value={d.tiny} onChange={(e) => setD({ ...d, tiny: e.target.value })} />
        </label>
        {d.name.trim() && d.cue.trim() && <p className="rounded-md bg-bg px-3 py-2 text-sm italic text-ink-2">“{stackLine({ name: d.name, cue: d.cue, tiny: d.tiny })}.”</p>}
        <div>
          <p className={label}>Days</p>
          <div className="mt-1.5 grid grid-cols-7 gap-1">
            {DAY_LETTERS.map((l, i) => (
              <button key={i} onClick={() => setD({ ...d, days: d.days.includes(i) ? d.days.filter((x) => x !== i) : [...d.days, i] })} aria-pressed={d.days.includes(i)} className={cx('h-10 rounded-md text-sm font-black', d.days.includes(i) ? 'bg-accent text-white' : 'bg-surface-2 text-ink-3')}>
                {l}
              </button>
            ))}
          </div>
        </div>
        <div className="flex gap-2">
          {COLORS.map((c) => (
            <button key={c} aria-label={`Colour ${c}`} onClick={() => setD({ ...d, color: c })} className={cx('size-8 rounded-full', d.color === c && 'ring-2 ring-ink ring-offset-2 ring-offset-bg')} style={{ background: c }} />
          ))}
        </div>
        <div className="flex gap-2">
          <Button className="h-12 flex-1" disabled={!d.name.trim() || !d.days.length} onClick={() => void save()}>
            Save habit
          </Button>
          {d.id && (
            <Button className="h-12" variant="danger" onClick={() => (remove(d.id!), onClose())} aria-label="Delete habit">
              <Trash2 className="size-4" />
            </Button>
          )}
        </div>
      </div>
    </Sheet>
  );
}

/** This week as a strip of days (each with a completion ring); tap one to see its schedule. */
export function WeekStrip({ selected, onSelect, offset, setOffset }: { selected: string; onSelect: (d: string) => void; offset: number; setOffset: (n: number) => void }) {
  const t = today();
  const { history } = useHabits();
  const monday = addDays(t, -((parseDate(t).getDay() + 6) % 7) + offset * 7);
  const week = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  return (
    <div className="flex items-center gap-1">
      <button onClick={() => setOffset(offset - 1)} aria-label="Previous week" className="grid h-14 w-7 shrink-0 place-items-center text-ink-3">
        ‹
      </button>
      <div className="grid flex-1 grid-cols-7 gap-1">
        {week.map((d) => {
          const due = history.filter((h) => dueOn(h.days, d));
          const pct = due.length ? due.filter((h) => h.done.has(d)).length / due.length : 0;
          const sel = d === selected;
          return (
            <button key={d} onClick={() => onSelect(d)} className={cx('flex flex-col items-center gap-0.5 rounded-md py-1.5', sel ? 'bg-accent text-white' : d === t ? 'bg-surface-2' : '')}>
              <span className="text-micro font-bold uppercase opacity-70">{parseDate(d).toLocaleDateString(undefined, { weekday: 'narrow' })}</span>
              <span className="font-display text-base font-black italic leading-none">{parseDate(d).getDate()}</span>
              <span className="h-1 w-6 overflow-hidden rounded-full bg-black/20">
                <span className="block h-full" style={{ width: `${d > t ? 0 : pct * 100}%`, background: sel ? 'white' : pct === 1 ? 'var(--green)' : 'var(--accent)' }} />
              </span>
            </button>
          );
        })}
      </div>
      <button onClick={() => setOffset(offset + 1)} aria-label="Next week" className="grid h-14 w-7 shrink-0 place-items-center text-ink-3">
        ›
      </button>
    </div>
  );
}
