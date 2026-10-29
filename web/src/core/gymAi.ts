// Prompts and validators for the gym's AI features: session planner, exercise form guides,
// machine-from-a-photo, describe-a-workout parsing, and the weekly debrief. The model only ever
// returns JSON that these normalisers check; anything malformed is dropped. Pure: no React, no I/O.

import { EXERCISES, type Muscle } from './exercises';
import { REGIONS, type Region } from './gymStats';

const str = (v: unknown, max = 200) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
const strs = (v: unknown, n = 8, max = 220) => (Array.isArray(v) ? v.map((x) => str(x, max)).filter((x): x is string => !!x).slice(0, n) : []);
const regions = (v: unknown) => (Array.isArray(v) ? [...new Set(v.filter((x): x is Region => REGIONS.includes(x as Region)))] : []);
const num = (v: unknown, lo: number, hi: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : null;
};
const byLower = new Map(EXERCISES.map((e) => [e.name.toLowerCase(), e.name]));
/** Snap a model-written name onto the library spelling so history and muscle maps line up. */
export const libraryName = (name: string) => byLower.get(name.trim().toLowerCase()) ?? name.trim();

const JSON_ONLY = 'Reply with ONLY one JSON object, no prose, no code fences.';
const VEG_SAFE = 'The lifter is a vegetarian software engineer in India training a 7-day Push › Pull › Legs › Rest › Upper › Lower › Rest split.';

// ---------------------------------------------------------------------------------------------
// Session planner
// ---------------------------------------------------------------------------------------------
export type PlanEx = { name: string; sets: number; reps: string; weight: number | null; rest_s: number; why: string | null };
export type GymPlan = { title: string; focus: Region[]; warmup: string[]; exercises: PlanEx[]; notes: string | null };

export const PLAN_SYSTEM = `You are an experienced strength coach planning ONE gym session. ${VEG_SAFE}
Use the history to progress sensibly (double progression: add reps within the range, then ~2.5 kg upper / 5 kg big lower lifts). Give a concrete working weight when history exists, else null.
Respect the time available, anything they say about pain, fatigue or a busy gym, and the week's volume (bring up muscles marked low, go easy on ones marked high).
Use exercise names EXACTLY from the library list. 4–7 exercises, compounds first. Rest 120–180 s for heavy compounds, 60–90 s for isolation.
${JSON_ONLY} Shape:
{"title":"Push · heavy bench focus","focus":["Chest","Shoulders","Triceps"],"warmup":["5 min bike","2 light bench sets 10/5"],"exercises":[{"name":"Barbell Bench Press","sets":4,"reps":"6-8","weight":62.5,"rest_s":150,"why":"Hit 8,8,7 at 60 last time — +2.5 kg"}],"notes":"one short line"}
"focus" uses only: ${REGIONS.join(', ')}.`;

export function normalisePlan(raw: unknown): GymPlan {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const exercises: PlanEx[] = [];
  for (const e of (Array.isArray(o.exercises) ? o.exercises : []).slice(0, 9) as Record<string, unknown>[]) {
    const name = str(e?.name, 60);
    if (!name) continue;
    const reps = str(e.reps, 12) ?? '8-12';
    exercises.push({ name: libraryName(name), sets: Math.round(num(e.sets, 1, 8) ?? 3), reps: /^\d+(\s*-\s*\d+)?$/.test(reps) ? reps.replace(/\s/g, '') : '8-12', weight: (num(e.weight, 0, 500) || null), rest_s: Math.round(num(e.rest_s, 30, 300) ?? 90), why: str(e.why, 240) });
  }
  return { title: str(o.title, 60) ?? 'Today’s session', focus: regions(o.focus), warmup: strs(o.warmup, 4, 80), exercises, notes: str(o.notes, 320) };
}

// ---------------------------------------------------------------------------------------------
// Form guide for one exercise
// ---------------------------------------------------------------------------------------------
export type Guide = { name: string; primary: Region[]; secondary: Region[]; setup: string[]; steps: string[]; cues: string[]; mistakes: string[]; breathing: string | null; easier: string | null; harder: string | null };

export const GUIDE_SYSTEM = `You write short, precise exercise technique guides for a gym app (like a good coach's notes, not an article). ${JSON_ONLY} Shape:
{"primary":["Chest"],"secondary":["Shoulders","Triceps"],"setup":["Eyes under the bar","Shoulder blades pinched and down"],"steps":["Unrack with straight arms","Lower to mid-chest in ~2 s","Press up and slightly back"],"cues":["Bend the bar","Feet drive into the floor"],"mistakes":["Flaring elbows to 90°","Bouncing off the chest"],"breathing":"Breathe in at the top, hold on the way down, out past the sticking point","easier":"Dumbbell Bench Press","harder":"Paused Bench Press"}
3–5 items per list, each under 12 words. Muscles only from: ${REGIONS.join(', ')}.`;

export function normaliseGuide(name: string, raw: unknown): Guide {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return { name, primary: regions(o.primary), secondary: regions(o.secondary), setup: strs(o.setup, 5, 100), steps: strs(o.steps, 6, 120), cues: strs(o.cues, 5, 100), mistakes: strs(o.mistakes, 5, 100), breathing: str(o.breathing, 160), easier: str(o.easier, 60), harder: str(o.harder, 60) };
}

/** Video search links (opens the YouTube app on a phone). Search, not a guessed video id. */
export const videoLinks = (name: string) => [
  { label: 'Form tutorial', url: `https://www.youtube.com/results?search_query=${encodeURIComponent(`${name} proper form tutorial`)}` },
  { label: 'Jeff Nippard', url: `https://www.youtube.com/results?search_query=${encodeURIComponent(`Jeff Nippard ${name} technique`)}` },
  { label: 'Shorts', url: `https://www.youtube.com/results?search_query=${encodeURIComponent(`${name} form #shorts`)}` },
];

// ---------------------------------------------------------------------------------------------
// Machine from a photo
// ---------------------------------------------------------------------------------------------
export type Machine = { machine: string; aka: string | null; primary: Region[]; secondary: Region[]; setup: string[]; steps: string[]; mistakes: string[]; safety: string | null; exercises: string[]; confidence: 'high' | 'medium' | 'low' };

export const MACHINE_SYSTEM = `You identify gym equipment from a photo and teach a beginner to use it safely. ${JSON_ONLY} Shape:
{"machine":"Seated Leg Curl","aka":"Hamstring curl machine","confidence":"high","primary":["Hamstrings"],"secondary":["Calves"],"setup":["Knee joint lines up with the machine's pivot","Ankle pad just above the heels","Thigh pad snug"],"steps":["Curl heels down and back","Squeeze 1 s","Return slowly over 2–3 s"],"mistakes":["Hips lifting off the seat","Swinging the weight"],"safety":"Start light; stop if the knee pinches","exercises":["Seated Leg Curl"]}
If it's free weights or a cable station, explain the most common exercises on it. "exercises" are names from this library when one fits: ${EXERCISES.filter((e) => ['Machine', 'Cable', 'Smith'].includes(e.equipment)).map((e) => e.name).join(', ')}. Muscles only from: ${REGIONS.join(', ')}. If it isn't gym equipment, set "machine" to "Not gym equipment" and leave lists empty.`;

export function normaliseMachine(raw: unknown): Machine {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const conf = o.confidence === 'high' || o.confidence === 'low' ? o.confidence : 'medium';
  return { machine: str(o.machine, 60) ?? 'Unknown equipment', aka: str(o.aka, 60), primary: regions(o.primary), secondary: regions(o.secondary), setup: strs(o.setup, 6, 120), steps: strs(o.steps, 6, 120), mistakes: strs(o.mistakes, 5, 120), safety: str(o.safety, 160), exercises: strs(o.exercises, 4, 60).map(libraryName), confidence: conf };
}

// ---------------------------------------------------------------------------------------------
// "Describe what you did" → sets
// ---------------------------------------------------------------------------------------------
export type Parsed = { day_type: 'push' | 'pull' | 'legs' | 'upper' | 'lower' | null; exercises: { name: string; sets: { weight: number; reps: number }[] }[] };

export const PARSE_SYSTEM = `You turn a lifter's quick description of a past workout into logged sets. ${JSON_ONLY} Shape:
{"day_type":"push","exercises":[{"name":"Barbell Bench Press","sets":[{"weight":60,"reps":8},{"weight":60,"reps":8},{"weight":60,"reps":7}]}]}
"60x8 x3" means 3 sets of 8 at 60 kg. "3x10 at 20" means 3 sets of 10 at 20 kg. Dumbbell weights are per hand as said. If weight isn't given use 0 and keep the reps; if sets/reps aren't given assume 3×10. Names EXACTLY from this library when one fits (else a clean name): ${EXERCISES.map((e) => e.name).join(', ')}.
"day_type" is push | pull | legs | upper | lower — whichever matches the exercises best, or null.`;

export function normaliseParsed(raw: unknown): Parsed {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const dt = ['push', 'pull', 'legs', 'upper', 'lower'].includes(o.day_type as string) ? (o.day_type as Parsed['day_type']) : null;
  const exercises: Parsed['exercises'] = [];
  for (const e of (Array.isArray(o.exercises) ? o.exercises : []).slice(0, 12) as Record<string, unknown>[]) {
    const name = str(e?.name, 60);
    if (!name) continue;
    const sets = (Array.isArray(e.sets) ? e.sets : []).slice(0, 10).map((s: Record<string, unknown>) => ({ weight: num(s?.weight, 0, 500) ?? 0, reps: Math.round(num(s?.reps, 0, 100) ?? 0) })).filter((s) => s.reps > 0);
    if (sets.length) exercises.push({ name: libraryName(name), sets });
  }
  return { day_type: dt, exercises };
}

// ---------------------------------------------------------------------------------------------
// Weekly debrief
// ---------------------------------------------------------------------------------------------
export type Debrief = { headline: string; good: string[]; improve: string[]; too_much: string[]; next_week: string[] };

export const DEBRIEF_SYSTEM = `You are the lifter's coach giving a short, honest weekly gym debrief from the numbers. ${VEG_SAFE} Be specific (name muscles, lifts, numbers), encouraging but direct, F1 race-engineer flavour welcome but light. ${JSON_ONLY} Shape:
{"headline":"Solid week — chest and back on target, legs light","good":["..."],"improve":["..."],"too_much":["..."],"next_week":["Add 4 sets of Romanian Deadlift on Legs day"]}
2–4 items per list (too_much may be empty), each under 20 words.`;

export function normaliseDebrief(raw: unknown): Debrief {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return { headline: str(o.headline, 140) ?? 'Week in review', good: strs(o.good, 4, 180), improve: strs(o.improve, 4, 180), too_much: strs(o.too_much, 3, 180), next_week: strs(o.next_week, 4, 180) };
}

export type { Muscle };
