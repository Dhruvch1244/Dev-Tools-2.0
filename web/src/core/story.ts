// "Daily 3": three questions a day about you and your life so far — not about today (that's the
// journal). They walk through your story chapter by chapter (roots → school → college → work →
// now → mind → future), mixed with one easy everyday question, and once you've answered a few, the
// AI asks follow-ups on what you actually wrote. Over months the answers become a memoir and a
// portrait of who you are. Pure: no React, no I/O.

import { runEnding } from './day';

export type Chapter = { id: string; title: string; emoji: string; blurb: string; qs: string[] };

/** Your story in order. Each day takes the next unasked question from the earliest unfinished chapter. */
export const CHAPTERS: Chapter[] = [
  {
    id: 'roots',
    title: 'Roots',
    emoji: '🏡',
    blurb: 'Family, home, where you come from',
    qs: [
      'Where did you grow up? Describe the house or street you picture first.',
      'What’s your earliest memory — even a blurry one?',
      'What were your parents like when you were little? One thing about each.',
      'Who in your family were you closest to as a kid, and why?',
      'What did a normal Sunday look like in your house growing up?',
      'What smell or food takes you straight back to childhood?',
      'What’s a family story that gets told again and again?',
      'What did your family value most — and do you value the same thing now?',
      'What’s something your mom or dad said that stuck with you?',
      'What festival or family occasion did you love most as a kid?',
    ],
  },
  {
    id: 'school',
    title: 'School days',
    emoji: '🎒',
    blurb: 'Classrooms, friends, who you were at 12',
    qs: [
      'What kind of student were you in school — topper, backbencher, somewhere in between?',
      'Which teacher do you still remember, and what did they do?',
      'Who was your best friend in school? Are you still in touch?',
      'What were you obsessed with at 12 — a game, a show, a sport, a hobby?',
      'What’s the most trouble you ever got into at school?',
      'Was there a moment in school you felt really proud of yourself?',
      'What were you scared of as a kid that seems funny now?',
      'What did you want to be when you grew up — and why?',
      'How did board exams or entrance prep feel at the time?',
      'What did teenage you think about the future — what did you expect your life to look like now?',
    ],
  },
  {
    id: 'college',
    title: 'College',
    emoji: '🎓',
    blurb: 'Leaving home, figuring things out',
    qs: [
      'How did you end up in your college and branch — choice, luck or pressure?',
      'What was the first week of college like?',
      'Who were your people in college, and how did you find them?',
      'What’s a night from college you still laugh about?',
      'When did you first get into coding — what hooked you?',
      'What did you struggle with most in college?',
      'What’s something you did in college you’re glad you tried?',
      'If you could tell first-year you one thing, what would it be?',
      'What changed in you between the start and end of college?',
      'How did placements or your first offer feel?',
    ],
  },
  {
    id: 'work',
    title: 'Work life',
    emoji: '💼',
    blurb: 'First job, career, what you build',
    qs: [
      'What was your first day at your first job like?',
      'What’s the work you’ve been proudest of so far?',
      'Who taught you the most at work — what did you pick up from them?',
      'What part of your job do you genuinely enjoy? What part drains you?',
      'Describe a bad week at work and how you got through it.',
      'What does “a good career” mean to you — money, craft, impact, freedom?',
      'What’s one skill you want to be really, really good at in five years?',
      'Have you ever thought about building something of your own? What?',
      'How do you feel on a Sunday evening before the work week?',
      'What would you do for work if money didn’t matter?',
    ],
  },
  {
    id: 'now',
    title: 'Life right now',
    emoji: '📍',
    blurb: 'Where you are, how it feels',
    qs: [
      'Describe a normal weekday of yours, start to finish, honestly.',
      'What does your space — your room, your desk — say about you?',
      'What are you most looking forward to in the next month?',
      'What’s something you’ve been putting off, and what’s really stopping you?',
      'Where do you feel most like yourself?',
      'What’s been the best part of this year so far?',
      'Is there something you’re quietly worried about these days?',
      'What do you do when you have a free evening and no plans?',
      'Who do you talk to most these days, and what about?',
      'What habit has changed your life the most in the last year?',
    ],
  },
  {
    id: 'people',
    title: 'Your people',
    emoji: '🫂',
    blurb: 'Friends, family, love, the crew',
    qs: [
      'Who are the three people you’d call at 2 am, and why them?',
      'Which friendship has changed the most over the years?',
      'What do your friends come to you for?',
      'Who’s someone you’ve lost touch with that you think about sometimes?',
      'How do you show people you care — words, time, help, food?',
      'What’s the kindest thing someone has done for you?',
      'What do you wish your parents knew about you now?',
      'What does a good relationship look like to you?',
      'Who do you admire, and what exactly about them?',
      'Is there a conversation you’ve been meaning to have with someone?',
    ],
  },
  {
    id: 'mind',
    title: 'Inside your head',
    emoji: '🧠',
    blurb: 'Values, fears, what makes you tick',
    qs: [
      'What are three things you believe that not everyone around you does?',
      'When do you feel most confident? When least?',
      'What’s a mistake that taught you something you still use?',
      'What do you do when you’re stressed — and does it actually help?',
      'What makes you angry faster than it should?',
      'What are you better at than you give yourself credit for?',
      'What does “success” look like to you — your own version, not anyone else’s?',
      'What’s a fear you’d like to get over?',
      'When did you last change your mind about something important?',
      'What do you want people to say about you when you’re not in the room?',
    ],
  },
  {
    id: 'body',
    title: 'Body & health',
    emoji: '💪',
    blurb: 'Gym, food, sleep, energy',
    qs: [
      'When did you start going to the gym, and what got you started?',
      'How do you feel about your body right now — honestly?',
      'What does food mean to you — fuel, comfort, family, fun?',
      'When did you last feel properly fit and full of energy?',
      'What’s your relationship with sleep like?',
      'What sport or activity did you love as a kid?',
      'What would you like your body to be able to do at 40?',
      'What’s the hardest thing about staying consistent for you?',
    ],
  },
  {
    id: 'money',
    title: 'Money',
    emoji: '💰',
    blurb: 'How you think about it',
    qs: [
      'How was money talked about in your house growing up?',
      'What was the first thing you bought with your own money?',
      'Do you think of yourself as a saver or a spender? Where does that come from?',
      'What’s one purchase that made your life genuinely better?',
      'What would “enough money” let you do?',
      'Is there something money-related you feel anxious or guilty about?',
    ],
  },
  {
    id: 'future',
    title: 'What’s next',
    emoji: '🏁',
    blurb: 'Dreams, plans, the life you want',
    qs: [
      'Picture yourself at 35. Where are you, and what does a normal day look like?',
      'What’s on your bucket list that you’ve never told anyone?',
      'What do you want to learn that has nothing to do with work?',
      'Where in the world would you like to live for a while?',
      'What kind of person do you want to become in the next five years?',
      'What would you regret not trying?',
      'What do you want your parents to see you do?',
      'If this year had a title, what would you want it to be by December?',
    ],
  },
];

/** Easy, everyday questions — one a day, so it never feels like an interview. */
export const EVERYDAY: string[] = [
  'What song have you had on repeat lately?',
  'What’s your perfect chai or coffee order?',
  'What’s your comfort food when the day’s been long?',
  'What’s a show or movie you could rewatch forever?',
  'Morning person or night owl — and has it always been that way?',
  'What’s the best thing you ate this month?',
  'What’s something small that always cheers you up?',
  'What’s a word or phrase you say way too much?',
  'What’s your go-to order at your favourite place to eat?',
  'What app on your phone do you open the most, and why?',
  'What’s one thing on your desk that means something to you?',
  'Rain, winter or summer — which season is yours?',
  'What’s a smell you love?',
  'What’s the last thing that made you laugh out loud?',
  'What’s a small luxury you’d never give up?',
  'What’s a skill you’d love to have instantly?',
  'What do you do on a long train or flight?',
  'What’s your favourite way to spend a Sunday morning?',
  'Which F1 driver are you most like, and why?',
  'What’s a place in your city you love that most people don’t know about?',
  'What’s a recent photo on your phone you really like? What’s the story?',
  'Tea at home or chai at a tapri?',
  'What’s a game — phone, board, sport — you could play for hours?',
  'What’s a compliment you still remember?',
  'If you had a free day tomorrow with zero responsibilities, what would you do?',
  'What’s something you’re weirdly good at?',
  'What’s your favourite thing your cook makes?',
  'Which festival do you look forward to most these days?',
  'What’s a book, video or podcast that changed how you think?',
  'What’s the best trip you’ve ever been on?',
];

export type StoryKind = 'chapter' | 'everyday' | 'follow';
export type StoryQ = { id: string; date: string; kind: StoryKind; chapter: string | null; q: string; a: string | null; skipped: number; created_at: string; updated_at: string };
export type Pick = { kind: StoryKind; chapter: string | null; q: string };

/** Small stable hash, so a date always draws the same everyday question. */
function hash(s: string) {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}

/** The next unasked questions in story order (skipped ones count as asked — they come back later). */
export function nextChapterQs(asked: Set<string>, n: number): Pick[] {
  const out: Pick[] = [];
  for (const ch of CHAPTERS)
    for (const q of ch.qs) {
      if (out.length >= n) return out;
      if (!asked.has(q)) out.push({ kind: 'chapter', chapter: ch.id, q });
    }
  return out;
}

/**
 * Today's three: a follow-up on something you wrote (when the AI has one waiting), the next
 * question in your story, and an easy everyday one. Without a follow-up, two story questions.
 * Once the bank runs dry, skipped questions come back, then everyday ones fill in.
 */
export function pickThree(date: string, asked: Set<string>, follow: string | null, skipped: string[] = []): Pick[] {
  const picks: Pick[] = [];
  if (follow) picks.push({ kind: 'follow', chapter: null, q: follow });
  const want = follow ? 1 : 2;
  const story = nextChapterQs(asked, want);
  for (const q of skipped) if (story.length < want && !story.some((p) => p.q === q) && q !== follow) story.push({ kind: 'chapter', chapter: chapterOf(q)?.id ?? null, q });
  picks.push(...story);
  const fresh = EVERYDAY.filter((q) => !asked.has(q));
  const pool = fresh.length ? fresh : EVERYDAY;
  for (let i = 0; picks.length < 3 && i < pool.length; i++) {
    const q = pool[(hash(date) + i) % pool.length];
    if (!picks.some((p) => p.q === q)) picks.push({ kind: 'everyday', chapter: null, q });
  }
  return picks.slice(0, 3);
}

/** Days in a row with at least one answer. */
export const storyStreak = runEnding;

export const chapterOf = (q: string) => CHAPTERS.find((c) => c.qs.includes(q));

/** How far through each chapter you are — the "journey" strip. */
export function progress(rows: { q: string; a: string | null }[]) {
  const answered = new Set(rows.filter((r) => r.a?.trim()).map((r) => r.q));
  return CHAPTERS.map((c) => ({ id: c.id, title: c.title, emoji: c.emoji, blurb: c.blurb, done: c.qs.filter((q) => answered.has(q)).length, total: c.qs.length }));
}

export const FOLLOW_SYSTEM = `You help someone write about their own life, one question at a time. You get a question they answered and their answer, plus a few earlier answers for context.
Ask ONE short, warm follow-up question that invites them to go a little deeper into something specific they mentioned — a person, a place, a feeling, a turning point. Sound like a curious friend, not a therapist. Plain, everyday words. No preamble, no quotes, no advice.
If the answer is too short or there's nothing worth following up, reply with exactly: NONE`;

export function followPrompt(q: string, a: string, earlier: { q: string; a: string }[]) {
  return [
    earlier.length ? `Earlier answers:\n${earlier.map((e) => `Q: ${e.q}\nA: ${e.a}`).join('\n\n')}` : '',
    `Question: ${q}\nAnswer: ${a}`,
  ]
    .filter(Boolean)
    .join('\n\n');
}

/** A clean single question from the model, or null for NONE / junk. */
export function normaliseFollow(text: string) {
  const t = text.trim().replace(/^["“'`]+|["”'`]+$/g, '').split('\n')[0].trim();
  if (!t || /^none\b/i.test(t) || t.length < 8 || t.length > 220) return null;
  return t.endsWith('?') ? t : `${t}?`;
}

export const PORTRAIT_SYSTEM = `You're reading someone's own answers to questions about their life — childhood, family, school, college, work, friends, values, health, money, dreams. Write back to them, in second person ("you"), a warm and honest portrait of who they are, built only from what they wrote.
Markdown with these sections:
## Your story so far — a short narrative (6–10 sentences) of the journey, in order, naming real people, places and moments they mentioned.
## What drives you — 3–5 bullets: values, motivations, patterns you notice across answers (quote a phrase of theirs when it fits).
## Threads worth pulling — 2–3 things they hinted at but haven't explored (an unresolved feeling, a person, a dream), each as a gentle question.
Be specific, kind, never preachy or clinical, no diagnosis. Don't invent facts. Under ~400 words.`;

export function portraitPrompt(rows: { q: string; a: string; chapter: string | null; date: string }[]) {
  const by = new Map<string, string[]>();
  for (const r of rows) {
    const k = CHAPTERS.find((c) => c.id === r.chapter)?.title ?? (r.chapter ? r.chapter : 'Everyday & follow-ups');
    by.set(k, [...(by.get(k) ?? []), `(${r.date}) Q: ${r.q}\nA: ${r.a}`]);
  }
  return [...by].map(([k, v]) => `### ${k}\n${v.join('\n\n')}`).join('\n\n');
}
