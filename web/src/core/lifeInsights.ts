// Life, read from the journal: after a story is written the AI pulls out the day's mood, energy,
// stress, what it was about, who and where came up, and any lasting facts about your life ("started
// a new project at work", "Mom's knee surgery on the 12th"). The Life page rolls those up into
// moods over time, themes, your people and a running life log. Pure: no React, no I/O.

export type FactKind = 'win' | 'work' | 'health' | 'people' | 'goal' | 'worry' | 'money' | 'event' | 'idea';
export const FACT_META: Record<FactKind, { label: string; emoji: string; color: string }> = {
  win: { label: 'Win', emoji: '🏆', color: '#ffd23f' },
  work: { label: 'Work', emoji: '💼', color: '#4fb3ff' },
  health: { label: 'Health', emoji: '💪', color: '#2bd46b' },
  people: { label: 'People', emoji: '🫂', color: '#ff5fa2' },
  goal: { label: 'Goal', emoji: '🎯', color: '#e10600' },
  worry: { label: 'On my mind', emoji: '🌧️', color: '#9aa0ad' },
  money: { label: 'Money', emoji: '💸', color: '#7ee0a1' },
  event: { label: 'Happened', emoji: '📌', color: '#c9a2ff' },
  idea: { label: 'Idea', emoji: '💡', color: '#ffb547' },
};
const KINDS = Object.keys(FACT_META) as FactKind[];

export type Insights = {
  /** 1–5 each (5 = great mood / lots of energy / very stressed). */
  mood: number | null;
  energy: number | null;
  stress: number | null;
  /** One line: the day in a sentence. */
  summary: string | null;
  /** 2–5 lowercase themes: "work", "gym", "family", "focus"… */
  tags: string[];
  people: { name: string; note: string | null }[];
  places: string[];
  facts: { kind: FactKind; text: string }[];
  gratitude: string[];
};

export const INSIGHTS_SYSTEM = `You read one day of someone's journal (their answers and the diary entry) and pull out structured details for their life dashboard.
Reply with ONLY one JSON object, no prose:
{"mood":4,"energy":3,"stress":2,"summary":"Scattered WFH day, but a good Push session saved it","tags":["work","gym","tired"],"people":[{"name":"Mom","note":"knee is better"}],"places":["Cyber Hub"],"facts":[{"kind":"work","text":"Moved to the payments team"}],"gratitude":["Mom's call"]}
Rules:
- mood, energy, stress: 1–5 judged from what they wrote (null if there is no signal). 5 = great mood / high energy / very stressed.
- summary: one short line, first person not needed, max ~14 words.
- tags: 2–5 short lowercase themes.
- people: real people they mentioned by name or relation (Mom, Dad, a friend's name, "manager"). Not celebrities. note = what was said about them, short, or null.
- places: named places they went or want to go (cafés, areas, cities). Not "home" or "office".
- facts: only things worth remembering later — events, decisions, changes, goals, worries, wins, money moves, ideas. kind is one of: ${KINDS.join(', ')}. Max 5, each under 15 words. Skip routine stuff ("had lunch").
- gratitude: things they were grateful for or enjoyed, short.
- Never invent anything they didn't say.`;

const str = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
const score = (v: unknown) => (typeof v === 'number' && v >= 1 && v <= 5 ? Math.round(v) : null);
const strs = (v: unknown, n: number, max: number) => (Array.isArray(v) ? v.map((x) => str(x, max)).filter((x): x is string => !!x).slice(0, n) : []);

export function normaliseInsights(raw: unknown): Insights {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const people = (Array.isArray(o.people) ? o.people : [])
    .map((p) => (typeof p === 'string' ? { name: str(p, 40), note: null } : { name: str((p as Record<string, unknown>)?.name, 40), note: str((p as Record<string, unknown>)?.note, 120) }))
    .filter((p): p is { name: string; note: string | null } => !!p.name)
    .slice(0, 8);
  const facts = (Array.isArray(o.facts) ? o.facts : [])
    .map((f) => {
      const r = (f ?? {}) as Record<string, unknown>;
      const kind = KINDS.includes(r.kind as FactKind) ? (r.kind as FactKind) : 'event';
      return { kind, text: str(r.text, 140) };
    })
    .filter((f): f is { kind: FactKind; text: string } => !!f.text)
    .slice(0, 5);
  return {
    mood: score(o.mood),
    energy: score(o.energy),
    stress: score(o.stress),
    summary: str(o.summary, 160),
    tags: [...new Set(strs(o.tags, 5, 24).map((t) => t.toLowerCase()))],
    people,
    places: strs(o.places, 6, 60),
    facts,
    gratitude: strs(o.gratitude, 4, 100),
  };
}

export function insightsPrompt(date: string, answers: { q: string; a: string }[], story: string | null) {
  return [`Date: ${date}`, ...answers.filter((x) => x.a.trim()).map((x) => `Q: ${x.q}\nA: ${x.a.trim()}`), story ? `# Diary entry\n${story}` : ''].filter(Boolean).join('\n\n');
}

export type Day = { date: string; insights: Insights; mood?: number | null };

/** Mood words for the 1–5 scale, used on the Life page. */
export const MOOD_WORDS = ['', 'Rough', 'Low', 'Okay', 'Good', 'Great'];

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/** The roll-up the Life page shows: averages, themes, people, places, and the life log. */
export function lifeRollup(days: Day[]) {
  const sorted = [...days].sort((a, b) => b.date.localeCompare(a.date));
  const mood = (d: Day) => d.insights.mood ?? d.mood ?? null;
  const count = <T,>(xs: T[], key: (x: T) => string) => {
    const m = new Map<string, { key: string; n: number; last: string; items: T[] }>();
    return { m, add: (x: T, date: string) => {
      const k = key(x);
      const e = m.get(k.toLowerCase()) ?? { key: k, n: 0, last: date, items: [] };
      e.n++;
      if (date > e.last) e.last = date;
      e.items.push(x);
      m.set(k.toLowerCase(), e);
    } };
  };
  const tags = count<string>([], (t) => t);
  const people = count<{ name: string; note: string | null; date: string }>([], (p) => p.name);
  const places = count<string>([], (p) => p);
  for (const d of sorted) {
    d.insights.tags.forEach((t) => tags.add(t, d.date));
    d.insights.people.forEach((p) => people.add({ ...p, date: d.date }, d.date));
    d.insights.places.forEach((p) => places.add(p, d.date));
  }
  const top = <T,>(m: Map<string, { key: string; n: number; last: string; items: T[] }>, n: number) => [...m.values()].sort((a, b) => b.n - a.n || b.last.localeCompare(a.last)).slice(0, n);
  const series = sorted.map((d) => ({ date: d.date, mood: mood(d), energy: d.insights.energy, stress: d.insights.stress })).reverse();
  const recent = sorted.slice(0, 7);
  const before = sorted.slice(7, 14);
  const moodNow = avg(recent.map(mood).filter((x): x is number => x != null));
  const moodBefore = avg(before.map(mood).filter((x): x is number => x != null));
  return {
    days: sorted.length,
    series,
    mood: moodNow,
    moodDelta: moodNow != null && moodBefore != null ? moodNow - moodBefore : null,
    energy: avg(recent.map((d) => d.insights.energy).filter((x): x is number => x != null)),
    stress: avg(recent.map((d) => d.insights.stress).filter((x): x is number => x != null)),
    tags: top(tags.m, 12).map((t) => ({ tag: t.key, n: t.n })),
    people: top(people.m, 12).map((p) => ({ name: p.key, n: p.n, last: p.last, note: p.items.find((i) => i.note)?.note ?? null })),
    places: top(places.m, 8).map((p) => ({ place: p.key, n: p.n, last: p.last })),
    log: sorted.flatMap((d) => d.insights.facts.map((f) => ({ ...f, date: d.date }))),
    gratitude: sorted.flatMap((d) => d.insights.gratitude.map((g) => ({ text: g, date: d.date }))).filter((g, i, all) => all.findIndex((x) => x.text.toLowerCase() === g.text.toLowerCase()) === i).slice(0, 12),
    /** Best and hardest recent days by mood, for "what made the good days good". */
    best: sorted.filter((d) => (mood(d) ?? 0) >= 4).slice(0, 3).map((d) => ({ date: d.date, summary: d.insights.summary })),
    hard: sorted.filter((d) => (mood(d) ?? 5) <= 2).slice(0, 3).map((d) => ({ date: d.date, summary: d.insights.summary })),
  };
}

/** Which tags show up on good days vs hard days: "gym" on 4 of your 5 best days. */
export function moodLifts(days: Day[]) {
  const moodOf = (d: Day) => d.insights.mood ?? d.mood ?? null;
  const rated = days.filter((d) => moodOf(d) != null);
  if (rated.length < 5) return [];
  const base = avg(rated.map((d) => moodOf(d)!))!;
  const byTag = new Map<string, number[]>();
  for (const d of rated) for (const t of d.insights.tags) byTag.set(t, [...(byTag.get(t) ?? []), moodOf(d)!]);
  return [...byTag.entries()]
    .filter(([, ms]) => ms.length >= 3)
    .map(([tag, ms]) => ({ tag, n: ms.length, lift: avg(ms)! - base }))
    .filter((x) => Math.abs(x.lift) >= 0.3)
    .sort((a, b) => b.lift - a.lift);
}

export const SUMMARY_SYSTEM = `You write a short, warm, honest "state of my life" recap from someone's journal insights over the last weeks. They're a young software engineer in India who likes F1 — you can use a light race-engineer voice.
Use Markdown: 3 short sections with "###" headings — "How you've been", "What's lifting you / weighing on you", "One thing for this week". 120–200 words total. Refer to concrete things from the data (people, wins, worries, themes). No therapy-speak, no moralising, never invent facts.`;
