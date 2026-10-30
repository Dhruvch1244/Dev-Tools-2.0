// Daily 3 story order, the shutdown/top-3 helpers, focus stints, place reactions and the widget script.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CHAPTERS, EVERYDAY, nextChapterQs, normaliseFollow, pickThree, progress } from '../web/src/core/story.ts';
import { parseTop, runEnding, toTomorrow, topJson } from '../web/src/core/day.ts';
import { activeStint, focusWeek, leftSec, stintMinutes } from '../web/src/core/focus.ts';
import { placeAction, placeId, type PlaceSnap } from '../web/src/core/places.ts';
import { widgetScript } from '../web/src/core/widget.ts';

test('Daily 3 walks the story in order, with one everyday question', () => {
  const p = pickThree('2026-10-30', new Set(), null);
  assert.deepEqual(p.map((x) => x.kind), ['chapter', 'chapter', 'everyday']);
  assert.equal(p[0].q, CHAPTERS[0].qs[0]);
  assert.equal(p[1].q, CHAPTERS[0].qs[1]);
  assert.ok(EVERYDAY.includes(p[2].q));
  // Same date, same everyday question (phone and laptop agree even before the server stores them).
  assert.equal(pickThree('2026-10-30', new Set(), null)[2].q, p[2].q);
  const f = pickThree('2026-10-31', new Set([p[0].q, p[1].q]), 'What was the street called?');
  assert.deepEqual(f.map((x) => x.kind), ['follow', 'chapter', 'everyday']);
  assert.equal(f[1].q, CHAPTERS[0].qs[2]);
});

test('Daily 3 brings skipped questions back once the bank runs dry', () => {
  const all = new Set([...CHAPTERS.flatMap((c) => c.qs), ...EVERYDAY]);
  assert.equal(nextChapterQs(all, 2).length, 0);
  const p = pickThree('2027-06-01', all, null, [CHAPTERS[2].qs[3]]);
  assert.equal(p.length, 3);
  assert.equal(p[0].q, CHAPTERS[2].qs[3]);
  const pr = progress([{ q: CHAPTERS[0].qs[0], a: 'x' }, { q: CHAPTERS[0].qs[1], a: ' ' }]);
  assert.equal(pr[0].done, 1);
});

test('AI follow-ups are cleaned or dropped', () => {
  assert.equal(normaliseFollow('NONE'), null);
  assert.equal(normaliseFollow('"What did your grandmother cook on Sundays"'), 'What did your grandmother cook on Sundays?');
  assert.equal(normaliseFollow('ok'), null);
});

test('top 3, streaks and moving a task to tomorrow', () => {
  assert.deepEqual(parseTop(topJson([{ t: 'Ship PR', done: false }, { t: ' ', done: false }])), [{ t: 'Ship PR', done: false }]);
  assert.deepEqual(parseTop('just a sentence'), [{ t: 'just a sentence', done: false }]);
  assert.deepEqual(parseTop(null), []);
  assert.equal(runEnding(['2026-10-28', '2026-10-29'], '2026-10-30'), 2, 'tonight not done yet still counts yesterday');
  assert.equal(runEnding(['2026-10-28', '2026-10-29', '2026-10-30'], '2026-10-30'), 3);
  assert.equal(runEnding(['2026-10-27'], '2026-10-30'), 0);
  assert.equal(toTomorrow('2026-10-30T18:00', '2026-10-31'), '2026-10-31T18:00');
  assert.equal(toTomorrow('2026-10-28', '2026-10-31'), '2026-10-31');
});

test('focus stints: countdown, honest minutes, abandoned stints expire', () => {
  const s = { date: '2026-10-30', started_at: '2026-10-30T10:00:00.000Z', planned: 45, minutes: 0, ended_at: null, distractions: 1, away_sec: 300 };
  const t0 = Date.parse(s.started_at);
  assert.equal(leftSec(s, t0 + 60_000), 44 * 60);
  assert.equal(stintMinutes(s, t0 + 60 * 60_000), 40, 'capped at the plan, minus 5 min wandering');
  assert.equal(activeStint([s], t0 + 10 * 60_000), s);
  assert.equal(activeStint([s], t0 + 80 * 60_000), null);
  const w = focusWeek([{ ...s, ended_at: 'x', minutes: 40 }], '2026-10-30');
  assert.equal(w.today, 40);
  assert.equal(w.days.length, 7);
  assert.equal(w.wanderRate, 1, 'rate is per hour, with under an hour counted as one');
});

const snap: PlaceSnap = { gym: { type: 'push', label: 'Push', focus: 'Chest · shoulders · triceps', sets: 0 }, protein: { eaten: 60, target: 130 }, water: { glasses: 3, goal: 8 }, habits: { done: 1, total: 4 }, story: { answered: 0, total: 3 }, work: { mode: 'office' }, shutdown: null };

test('places react sensibly', () => {
  assert.match(placeAction({ id: 'g', name: 'Gym', kind: 'gym' }, 'arrive', snap, '18:30', '19:10').push!.title, /Push day/);
  assert.match(placeAction({ id: 'g', name: 'Gym', kind: 'gym' }, 'leave', snap, '19:30', '20:10').push!.title, /Log/);
  assert.match(placeAction({ id: 'g', name: 'Gym', kind: 'gym' }, 'leave', { ...snap, gym: { ...snap.gym, sets: 18 } }, '19:30', '20:10').push!.body, /70 g protein/);
  assert.deepEqual(placeAction({ id: 'o', name: 'Office', kind: 'office' }, 'arrive', snap, '09:41', '10:21').clock, { in: '09:41', mode: 'office' });
  const out = placeAction({ id: 'o', name: 'Office', kind: 'office' }, 'leave', snap, '18:05', '18:45');
  assert.equal(out.clock!.out, '18:05');
  assert.match(out.push!.title, /18:45/);
  assert.equal(placeAction({ id: 'h', name: 'Home', kind: 'home' }, 'arrive', snap, '12:00', '12:40').push, undefined, 'no evening check at noon');
  assert.match(placeAction({ id: 'h', name: 'Home', kind: 'home' }, 'arrive', snap, '19:00', '19:40').push!.body, /Daily 3/);
  assert.equal(placeId('Cult Gym, HSR'), 'cult-gym-hsr');
});

// A tiny stand-in for Scriptable's API: enough to run the script for every widget size.
function scriptable(family: string, data: unknown) {
  const node = (): Record<string, unknown> => {
    const n: Record<string, unknown> = {};
    const child = () => node();
    Object.assign(n, {
      addText: () => ({ ...node(), centerAlignText() {} }),
      addStack: child,
      addSpacer() {},
      addImage: () => ({}),
      addDate: () => ({ applyTimeStyle() {} }),
      layoutHorizontally() {},
      layoutVertically() {},
      centerAlignContent() {},
      topAlignContent() {},
      bottomAlignContent() {},
      setPadding() {},
      presentSmall: async () => {},
      presentMedium: async () => {},
      presentLarge: async () => {},
    });
    return n;
  };
  let set: unknown = null;
  const store = new Map<string, string>();
  const env = {
    Color: Object.assign(function () {}, { white: () => ({}) }),
    Font: Object.assign(function () {}, { boldSystemFont: () => ({}) }),
    Size: function () {},
    Rect: function () {},
    Path: function (this: Record<string, unknown>) {
      this.addRoundedRect = () => {};
    },
    DrawContext: function (this: Record<string, unknown>) {
      Object.assign(this, { addPath() {}, setFillColor() {}, fillPath() {}, getImage: () => ({}) });
    },
    Request: function (this: Record<string, unknown>) {
      this.loadJSON = async () => {
        if (!data) throw new Error('offline');
        return structuredClone(data);
      };
    },
    Keychain: { set: (k: string, v: string) => store.set(k, v), get: (k: string) => store.get(k), contains: (k: string) => store.has(k) },
    ListWidget: function () {
      return node();
    },
    config: { widgetFamily: family, runsInWidget: true },
    args: {},
    Script: { setWidget: (w: unknown) => (set = w), complete() {} },
  };
  return { env, done: () => set };
}

test('the widget script runs for every size, online and offline', async () => {
  const data = { date: '2026-10-30', gym: { type: 'push', label: 'Push', focus: 'Chest', color: '#e10600', sets: 0 }, kcal: { eaten: 900, target: 2400 }, protein: { eaten: 60, target: 130 }, water: { glasses: 3, goal: 8 }, habits: { done: 1, total: 4 }, story: { answered: 1, total: 3 }, work: { mode: 'office', login: '09:30', logout: '18:00', leaveBy: '08:50' }, next: { title: 'Dentist', at: '18:30', day: '2026-10-30', kind: 'plan' }, shutdown: null, top: [{ t: 'Ship PR', done: true }] };
  const src = widgetScript('https://laptop.tail.ts.net');
  const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
  for (const fam of ['small', 'medium', 'large', 'accessoryRectangular', 'accessoryInline', 'accessoryCircular'])
    for (const d of [data, null]) {
      const { env, done } = scriptable(fam, d);
      await new AsyncFunction(...Object.keys(env), src)(...Object.values(env));
      assert.ok(done(), `${fam} ${d ? 'online' : 'offline'} set a widget`);
    }
});
