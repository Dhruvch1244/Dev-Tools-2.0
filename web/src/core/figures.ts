// Drawn demos for moves the photo library doesn't have (wall slides, ankle rocks, burpees…): a
// stick figure as keyframe poses that the UI tweens in a loop. Coordinates live in a 120×80 box,
// floor at y = 72; "F" limbs are the near side, "B" the far side (drawn dimmer). Pure data.

export type Pt = [number, number];
export type Pose = {
  head: Pt; neck: Pt; hip: Pt;
  elbowF: Pt; handF: Pt; elbowB: Pt; handB: Pt;
  kneeF: Pt; footF: Pt; kneeB: Pt; footB: Pt;
  /** Toe tips; default a short foot pointing right (side views). */
  toeF?: Pt; toeB?: Pt;
};
export type Prop = { kind: 'line' | 'rect'; x: number; y: number; x2: number; y2: number };
export type Figure = { poses: Pose[]; secs: number; props?: Prop[]; cue: string; floor?: boolean };

const STAND: Pose = { head: [60, 14], neck: [60, 22], hip: [60, 44], elbowF: [60, 33], handF: [60, 44], elbowB: [60, 33], handB: [60, 44], kneeF: [60, 58], footF: [60, 72], kneeB: [60, 58], footB: [60, 72] };
const pose = (base: Pose, p: Partial<Pose>): Pose => ({ ...base, ...p });
/** Both arms / both legs the same (side views). */
const arms = (elbow: Pt, hand: Pt) => ({ elbowF: elbow, handF: hand, elbowB: [elbow[0] - 2, elbow[1]] as Pt, handB: [hand[0] - 2, hand[1]] as Pt });
const legs = (knee: Pt, foot: Pt) => ({ kneeF: knee, footF: foot, kneeB: [knee[0] - 2, knee[1]] as Pt, footB: [foot[0] - 2, foot[1]] as Pt });

const PLANK = pose(STAND, { head: [96, 48], neck: [88, 53], hip: [55, 60], ...arms([89, 62], [90, 72]), ...legs([38, 66], [20, 72]) });
const SQUAT = pose(STAND, { head: [72, 33], neck: [66, 40], hip: [54, 58], ...arms([68, 56], [72, 72]), ...legs([70, 60], [60, 72]) });
const FRONT_LEGS = { kneeF: [55, 59] as Pt, footF: [54, 72] as Pt, kneeB: [65, 59] as Pt, footB: [66, 72] as Pt, toeF: [50, 72] as Pt, toeB: [70, 72] as Pt };

export const FIGURES: Record<string, Figure> = {
  'Wall slides': {
    secs: 3,
    cue: 'Back, head and forearms stay on the wall; slide from a W up to a Y',
    poses: [
      pose(STAND, { head: [60, 15], neck: [60, 24], hip: [60, 46], elbowF: [46, 28], handF: [44, 16], elbowB: [74, 28], handB: [76, 16], ...FRONT_LEGS }),
      pose(STAND, { head: [60, 15], neck: [60, 24], hip: [60, 46], elbowF: [50, 12], handF: [45, 3], elbowB: [70, 12], handB: [75, 3], ...FRONT_LEGS }),
    ],
  },
  'Scap push-ups': {
    secs: 2,
    cue: 'Arms stay straight — only the shoulder blades squeeze together, then push apart',
    poses: [pose(PLANK, { neck: [88, 56], head: [96, 52] }), pose(PLANK, { neck: [88, 49], head: [96, 45], hip: [55, 58] })],
  },
  'Thread the needle': {
    secs: 3.2,
    cue: 'On all fours: reach up to the ceiling, then thread the arm under and rest the shoulder down',
    poses: [
      pose(STAND, { head: [87, 42], neck: [78, 47], hip: [40, 50], elbowF: [80, 34], handF: [82, 22], elbowB: [78, 60], handB: [78, 72], kneeF: [42, 72], footF: [24, 72], kneeB: [40, 72], footB: [22, 72] }),
      pose(STAND, { head: [84, 56], neck: [76, 54], hip: [40, 50], elbowF: [68, 64], handF: [54, 69], elbowB: [78, 62], handB: [78, 72], kneeF: [42, 72], footF: [24, 72], kneeB: [40, 72], footB: [22, 72] }),
    ],
  },
  'Ankle rocks': {
    secs: 2.4,
    cue: 'Half-kneeling: drive the front knee forward past the toes, heel stays down',
    poses: [
      pose(STAND, { head: [47, 19], neck: [46, 28], hip: [44, 52], elbowF: [58, 40], handF: [70, 54], elbowB: [56, 40], handB: [68, 54], kneeF: [70, 54], footF: [70, 72], toeF: [78, 72], kneeB: [42, 72], footB: [24, 72], toeB: [22, 70] }),
      pose(STAND, { head: [53, 20], neck: [52, 29], hip: [50, 53], elbowF: [66, 42], handF: [80, 56], elbowB: [64, 42], handB: [78, 56], kneeF: [82, 57], footF: [70, 72], toeF: [78, 72], kneeB: [44, 72], footB: [24, 72], toeB: [22, 70] }),
    ],
  },
  '90/90 hip switches': {
    secs: 3.6,
    cue: 'Sit tall, feet wide; let both knees drop to one side, then sweep them over to the other',
    poses: [
      pose(STAND, { head: [60, 31], neck: [60, 40], hip: [60, 64], elbowF: [50, 54], handF: [46, 68], elbowB: [70, 54], handB: [74, 68], kneeF: [36, 64], footF: [42, 72], kneeB: [56, 66], footB: [78, 72], toeF: [42, 72], toeB: [78, 72] }),
      pose(STAND, { head: [60, 31], neck: [60, 40], hip: [60, 64], elbowF: [50, 54], handF: [46, 68], elbowB: [70, 54], handB: [74, 68], kneeF: [48, 50], footF: [42, 72], kneeB: [72, 50], footB: [78, 72], toeF: [42, 72], toeB: [78, 72] }),
      pose(STAND, { head: [60, 31], neck: [60, 40], hip: [60, 64], elbowF: [50, 54], handF: [46, 68], elbowB: [70, 54], handB: [74, 68], kneeF: [64, 66], footF: [42, 72], kneeB: [84, 64], footB: [78, 72], toeF: [42, 72], toeB: [78, 72] }),
      pose(STAND, { head: [60, 31], neck: [60, 40], hip: [60, 64], elbowF: [50, 54], handF: [46, 68], elbowB: [70, 54], handB: [74, 68], kneeF: [48, 50], footF: [42, 72], kneeB: [72, 50], footB: [78, 72], toeF: [42, 72], toeB: [78, 72] }),
    ],
  },
  'Thoracic open books': {
    secs: 4,
    cue: 'Seen from above: lie on your side, knees bent in front; sweep the top arm over to the other side and let your eyes follow it',
    floor: false,
    poses: [
      pose(STAND, { head: [24, 44], neck: [32, 44], hip: [60, 44], elbowB: [32, 55], handB: [32, 66], elbowF: [34, 55], handF: [34, 66], kneeF: [61, 62], footF: [80, 62], kneeB: [63, 63], footB: [82, 63], toeF: [84, 62], toeB: [86, 63] }),
      pose(STAND, { head: [23, 42], neck: [32, 44], hip: [60, 44], elbowB: [32, 55], handB: [32, 66], elbowF: [34, 33], handF: [34, 22], kneeF: [61, 62], footF: [80, 62], kneeB: [63, 63], footB: [82, 63], toeF: [84, 62], toeB: [86, 63] }),
    ],
  },
  'Hollow Hold': {
    secs: 2,
    cue: 'Low back pressed into the floor; shoulders and legs hover just off it',
    poses: [
      pose(STAND, { head: [88, 58], neck: [80, 63], hip: [58, 67], ...arms([92, 58], [104, 55]), ...legs([40, 66], [22, 62]), toeF: [20, 58], toeB: [18, 58] }),
      pose(STAND, { head: [88, 56], neck: [80, 61], hip: [58, 67], ...arms([92, 56], [104, 53]), ...legs([40, 65], [22, 60]), toeF: [20, 56], toeB: [18, 56] }),
    ],
  },
  'Dragon Flag': {
    secs: 3.6,
    cue: 'Grip behind your head; body stays one straight line as you lower it slowly',
    props: [{ kind: 'rect', x: 30, y: 60, x2: 104, y2: 64 }],
    poses: [
      pose(STAND, { head: [94, 55], neck: [86, 58], hip: [82, 32], ...arms([96, 48], [101, 58]), ...legs([80, 19], [79, 6]), toeF: [79, 2], toeB: [77, 2] }),
      pose(STAND, { head: [94, 55], neck: [86, 58], hip: [64, 52], ...arms([96, 48], [101, 58]), ...legs([46, 48], [28, 44]), toeF: [24, 42], toeB: [22, 42] }),
    ],
  },
  'L-Sit': {
    secs: 2,
    cue: 'Push the floor away, shoulders down; legs straight out and locked',
    props: [{ kind: 'rect', x: 50, y: 56, x2: 62, y2: 60 }],
    poses: [
      pose(STAND, { head: [58, 17], neck: [58, 26], hip: [58, 48], ...arms([57, 37], [56, 56]), ...legs([76, 48], [94, 48]), toeF: [98, 45], toeB: [96, 45] }),
      pose(STAND, { head: [58, 16], neck: [58, 25], hip: [58, 47], ...arms([57, 36], [56, 56]), ...legs([76, 46], [94, 45]), toeF: [98, 42], toeB: [96, 42] }),
    ],
  },
  Burpee: {
    secs: 4,
    cue: 'Squat, hands down, jump back to a plank, jump in, jump up',
    poses: [STAND, SQUAT, PLANK, SQUAT, pose(STAND, { head: [60, 8], neck: [60, 16], hip: [60, 38], elbowF: [63, 8], handF: [65, 1], elbowB: [57, 8], handB: [55, 1], kneeF: [60, 52], footF: [60, 66], kneeB: [60, 52], footB: [60, 66] })],
  },
  'Wall Sit': {
    secs: 3,
    cue: 'Back flat on the wall, thighs level with the floor, knees over ankles — hold',
    props: [{ kind: 'line', x: 40, y: 0, x2: 40, y2: 72 }],
    poses: [
      pose(STAND, { head: [44, 17], neck: [44, 26], hip: [44, 52], ...arms([52, 36], [58, 31]), ...legs([68, 52], [68, 72]) }),
      pose(STAND, { head: [44, 16], neck: [44, 25], hip: [44, 52], ...arms([52, 35], [58, 30]), ...legs([68, 52], [68, 72]) }),
    ],
  },
  'Tibialis Raise': {
    secs: 1.8,
    cue: 'Lean back on a wall, heels out in front; pull your toes up hard, lower slowly',
    props: [{ kind: 'line', x: 40, y: 0, x2: 40, y2: 72 }],
    poses: [
      pose(STAND, { head: [44, 15], neck: [44, 24], hip: [48, 46], ...arms([48, 35], [50, 46]), ...legs([60, 59], [72, 72]), toeF: [80, 72], toeB: [78, 72] }),
      pose(STAND, { head: [44, 15], neck: [44, 24], hip: [48, 46], ...arms([48, 35], [50, 46]), ...legs([60, 59], [72, 72]), toeF: [78, 64], toeB: [76, 64] }),
    ],
  },
};

/** Drills drawn as the box-breathing guide instead of a figure. */
export const isBreathing = (name: string) => /box breathing/i.test(name);

const key = (s: string) => s.toLowerCase().trim();
const BY = new Map(Object.entries(FIGURES).map(([k, v]) => [key(k), v]));
export const figureFor = (name: string) => BY.get(key(name)) ?? null;

/** Default toes for a pose (a short foot pointing right). */
export const toes = (p: Pose): { toeF: Pt; toeB: Pt } => ({ toeF: p.toeF ?? [p.footF[0] + 6, p.footF[1]], toeB: p.toeB ?? [p.footB[0] + 6, p.footB[1]] });

/** The box the figure (and its props) moves within, padded — so small thumbnails zoom in on the body. */
export function frameOf(f: Figure): [number, number, number, number] {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const p of f.poses) for (const [x, y] of Object.values({ ...p, ...toes(p) })) (xs.push(x), ys.push(y));
  for (const p of f.props ?? []) (xs.push(p.x, p.x2), ys.push(p.y, p.y2));
  if (f.floor !== false) ys.push(73);
  const pad = 7;
  let [x0, y0, x1, y1] = [Math.min(...xs) - pad, Math.min(...ys) - pad, Math.max(...xs) + pad, Math.max(...ys) + pad];
  // Keep a 3:2 frame so it fills the card the same way the photos do.
  const w = x1 - x0;
  const h = y1 - y0;
  if (w / h < 1.5) (x0 -= (h * 1.5 - w) / 2, x1 = x0 + h * 1.5);
  else (y0 -= (w / 1.5 - h) / 2, y1 = y0 + w / 1.5);
  return [x0, y0, x1 - x0, y1 - y0];
}
