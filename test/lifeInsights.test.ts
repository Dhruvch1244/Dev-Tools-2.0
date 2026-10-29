// Journal insights are normalised defensively and roll up into the Life page.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lifeRollup, moodLifts, normaliseInsights, type Day } from '../web/src/core/lifeInsights.ts';

test('normaliseInsights cleans AI output', () => {
  const i = normaliseInsights({ mood: 4.4, energy: 9, stress: '2', summary: '  ok day ', tags: ['Work', 'work', 'GYM'], people: ['Mom', { name: 'Riya', note: 'new job' }, { note: 'x' }], places: ['Cyber Hub', 3], facts: [{ kind: 'nope', text: 'Moved teams' }, { kind: 'win', text: '' }], gratitude: 'x' });
  assert.equal(i.mood, 4);
  assert.equal(i.energy, null);
  assert.equal(i.stress, null);
  assert.equal(i.summary, 'ok day');
  assert.deepEqual(i.tags, ['work', 'gym']);
  assert.deepEqual(i.people, [{ name: 'Mom', note: null }, { name: 'Riya', note: 'new job' }]);
  assert.deepEqual(i.places, ['Cyber Hub']);
  assert.deepEqual(i.facts, [{ kind: 'event', text: 'Moved teams' }]);
  assert.deepEqual(i.gratitude, []);
  assert.deepEqual(normaliseInsights(null).tags, []);
});

const day = (date: string, mood: number, tags: string[], people: string[] = []): Day => ({ date, insights: normaliseInsights({ mood, tags, people, facts: [{ kind: 'win', text: `win ${date}` }] }) });

test('rollup and mood lifts', () => {
  const days = [day('2026-10-20', 2, ['work']), day('2026-10-21', 5, ['gym', 'work'], ['Mom']), day('2026-10-22', 5, ['gym']), day('2026-10-23', 4, ['gym'], ['mom']), day('2026-10-24', 2, ['work']), day('2026-10-25', 2, ['work'])];
  const r = lifeRollup(days);
  assert.equal(r.days, 6);
  assert.match(r.people[0].name, /^mom$/i); // Mom and mom are one person
  assert.equal(r.people[0].n, 2);
  assert.equal(r.log[0].date, '2026-10-25');
  assert.equal(r.series[0].date, '2026-10-20');
  const lifts = moodLifts(days);
  assert.equal(lifts[0].tag, 'gym');
  assert.ok(lifts[0].lift > 0);
  assert.ok(lifts.find((l) => l.tag === 'work')!.lift < 0);
});

test('gratitude jar keeps one of each, newest first', () => {
  const g = (date: string, xs: string[]): Day => ({ date, insights: normaliseInsights({ gratitude: xs }) });
  const r = lifeRollup([g('2026-10-20', ['Chai']), g('2026-10-22', ['chai', 'Rain']), g('2026-10-21', ['Mom'])]);
  assert.deepEqual(r.gratitude.map((x) => `${x.text}@${x.date}`), ['chai@2026-10-22', 'Rain@2026-10-22', 'Mom@2026-10-21']);
});
