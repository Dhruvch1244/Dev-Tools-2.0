// Guided journal: instead of a blank page, a handful of questions a night, drawn at random from a
// bank (plus a few that react to what actually happened — gym day, office day, a long run) and
// stable per date so phone and laptop ask the same ones. The answers become the raw material the
// AI turns into a story. Pure: no React, no I/O.

export type Answer = { q: string; a: string };
/** The "question" a free-write page is saved under — one blank page instead of prompts. */
export const FREE_WRITE = 'Free write';
export type DayFacts = {
  gym?: string | null; // "Push" if a session was logged
  gymPlanned?: string | null; // planned day type when nothing was logged
  work?: 'office' | 'wfh' | 'leave' | 'off';
  sport?: string | null; // "run 5.2 km"
  food?: string | null; // a dish eaten today
  dsaSolved?: number;
  called?: string | null; // someone you logged a chat with
  weekday?: number; // 0 = Sunday
};

/** The bank, by theme. Each night draws across themes so entries don't all sound the same. */
export const BANK: Record<string, string[]> = {
  recap: [
    'What’s the one moment from today you’d want to remember in a year?',
    'Describe today in three words — then tell me why those three.',
    'What was the first thing you did today, and how did the day unfold from there?',
    'If today were a race, how did it go — clean start, crash, or a late overtake?',
    'What surprised you today?',
  ],
  feeling: [
    'How are you actually feeling right now — not “fine”, the real answer?',
    'What drained your energy today, and what gave you some back?',
    'Was there a moment you felt really calm or really stressed? What was going on?',
    'What’s on your mind tonight that you haven’t said out loud?',
  ],
  win: [
    'What’s one small win from today, even a tiny one?',
    'What did you do today that future-you will thank you for?',
    'What are you proud of from today?',
  ],
  gratitude: [
    'Who or what are you grateful for today, and why?',
    'What made you smile or laugh today?',
    'What’s something ordinary today that was actually nice?',
  ],
  people: [
    'Who did you talk to today that mattered? What did you talk about?',
    'Did anyone surprise you today — good or bad?',
    'Who’s been on your mind lately?',
  ],
  growth: [
    'What did you learn today — about code, people, or yourself?',
    'What would you do differently if you could replay today?',
    'What challenged you today, and how did you handle it?',
  ],
  tomorrow: [
    'What’s the one thing that would make tomorrow a good day?',
    'What are you looking forward to this week?',
    'What do you want to let go of before you sleep?',
  ],
  fun: [
    'Best thing you ate today — and would you eat it again tomorrow?',
    'What song, video or thing did you enjoy today?',
    'If you could teleport anywhere for an hour tonight, where would you go?',
    'What’s a random thought you had today?',
  ],
};

const THEMES = ['recap', 'feeling', 'win', 'gratitude', 'people', 'growth', 'tomorrow', 'fun'];

/** Questions that react to the day's data — at most one or two of these per night. */
export function contextQuestions(f: DayFacts): string[] {
  const out: string[] = [];
  if (f.gym) out.push(`You trained ${f.gym} today — how did it feel? Any lift that moved well or felt heavy?`);
  else if (f.gymPlanned && f.gymPlanned !== 'Rest') out.push(`It was a ${f.gymPlanned} day but no session got logged — what got in the way?`);
  if (f.work === 'office') out.push('How was the office today — anything from the commute, the team or a meeting worth remembering?');
  if (f.work === 'wfh') out.push('Working from home today — did you get into a good flow, or was it scattered?');
  if (f.work === 'leave' || f.work === 'off') out.push('A day off — how did you spend it, and did it recharge you?');
  if (f.sport) out.push(`You did a ${f.sport} — what was going through your head out there?`);
  if (f.dsaSolved) out.push(`You solved ${f.dsaSolved} DSA problem${f.dsaSolved > 1 ? 's' : ''} — which one clicked, and what was the trick?`);
  if (f.called) out.push(`You talked to ${f.called} today — how are they doing?`);
  if (f.food) out.push(`You had ${f.food} today — was it good?`);
  if (f.weekday === 0) out.push('It’s Sunday — what was the best part of this week?');
  return out;
}

/** Small deterministic PRNG so a date always draws the same questions (until you shuffle). */
function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}
const seedOf = (date: string, salt = 0) => [...date].reduce((a, c) => a * 31 + c.charCodeAt(0), 7) + salt * 7919;

/**
 * Tonight's questions: up to two that react to the day, then random picks from different themes,
 * always opening with a recap and closing with tomorrow. `salt` reshuffles.
 */
export function questionsFor(date: string, facts: DayFacts, count = 5, salt = 0): string[] {
  const r = rng(seedOf(date, salt));
  const pickFrom = (xs: string[]) => xs[Math.floor(r() * xs.length)];
  const ctx = contextQuestions(facts).sort(() => r() - 0.5).slice(0, 2);
  const middle = THEMES.filter((t) => t !== 'recap' && t !== 'tomorrow').sort(() => r() - 0.5);
  const qs = [pickFrom(BANK.recap), ...ctx];
  for (const t of middle) {
    if (qs.length >= count - 1) break;
    qs.push(pickFrom(BANK[t]));
  }
  qs.push(pickFrom(BANK.tomorrow));
  return qs;
}

/** Swap one question for another from the bank that isn't already asked. */
export function anotherQuestion(current: string[], i: number, salt: number) {
  const r = rng(seedOf(current.join('|'), salt + i));
  const pool = Object.values(BANK).flat().filter((q) => !current.includes(q));
  return pool[Math.floor(r() * pool.length)] ?? current[i];
}

export const STORY_SYSTEM = `You turn someone's answers to a few evening journal questions into their diary entry for the day.
- Their answers are raw: typed fast or dictated, often with typos, no punctuation, Hinglish, half sentences, thoughts out of order. Understand what they meant, fix it silently and put it in a sensible order — never comment on how it was written.
- Write in FIRST PERSON, in their voice — casual, honest, a bit of personality (they're a young software engineer in India who likes F1). Keep their words and details; don't invent events, people or feelings they didn't mention.
- Make it read like a short story of the day: a natural flow (morning → evening, or around the main moment), not a Q&A. Blend in the day's facts only where they fit.
- Start with a short title line in the form "# <title>" (3–6 words), then 120–260 words in 2–4 paragraphs. End with one line about tomorrow if they gave one.
- No therapy-speak, no moralising, no emojis unless they used them.`;

export function storyPrompt(date: string, answers: Answer[], facts: string) {
  return [
    `Date: ${date}`,
    facts ? `What the app logged today: ${facts}` : '',
    '# Answers',
    ...answers.filter((x) => x.a.trim()).map((x) => (x.q === FREE_WRITE ? `Free writing (unprompted):\n${x.a.trim()}` : `Q: ${x.q}\nA: ${x.a.trim()}`)),
  ]
    .filter(Boolean)
    .join('\n\n');
}
