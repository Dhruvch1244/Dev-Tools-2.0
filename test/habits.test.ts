// Habit streaks respect scheduled days; points, levels and "never miss twice" behave.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { atRisk, bestStreak, level, parseDays, perfectStreak, pointsOn, rate, shift, stackLine, streak, weeksGrid } from '../web/src/core/habits.ts';

const T = '2026-10-29'; // Thursday
const set = (...ds: string[]) => new Set(ds);
const WEEKDAYS = [1, 2, 3, 4, 5];

test('streak counts back over due days only', () => {
  // Daily: Tue, Wed done, today open → 2 (today isn't over yet).
  assert.equal(streak(set('2026-10-27', '2026-10-28'), parseDays(null), T), 2);
  assert.equal(streak(set('2026-10-27', '2026-10-28', T), parseDays(null), T), 3);
  // Weekdays: Fri 23 + Mon–Wed done; the weekend doesn't break it.
  assert.equal(streak(set('2026-10-23', '2026-10-26', '2026-10-27', '2026-10-28'), WEEKDAYS, T), 4);
  // A missed due day breaks it.
  assert.equal(streak(set('2026-10-26', '2026-10-28'), parseDays(null), T), 1);
});

test('best streak and 30-day rate', () => {
  const done = set('2026-10-01', '2026-10-02', '2026-10-03', '2026-10-05');
  assert.equal(bestStreak(done, parseDays(null), '2026-09-01', T), 3);
  assert.equal(rate(set('2026-10-28', '2026-10-27'), parseDays(null), T, 4), 2 / 3);
});

test('never miss twice flags a habit missed last time and due today', () => {
  assert.equal(atRisk(set('2026-10-27'), parseDays(null), T), true);
  assert.equal(atRisk(set('2026-10-28'), parseDays(null), T), false);
  assert.equal(atRisk(set('2026-10-27', T), parseDays(null), T), false);
  // Weekday habit on a Monday, missed Friday → at risk; weekend skipped.
  assert.equal(atRisk(set('2026-10-22'), WEEKDAYS, '2026-10-26'), true);
});

test('points, perfect days and levels', () => {
  const hs = [
    { id: 'a', days: parseDays(null), done: set(T, shift(T, -1)) },
    { id: 'b', days: WEEKDAYS, done: set(T) },
  ];
  assert.equal(pointsOn(hs, T), 10 + 10 + 25);
  assert.equal(perfectStreak(hs, T), 1);
  assert.equal(level(0).name, 'Karting');
  assert.equal(level(1200).name, 'F3');
  assert.ok(level(1200).progress > 0 && level(1200).progress < 1);
});

test('helpers', () => {
  const g = weeksGrid(T);
  assert.equal(g.length, 12);
  assert.equal(g[11][3], T); // Thursday sits in the 4th row of the current week
  assert.equal(stackLine({ name: 'Read', cue: 'after I get into bed', tiny: 'read one page' }), 'After I get into bed, I will read one page');
  assert.deepEqual(parseDays('[1,3]'), [1, 3]);
  assert.equal(parseDays('garbage').length, 7);
});
