// Office schedule (connect/home weeks), repeating tasks and AI action parsing — pure core modules.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_WORK, isConnectWeek, nextSwitch, weekLabel, workConfig, workDay, workPings } from '../web/src/core/work.ts';
import { nextDue, remindAt } from '../web/src/core/tasks.ts';
import { normaliseActions, splitActions } from '../web/src/core/aiActions.ts';

const cfg = workConfig({});

test('connect weeks: this week and next in the office, then two at home, repeating', () => {
  assert.equal(isConnectWeek('2026-10-29', cfg), true); // Thu, week of 26 Oct
  assert.equal(isConnectWeek('2026-11-06', cfg), true); // next week
  assert.equal(isConnectWeek('2026-11-09', cfg), false);
  assert.equal(isConnectWeek('2026-11-22', cfg), false); // Sunday of the 2nd home week
  assert.equal(isConnectWeek('2026-11-23', cfg), true);
  assert.equal(isConnectWeek('2026-10-19', cfg), false); // before the anchor too
  assert.equal(weekLabel('2026-11-03', cfg), 'Connect week 2 of 2');
  assert.equal(weekLabel('2026-11-10', cfg), 'Home week 1 of 2');
  assert.deepEqual(nextSwitch('2026-10-29', cfg), { date: '2026-11-09', connect: false });
});

test('office day: leave = login − commute, home = logout + commute; overrides win', () => {
  const d = workDay('2026-10-29', cfg);
  assert.equal(d.mode, 'office');
  assert.equal(d.leaveBy, '08:50');
  assert.equal(d.homeBy, '18:40');
  const late = workDay('2026-10-29', cfg, { '2026-10-29': { shift: 'late' } });
  assert.equal(late.leaveBy, '10:20');
  assert.equal(late.homeBy, '20:40');
  assert.equal(workDay('2026-10-31', cfg).mode, 'off'); // Saturday
  assert.equal(workDay('2026-11-10', cfg).mode, 'wfh');
  assert.equal(workDay('2026-11-10', cfg).leaveBy, null);
  assert.equal(workDay('2026-10-30', cfg, { '2026-10-30': { mode: 'leave' } }).shift, null);
});

test('pings: pack, leave and logout on office days; heads-up the evening before a connect block', () => {
  const office = workPings('2026-10-29', cfg, {}, 'Push');
  assert.deepEqual(office.map((p) => [p.id, p.at]), [['pack', '08:30'], ['leave', '08:50'], ['logout', '18:00']]);
  assert.match(office[0].body, /Gym bag/);
  const sunday = workPings('2026-11-22', cfg);
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
