// Before and after every session: a warm-up built for the day (raise → mobilise → activate →
// ramp-up sets on the first lift) and a cool-down of static stretches for what you trained. Rest
// days get a mobility flow. Pure: no React, no I/O.

import type { DayType, Exercise } from './gym';

export type Drill = { name: string; dose: string; cue: string; secs?: number };
export type Phase = { id: string; title: string; why: string; drills: Drill[] };

const RAISE: Phase = {
  id: 'raise',
  title: 'Raise',
  why: 'Warm the engine: heart rate up, body temperature up',
  drills: [{ name: 'Incline walk, cycle or rower', dose: '5 min easy', cue: 'Breathing harder, still able to talk', secs: 300 }],
};

const MOBILISE: Record<Exclude<DayType, 'rest'>, Drill[]> = {
  push: [
    { name: 'Arm circles', dose: '10 forward + 10 back', cue: 'Big, slow circles, ribs down' },
    { name: 'Band pull-aparts', dose: '2 × 15', cue: 'Squeeze shoulder blades, no shrug' },
    { name: 'Thoracic open books', dose: '8 each side', cue: 'Follow your hand with your eyes' },
    { name: 'Wall slides', dose: '10', cue: 'Forearms on the wall, slide up without arching' },
  ],
  pull: [
    { name: 'Cat–cow', dose: '10 slow', cue: 'Move one vertebra at a time' },
    { name: 'Band dislocates', dose: '10', cue: 'Wide grip, straight arms, over and back' },
    { name: 'Thread the needle', dose: '6 each side', cue: 'Reach through and rotate the upper back' },
    { name: 'Dead hang', dose: '2 × 20 s', cue: 'Relax into the shoulders, breathe', secs: 20 },
  ],
  legs: [
    { name: 'Leg swings', dose: '10 front–back + 10 side each leg', cue: 'Hold something, let the hip swing loose' },
    { name: 'World’s greatest stretch', dose: '5 each side', cue: 'Lunge, elbow to instep, rotate and reach' },
    { name: 'Deep squat hold (goblet)', dose: '2 × 30 s', cue: 'Elbows push knees out, chest tall', secs: 30 },
    { name: 'Ankle rocks', dose: '10 each side', cue: 'Knee over toes, heel stays down' },
  ],
  upper: [
    { name: 'Arm circles', dose: '10 forward + 10 back', cue: 'Big, slow circles' },
    { name: 'Band pull-aparts', dose: '2 × 15', cue: 'Squeeze shoulder blades, no shrug' },
    { name: 'Cat–cow', dose: '10 slow', cue: 'Move one vertebra at a time' },
    { name: 'Thoracic open books', dose: '8 each side', cue: 'Follow your hand with your eyes' },
  ],
  lower: [
    { name: 'Leg swings', dose: '10 front–back + 10 side each leg', cue: 'Let the hip swing loose' },
    { name: '90/90 hip switches', dose: '8 each side', cue: 'Sit tall, rotate the knees side to side' },
    { name: 'Hip hinge with dowel', dose: '10', cue: 'Head, upper back and tailbone stay on the stick' },
    { name: 'Ankle rocks', dose: '10 each side', cue: 'Knee over toes, heel stays down' },
  ],
};

const ACTIVATE: Record<Exclude<DayType, 'rest'>, Drill[]> = {
  push: [
    { name: 'Scap push-ups', dose: '12', cue: 'Arms straight, only the shoulder blades move' },
    { name: 'Band external rotations', dose: '12 each side', cue: 'Elbow pinned to your side' },
  ],
  pull: [
    { name: 'Scap pull-ups', dose: '10', cue: 'Hang, pull shoulders down without bending elbows' },
    { name: 'Face pulls (light)', dose: '15', cue: 'Pull to the eyes, thumbs back' },
  ],
  legs: [
    { name: 'Glute bridges', dose: '15', cue: 'Ribs down, squeeze at the top for 1 s' },
    { name: 'Lateral band walks', dose: '10 steps each way', cue: 'Toes forward, push knees out' },
  ],
  upper: [
    { name: 'Scap push-ups', dose: '12', cue: 'Only the shoulder blades move' },
    { name: 'Face pulls (light)', dose: '15', cue: 'Pull to the eyes, thumbs back' },
  ],
  lower: [
    { name: 'Glute bridges', dose: '15', cue: 'Squeeze at the top for 1 s' },
    { name: 'Dead bugs', dose: '8 each side', cue: 'Low back glued to the floor' },
  ],
};

/** Static stretches for what was trained — hold, breathe, don't bounce. */
const STRETCH: Record<string, Drill> = {
  chest: { name: 'Doorway chest stretch', dose: '30 s each side', cue: 'Elbow at shoulder height, step through', secs: 30 },
  shoulders: { name: 'Cross-body shoulder stretch', dose: '30 s each side', cue: 'Pull the arm across, shoulder down', secs: 30 },
  triceps: { name: 'Overhead triceps stretch', dose: '30 s each side', cue: 'Elbow up, hand down the spine', secs: 30 },
  lats: { name: 'Child’s pose, hands walked to one side', dose: '30 s each side', cue: 'Sink the hips back', secs: 30 },
  back: { name: 'Seated twist', dose: '30 s each side', cue: 'Sit tall, rotate from the upper back', secs: 30 },
  biceps: { name: 'Wall biceps stretch', dose: '30 s each side', cue: 'Palm on the wall, turn away slowly', secs: 30 },
  quads: { name: 'Couch stretch', dose: '45 s each side', cue: 'Back knee against the wall, squeeze the glute', secs: 45 },
  hamstrings: { name: 'Standing hamstring stretch', dose: '30 s each side', cue: 'Hinge with a flat back, toes up', secs: 30 },
  glutes: { name: 'Figure-4 stretch', dose: '30 s each side', cue: 'Ankle over knee, pull the leg in', secs: 30 },
  hips: { name: 'Half-kneeling hip flexor stretch', dose: '30 s each side', cue: 'Tuck the pelvis, lean forward a little', secs: 30 },
  calves: { name: 'Wall calf stretch', dose: '30 s each side', cue: 'Back heel down, knee straight', secs: 30 },
  breathe: { name: 'Box breathing, lying down', dose: '1 min', cue: 'In 4 · hold 4 · out 4 · hold 4 — heart rate down', secs: 60 },
};
const COOL: Record<Exclude<DayType, 'rest'>, string[]> = {
  push: ['chest', 'shoulders', 'triceps', 'breathe'],
  pull: ['lats', 'back', 'biceps', 'breathe'],
  legs: ['quads', 'hamstrings', 'glutes', 'calves', 'breathe'],
  upper: ['chest', 'lats', 'shoulders', 'breathe'],
  lower: ['hips', 'hamstrings', 'glutes', 'quads', 'breathe'],
};

/** Rest-day mobility flow (~12 min): the joints a desk job and lifting both stiffen. */
const MOBILITY: Phase[] = [
  { ...RAISE, drills: [{ name: 'Easy walk', dose: '10 min', cue: 'Outside if you can — sunlight helps sleep', secs: 600 }] },
  {
    id: 'flow',
    title: 'Mobility flow',
    why: 'Undo the desk: hips, upper back, shoulders, ankles',
    drills: [
      { name: 'Cat–cow', dose: '10 slow', cue: 'One vertebra at a time' },
      { name: 'World’s greatest stretch', dose: '5 each side', cue: 'Lunge, elbow to instep, rotate and reach' },
      { name: '90/90 hip switches', dose: '8 each side', cue: 'Sit tall, rotate the knees side to side' },
      { name: 'Thoracic open books', dose: '8 each side', cue: 'Follow your hand with your eyes' },
      { name: 'Deep squat hold', dose: '2 × 30 s', cue: 'Heels down, hold onto something if needed', secs: 30 },
      { name: 'Couch stretch', dose: '45 s each side', cue: 'Squeeze the glute of the back leg', secs: 45 },
      { name: 'Dead hang', dose: '2 × 20 s', cue: 'Let the shoulders open up', secs: 20 },
      { name: 'Box breathing', dose: '2 min', cue: 'In 4 · hold 4 · out 4 · hold 4', secs: 120 },
    ],
  },
];

/** Ramp-up sets for the first lift, as percentages of the working weight (or a guide when unknown). */
export function rampSets(first: Exercise | undefined, working: number | null): Drill[] {
  if (!first) return [];
  if (!working || working < 20)
    return [{ name: `${first.name}: 2 ramp-up sets`, dose: 'light × 10, then medium × 5', cue: 'Same form as the work sets, stop well short of tired' }];
  const r = (p: number) => Math.max(20, Math.round((working * p) / 2.5) * 2.5);
  return [
    { name: first.name, dose: `${r(0.4)} kg × 10`, cue: 'Ramp-up 1 — groove the movement' },
    { name: first.name, dose: `${r(0.6)} kg × 5`, cue: 'Ramp-up 2 — move it fast' },
    { name: first.name, dose: `${r(0.8)} kg × 2`, cue: 'Ramp-up 3 — then your first work set' },
  ];
}

/** Everything before a session on this day type. `working` = last working weight on the first lift. */
export function warmupFor(type: DayType, first?: Exercise, working: number | null = null): Phase[] {
  if (type === 'rest') return MOBILITY;
  return [
    RAISE,
    { id: 'mobilise', title: 'Mobilise', why: 'Open up the joints you’re about to load', drills: MOBILISE[type] },
    { id: 'activate', title: 'Activate', why: 'Wake up the small muscles that keep you safe', drills: ACTIVATE[type] },
    ...(first ? [{ id: 'ramp', title: 'Ramp-up sets', why: 'Build to the working weight — never start cold', drills: rampSets(first, working) }] : []),
  ];
}

/** The cool-down after a session on this day type. */
export function cooldownFor(type: DayType): Phase {
  if (type === 'rest') return MOBILITY[1];
  return { id: 'cool', title: 'Cool-down stretches', why: 'Hold each one, breathe slowly — no bouncing', drills: [{ name: 'Easy walk', dose: '3 min', cue: 'Let the heart rate settle', secs: 180 }, ...COOL[type].map((k) => STRETCH[k])] };
}

/** Rough minutes for a set of phases (drills without a timer count as 1 min). */
export const minutesOf = (phases: Phase[]) => Math.round(phases.flatMap((p) => p.drills).reduce((a, d) => a + (d.secs ? (d.dose.includes('each side') ? 2 : 1) * d.secs : 60), 0) / 60);
