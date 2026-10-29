// Pit crew circles, map pins and weather nudges.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { circleTree, cityPins, kmBetween, rhythmLabel, weatherNudge, weatherOf, nextContact, type Person } from '../web/src/core/people.ts';

const P = (name: string, x: Partial<Person> = {}): Person => ({ id: name, name, emoji: null, phone: null, birthday: null, every_days: 0, weekday: null, call_at: null, last_contact: null, notes: null, ...x });

test('circles group into orgs, in a fixed order, unknown → Other', () => {
  const tree = circleTree([P('Rahul', { circle: 'Work', org: 'Google' }), P('Mom', { circle: 'Family', every_days: 1 }), P('Asha', { circle: 'Work', org: 'Amazon' }), P('Zed', { circle: 'Aliens' }), P('Kiran', { circle: 'Work' })], '2026-10-29');
  assert.deepEqual(tree.map((c) => c.circle), ['Family', 'Work', 'Other']);
  assert.equal(tree[0].due, 1);
  assert.deepEqual(tree[1].orgs.map((o) => o.org), [null, 'Amazon', 'Google']);
});

test('daily rhythm is due every day until called', () => {
  const mom = P('Mom', { every_days: 1, last_contact: '2026-10-28' });
  assert.equal(rhythmLabel(mom), 'Daily');
  assert.equal(nextContact(mom, '2026-10-29'), '2026-10-29');
  assert.equal(nextContact({ ...mom, last_contact: '2026-10-29' }, '2026-10-29'), '2026-10-30');
});

test('people in one city share a pin; weather words and nudges', () => {
  const pins = cityPins([P('Mom', { city: 'Jaipur', lat: 26.9124, lon: 75.7873 }), P('Dad', { city: 'Jaipur', lat: 26.9124, lon: 75.7873 }), P('Riya', { city: 'Bengaluru', lat: 12.97, lon: 77.59 }), P('X')]);
  assert.equal(pins.length, 2);
  assert.equal(pins[0].people.length, 2);
  assert.ok(Math.abs(kmBetween({ lat: 28.61, lon: 77.21 }, { lat: 26.91, lon: 75.79 }) - 235) < 15);
  assert.equal(weatherOf(0, false).emoji, '🌙');
  assert.equal(weatherOf(63).text, 'Rain');
  assert.match(weatherNudge('Mom', 'Jaipur', { temp: 42, code: 0 })!, /42° in Jaipur/);
  assert.equal(weatherNudge('Mom', 'Jaipur', { temp: 25, code: 1 }), null);
});
