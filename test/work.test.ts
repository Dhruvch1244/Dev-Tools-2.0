// Office schedule (connect/home weeks), repeating tasks and AI action parsing — pure core modules.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_WORK, isConnectWeek, nextSwitch, weekLabel, workConfig, workDay, workPings } from '../web/src/core/work.ts';
import { nextDue, remindAt } from '../web/src/core/tasks.ts';
import { normaliseActions, splitActions } from '../web/src/core/aiActions.ts';

const cfg = workConfig({});

// The default matches the user's real rota: home until Fri 6 Nov 2026, then two connect weeks.
const officeCfg = workConfig({ anchor: '2026-10-26' });

test('connect weeks: home this week and next, then two in the office, repeating', () => {
  assert.equal(isConnectWeek('2026-10-29', cfg), false);
  assert.equal(isConnectWeek('2026-11-06', cfg), false);
  assert.equal(isConnectWeek('2026-11-09', cfg), true);
  assert.equal(isConnectWeek('2026-11-22', cfg), true); // Sunday of the 2nd connect week
  assert.equal(isConnectWeek('2026-11-23', cfg), false);
  assert.equal(isConnectWeek('2026-10-12', cfg), true); // before the anchor too
  assert.equal(weekLabel('2026-11-03', cfg), 'Home week 2 of 2');
  assert.equal(weekLabel('2026-11-10', cfg), 'Connect week 1 of 2');
  assert.deepEqual(nextSwitch('2026-10-29', cfg), { date: '2026-11-09', connect: true });
});

test('a logged login moves the logout by the shift length', () => {
  const d = workDay('2026-10-29', cfg, { '2026-10-29': { in: '10:10' } });
  assert.equal(d.mode, 'wfh');
  assert.deepEqual([d.shift?.login, d.shift?.logout], ['10:10', '18:40']);
  const o = workDay('2026-11-10', cfg, { '2026-11-10': { in: '09:50' } });
  assert.deepEqual([o.leaveBy, o.shift?.logout, o.homeBy], ['08:50', '18:20', '19:00']);
  assert.equal(workDay('2026-11-10', cfg, { '2026-11-10': { in: '09:50', out: '19:30' } }).homeBy, '20:10');
});

test('office day: leave = login − commute, home = logout + commute; overrides win', () => {
  const d = workDay('2026-10-29', officeCfg);
  assert.equal(d.mode, 'office');
  assert.equal(d.leaveBy, '08:50');
  assert.equal(d.homeBy, '18:40');
  const late = workDay('2026-10-29', officeCfg, { '2026-10-29': { shift: 'late' } });
  assert.equal(late.leaveBy, '10:20');
  assert.equal(late.homeBy, '20:40');
  assert.equal(workDay('2026-10-31', officeCfg).mode, 'off'); // Saturday
  assert.equal(workDay('2026-11-10', officeCfg).mode, 'wfh');
  assert.equal(workDay('2026-11-10', officeCfg).leaveBy, null);
  assert.equal(workDay('2026-10-30', officeCfg, { '2026-10-30': { mode: 'leave' } }).shift, null);
});

test('pings: pack, leave and logout on office days; heads-up the evening before a connect block', () => {
  const office = workPings('2026-10-29', officeCfg, {}, 'Push');
  assert.deepEqual(office.map((p) => [p.id, p.at]), [['pack', '08:30'], ['leave', '08:50'], ['logout', '18:00']]);
  assert.match(office[0].body, /Gym bag/);
  const sunday = workPings('2026-11-22', officeCfg);
  assert.deepEqual(sunday.map((p) => p.id), ['eve']);
  assert.match(sunday[0].title, /Connect week starts tomorrow/);
  assert.equal(workPings('2026-10-29', { ...DEFAULT_WORK, remind: false }).length, 0);
});

test('repeating tasks roll forward and past today', () => {
  assert.equal(nextDue('2026-10-29T09:00', 'daily', '2026-10-29'), '2026-10-30T09:00');
  assert.equal(nextDue('2026-10-30', 'weekdays', '2026-10-30'), '2026-11-02'); // Fri → Mon
  assert.equal(nextDue('2026-01-31', 'monthly', '2026-01-31'), '2026-02-28');
  assert.equal(nextDue('2026-10-05T10:00', 'monthly', '2026-12-20'), '2027-01-05T10:00'); // overdue skips ahead
  assert.equal(nextDue('2024-02-29', 'yearly', '2024-03-01'), '2025-02-28');
  assert.equal(remindAt('2026-10-29', 60), null);
  assert.equal(remindAt('2026-10-29T10:00', 60), new Date('2026-10-29T09:00').getTime());
});

test('AI actions: split from the reply and validated', () => {
  const reply = 'Box this:\n```actions\n[{"type":"task","title":"Pay rent","due":"2026-11-05T10:00","repeat":"monthly","remind_before":1440,"priority":9},{"type":"task","title":""},{"type":"routine","name":"Walk","days":[1,9,1],"time":"19:30"},{"type":"workday","date":"2026-11-06","mode":"leave"},{"type":"workday","date":"nope","mode":"leave"},{"type":"hack"}]\n```';
  const { text, raw } = splitActions(reply);
  assert.equal(text, 'Box this:');
  const a = normaliseActions(raw);
  assert.equal(a.length, 3);
  assert.deepEqual(a[0], { type: 'task', title: 'Pay rent', due: '2026-11-05T10:00', repeat: 'monthly', remind_before: 1440, priority: 3, notes: null });
  assert.deepEqual(a[1], { type: 'routine', name: 'Walk', emoji: null, days: [1], time: '19:30', duration_min: 30 });
  assert.equal(a[2].type, 'workday');
  // A partial block while streaming is hidden, not parsed.
  assert.deepEqual(splitActions('Sure\n```actions\n[{"type":'), { text: 'Sure', raw: null });
  // All-day due can't have an early reminder; bad dates are dropped to undated.
  assert.deepEqual(normaliseActions([{ type: 'task', title: 'x', due: '2026-13-40', repeat: 'daily', remind_before: 60 }])[0], { type: 'task', title: 'x', due: null, repeat: null, remind_before: 0, priority: 0, notes: null });
});

import { nextBirthday, nextContact, peoplePings, type Person } from '../web/src/core/people.ts';

test('pit crew: weekly-on-Sunday rhythm, overdue N-day rhythm, birthdays', () => {
  const mom: Person = { id: 'm', name: 'Mom', emoji: null, phone: null, birthday: '1970-03-14', every_days: 7, weekday: 0, call_at: '19:00', last_contact: null, notes: null };
  assert.equal(nextContact(mom, '2026-10-29'), '2026-11-01'); // next Sunday
  assert.equal(nextContact({ ...mom, last_contact: '2026-10-31' }, '2026-11-01'), '2026-11-08'); // Saturday's call covers Sunday
  assert.equal(nextContact({ ...mom, last_contact: '2026-10-25' }, '2026-11-01'), '2026-11-01');
  const friend: Person = { ...mom, id: 'f', weekday: null, every_days: 14, last_contact: '2026-10-01', birthday: '2000-10-30' };
  assert.equal(nextContact(friend, '2026-10-29'), '2026-10-29');
  assert.deepEqual(nextBirthday(mom, '2026-10-29'), { date: '2027-03-14', inDays: 136, age: 57 });
  assert.equal(nextBirthday({ ...mom, birthday: '2000-02-29' }, '2027-01-01')!.date, '2027-02-28');
  const pings = peoplePings([mom, friend], '2026-10-29');
  assert.deepEqual(pings.map((p) => p.id).sort(), ['bday-eve:f', 'touch:f']);
});

import { planWeek } from '../web/src/core/weekPlan.ts';

test('week plan: gym after the commute on office days, nothing overlaps, packing the night before', () => {
  const days = planWeek({ from: '2026-11-08', days: 3, work: workConfig({}), gymShift: 0, dsaCount: () => 2, routines: [{ name: 'Walk', time: '06:30', duration_min: 45, days: [0, 1, 2, 3, 4, 5, 6] }], cookAt: '16:00' });
  const mon = days[1];
  assert.equal(mon.label, 'Office');
  const gym = mon.blocks.find((b) => b.kind === 'gym')!;
  assert.ok(gym.start >= '19:00', `gym at ${gym.start}`);
  assert.ok(mon.blocks.some((b) => b.kind === 'dsa'));
  assert.ok(days[0].blocks.some((b) => b.kind === 'pack'), 'Sunday packs for Monday office');
  assert.ok(days[0].blocks.some((b) => b.kind === 'shop'));
  for (const d of days) {
    const bs = [...d.blocks].sort((a, b) => a.start.localeCompare(b.start));
    for (let i = 1; i < bs.length; i++) assert.ok(bs[i].start >= bs[i - 1].end, `${d.date}: ${bs[i - 1].title} overlaps ${bs[i].title}`);
  }
});
