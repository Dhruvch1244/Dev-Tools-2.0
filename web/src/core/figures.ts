// Drawn demos for moves the photo library doesn't have (wall slides, ankle rocks, burpees…).
// A real 2D skeleton: fixed bone lengths, limbs posed by joint angles or reaching for a point
// (two-bone IK, so a planted foot or hand stays put while the body moves), a spine that can round.
// Keyframes tween angles and targets — never raw points — so limbs never stretch. Pure: no React.
//
// Angles are degrees in screen space: 0 = straight down, 90 = forward (right), 180 = up, -90 = back.
// The box is 120×80 with the floor at y = 72. "F" limbs are the near side, "B" the far side.

export type Pt = [number, number];
type Limb = [number, number] | { to: Pt; bend: 1 | -1 };
export type Pose = {
  hip: Pt;
  torso: number;
  torsoLen?: number;
  /** Upper-back curve: + rounds it (towards the back), − arches. */
  spine?: number;
  head?: number;
  armF: Limb; armB: Limb; legF: Limb; legB: Limb;
  footF?: number; footB?: number;
  /** Shown while this pose is held / being moved to. */
  label?: string;
};
export type Key = { pose: Pose; hold?: number; move?: number };
export type Prop = { kind: 'line' | 'rect'; x: number; y: number; x2: number; y2: number };
export type Figure = { view: 'side' | 'front'; keys: Key[]; cue: string; props?: Prop[]; floor?: boolean; ghost?: boolean };

export const BONES = { torso: 20, upperArm: 11, foreArm: 10, thigh: 15, shin: 14, foot: 5, head: 7.5, headR: 4.6 };
const rad = (d: number) => (d * Math.PI) / 180;
const dir = (a: number): Pt => [Math.sin(rad(a)), Math.cos(rad(a))];
const add = (p: Pt, v: Pt, k = 1): Pt => [p[0] + v[0] * k, p[1] + v[1] * k];

/** Two-bone chain from `root`: by angles, or reaching for a target (clamped straight when out of reach). */
export function solveLimb(root: Pt, limb: Limb, l1: number, l2: number): { mid: Pt; end: Pt } {
  if (Array.isArray(limb)) {
    const mid = add(root, dir(limb[0]), l1);
    return { mid, end: add(mid, dir(limb[1]), l2) };
  }
  const dx = limb.to[0] - root[0];
  const dy = limb.to[1] - root[1];
  const d = Math.min(Math.max(Math.hypot(dx, dy), Math.abs(l1 - l2) + 0.01), l1 + l2 - 0.001);
  const base = Math.atan2(dy, dx);
  const a = Math.acos((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d));
  const mid: Pt = [root[0] + l1 * Math.cos(base + limb.bend * a), root[1] + l1 * Math.sin(base + limb.bend * a)];
  return { mid, end: [root[0] + d * Math.cos(base), root[1] + d * Math.sin(base)] };
}

export type Joints = {
  hip: Pt; shoulder: Pt; spineCtl: Pt; head: Pt; neck: Pt;
  shoulderF: Pt; shoulderB: Pt; hipF: Pt; hipB: Pt;
  elbowF: Pt; handF: Pt; elbowB: Pt; handB: Pt;
  kneeF: Pt; ankleF: Pt; toeF: Pt; kneeB: Pt; ankleB: Pt; toeB: Pt;
};

export function joints(p: Pose, view: Figure['view']): Joints {
  const len = p.torsoLen ?? BONES.torso;
  const t = dir(p.torso);
  const shoulder = add(p.hip, t, len);
  // Spine bulge: perpendicular to the torso, towards the back.
  const perp: Pt = [t[1], -t[0]];
  const spineCtl = add(add(p.hip, t, len * 0.55), perp, p.spine ?? 0);
  const h = dir(p.head ?? p.torso);
  // Front view: shoulders and hips side by side; side view: the far limbs sit just behind.
  const across: Pt = view === 'front' ? [-t[1] * 6, t[0] * 6] : [-0.8, -0.3];
  const acrossHip: Pt = view === 'front' ? [-t[1] * 3.6, t[0] * 3.6] : [-0.8, -0.3];
  // Front view: F is the figure's side on the right of the picture, B the left.
  const shoulderF = view === 'front' ? add(shoulder, across, 1) : shoulder;
  const shoulderB = view === 'front' ? add(shoulder, across, -1) : add(shoulder, across, 1);
  const hipF = view === 'front' ? add(p.hip, acrossHip, 1) : p.hip;
  const hipB = view === 'front' ? add(p.hip, acrossHip, -1) : add(p.hip, acrossHip, 1);
  const aF = solveLimb(shoulderF, p.armF, BONES.upperArm, BONES.foreArm);
  const aB = solveLimb(shoulderB, p.armB, BONES.upperArm, BONES.foreArm);
  const lF = solveLimb(hipF, p.legF, BONES.thigh, BONES.shin);
  const lB = solveLimb(hipB, p.legB, BONES.thigh, BONES.shin);
  return {
    hip: p.hip, shoulder, spineCtl, neck: add(shoulder, h, 2.6), head: add(shoulder, h, BONES.head),
    shoulderF, shoulderB, hipF, hipB,
    elbowF: aF.mid, handF: aF.end, elbowB: aB.mid, handB: aB.end,
    kneeF: lF.mid, ankleF: lF.end, toeF: add(lF.end, dir(p.footF ?? (view === 'front' ? 60 : 90)), BONES.foot),
    kneeB: lB.mid, ankleB: lB.end, toeB: add(lB.end, dir(p.footB ?? (view === 'front' ? -60 : 90)), BONES.foot),
  };
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerpPt = (a: Pt, b: Pt, t: number): Pt => [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];
const lerpLimb = (a: Limb, b: Limb, t: number): Limb =>
  Array.isArray(a) && Array.isArray(b) ? [lerp(a[0], b[0], t), lerp(a[1], b[1], t)] : !Array.isArray(a) && !Array.isArray(b) ? { to: lerpPt(a.to, b.to, t), bend: a.bend } : t < 0.5 ? a : b;

export function tween(a: Pose, b: Pose, t: number): Pose {
  return {
    hip: lerpPt(a.hip, b.hip, t),
    torso: lerp(a.torso, b.torso, t),
    torsoLen: lerp(a.torsoLen ?? BONES.torso, b.torsoLen ?? BONES.torso, t),
    spine: lerp(a.spine ?? 0, b.spine ?? 0, t),
    head: lerp(a.head ?? a.torso, b.head ?? b.torso, t),
    armF: lerpLimb(a.armF, b.armF, t), armB: lerpLimb(a.armB, b.armB, t),
    legF: lerpLimb(a.legF, b.legF, t), legB: lerpLimb(a.legB, b.legB, t),
    footF: a.footF != null || b.footF != null ? lerp(a.footF ?? 90, b.footF ?? 90, t) : undefined,
    footB: a.footB != null || b.footB != null ? lerp(a.footB ?? 90, b.footB ?? 90, t) : undefined,
    label: t < 0.5 ? a.label : b.label,
  };
}

const ease = (t: number) => 0.5 - Math.cos(Math.PI * t) / 2;
const DEFAULT_HOLD = 0.5;
const DEFAULT_MOVE = 1.2;
export const cycleOf = (f: Figure) => f.keys.reduce((s, k) => s + (k.hold ?? DEFAULT_HOLD) + (k.move ?? DEFAULT_MOVE), 0);

/** The pose `secs` into the loop: hold each key, then ease to the next. */
export function poseAt(f: Figure, secs: number): Pose {
  let t = secs % cycleOf(f);
  for (let i = 0; i < f.keys.length; i++) {
    const k = f.keys[i];
    const hold = k.hold ?? DEFAULT_HOLD;
    const move = k.move ?? DEFAULT_MOVE;
    if (t < hold) return k.pose;
    t -= hold;
    if (t < move) return tween(k.pose, f.keys[(i + 1) % f.keys.length].pose, ease(t / move));
    t -= move;
  }
  return f.keys[0].pose;
}

/** The box the figure moves within (sampled through the loop), padded to 3:2 so thumbnails zoom in on the body. */
export function frameOf(f: Figure): [number, number, number, number] {
  const xs: number[] = [];
  const ys: number[] = [];
  const total = cycleOf(f);
  for (let s = 0; s < total; s += total / 40) {
    const j = joints(poseAt(f, s), f.view);
    for (const [x, y] of Object.values(j)) (xs.push(x), ys.push(y));
    ys.push(j.head[1] - BONES.headR);
  }
  for (const p of f.props ?? []) (xs.push(p.x, p.x2), ys.push(p.y, p.y2));
  if (f.floor !== false) ys.push(73);
  const pad = 6;
  let [x0, y0, x1, y1] = [Math.min(...xs) - pad, Math.min(...ys) - pad, Math.max(...xs) + pad, Math.max(...ys) + pad];
  // Never zoom in past a ~body-and-a-half wide frame, or the limbs turn into slabs.
  const MIN_W = 84;
  if (x1 - x0 < MIN_W) (x0 -= (MIN_W - (x1 - x0)) / 2, x1 = x0 + MIN_W);
  const w = x1 - x0;
  const h = y1 - y0;
  if (w / h < 1.5) (x0 -= (h * 1.5 - w) / 2, x1 = x0 + h * 1.5);
  else (y0 -= (w / 1.5 - h) / 2, y1 = y0 + w / 1.5);
  return [x0, y0, x1 - x0, y1 - y0];
}

// ---- The moves ----

const STAND: Pose = { hip: [60, 43], torso: 180, armF: { to: [61, 64], bend: -1 }, armB: { to: [60, 64], bend: -1 }, legF: { to: [61, 71], bend: -1 }, legB: { to: [59, 71], bend: -1 } };
const SQUAT: Pose = { hip: [52, 62], torso: 125, head: 115, armF: { to: [73, 71], bend: 1 }, armB: { to: [71, 71], bend: 1 }, legF: { to: [61, 71], bend: -1 }, legB: { to: [59, 71], bend: -1 } };
const PLANK: Pose = { hip: [53.5, 57.5], torso: 112, armF: { to: [73, 71.5], bend: 1 }, armB: { to: [71, 71.5], bend: 1 }, legF: { to: [25, 70], bend: -1 }, legB: { to: [23, 70], bend: -1 }, footF: 35, footB: 35 };
const JUMP: Pose = { hip: [60, 35], torso: 180, armF: { to: [63, -2], bend: 1 }, armB: { to: [61, -2], bend: 1 }, legF: { to: [61, 66], bend: -1 }, legB: { to: [59, 66], bend: -1 }, footF: 30, footB: 30 };

export const FIGURES: Record<string, Figure> = {
  'Wall slides': {
    view: 'front',
    ghost: true,
    cue: 'Back, head and forearms stay on the wall; slide from a W up to a Y, then pull back down',
    keys: [
      { pose: { hip: [60, 43], torso: 180, armF: [72, 172], armB: [-72, -172], legF: [3, 0], legB: [-3, 0], label: 'W — elbows down' }, hold: 0.6, move: 1.6 },
      { pose: { hip: [60, 43], torso: 180, armF: [152, 165], armB: [-152, -165], legF: [3, 0], legB: [-3, 0], label: 'Y — slide up' }, hold: 0.5, move: 1.6 },
    ],
  },
  'Scap push-ups': {
    view: 'side',
    ghost: true,
    cue: 'Arms stay straight the whole time — only the shoulder blades move: let the chest sink, then push the floor away',
    keys: [
      { pose: { ...PLANK, spine: -2.5, head: 108, label: 'Blades together' }, hold: 0.4, move: 1 },
      { pose: { ...PLANK, spine: 3.5, head: 104, label: 'Push the floor away' }, hold: 0.5, move: 1 },
    ],
  },
  'Thread the needle': {
    view: 'side',
    cue: 'On all fours: reach up to the ceiling, then thread the arm under your body and let that shoulder sink',
    keys: [
      { pose: { hip: [45, 57], torso: 107, head: 150, armF: [180, 180], armB: { to: [64, 71.5], bend: 1 }, legF: [0, -90], legB: [-2, -90], footF: -95, footB: -95, label: 'Open up' }, hold: 0.6, move: 1.6 },
      { pose: { hip: [45, 57], torso: 99, head: 25, armF: [-40, -75], armB: { to: [64, 71.5], bend: 1 }, legF: [0, -90], legB: [-2, -90], footF: -95, footB: -95, label: 'Thread under' }, hold: 0.8, move: 1.6 },
    ],
  },
  'Ankle rocks': {
    view: 'side',
    ghost: true,
    cue: 'Half-kneeling: rock the front knee forward past your toes, heel glued down, then back',
    keys: [
      { pose: { hip: [52, 57], torso: 180, armF: { to: [66, 56], bend: 1 }, armB: { to: [65, 57], bend: 1 }, legF: { to: [67, 71], bend: -1 }, legB: [0, -90], footB: -100, label: 'Knee over ankle' }, hold: 0.4, move: 1.1 },
      { pose: { hip: [57, 57.5], torso: 175, armF: { to: [73, 60], bend: 1 }, armB: { to: [72, 61], bend: 1 }, legF: { to: [67, 71], bend: -1 }, legB: [-20, -90], footB: -100, label: 'Knee past toes' }, hold: 0.6, move: 1.1 },
    ],
  },
  'Hollow Hold': {
    view: 'side',
    ghost: true,
    cue: 'Lower back pressed into the floor; shoulders and legs hover just off it — hold and breathe',
    keys: [
      { pose: { hip: [56, 68.5], torso: 99, head: 105, armF: [100, 102], armB: [98, 100], legF: [-99, -97], legB: [-97, -95], footF: -80, footB: -80, label: 'Hold' }, hold: 1.2, move: 1.4 },
      { pose: { hip: [56, 68.5], torso: 95, head: 100, armF: [96, 97], armB: [94, 95], legF: [-95, -94], legB: [-93, -92], footF: -80, footB: -80, label: 'Breathe' }, hold: 0.8, move: 1.4 },
    ],
  },
  'Dragon Flag': {
    view: 'side',
    floor: false,
    ghost: true,
    cue: 'Grip the bench behind your head; your body stays one straight line from shoulders to toes as you lower slowly',
    props: [
      { kind: 'rect', x: 40, y: 60, x2: 106, y2: 64 },
      { kind: 'line', x: 46, y: 64, x2: 46, y2: 72 },
      { kind: 'line', x: 100, y: 64, x2: 100, y2: 72 },
    ],
    keys: [
      { pose: { hip: [82.8, 38.6], torso: 15, head: 100, armF: { to: [101, 60], bend: -1 }, armB: { to: [100, 60], bend: -1 }, legF: [195, 195], legB: [194, 194], footF: 190, footB: 190, label: 'Top — body straight' }, hold: 0.5, move: 2.4 },
      { pose: { hip: [69.8, 49.6], torso: 65, head: 100, armF: { to: [101, 60], bend: -1 }, armB: { to: [100, 60], bend: -1 }, legF: [245, 245], legB: [244, 244], footF: 240, footB: 240, label: 'Lower slowly' }, hold: 0.4, move: 1.4 },
    ],
  },
  'L-Sit': {
    view: 'side',
    ghost: true,
    cue: 'Push the floor away, shoulders down; legs straight out and locked — hold',
    props: [{ kind: 'rect', x: 53, y: 64, x2: 63, y2: 72 }],
    keys: [
      { pose: { hip: [58, 62.5], torso: 180, armF: { to: [58.5, 64], bend: 1 }, armB: { to: [57.5, 64], bend: 1 }, legF: [90, 90], legB: [91, 91], footF: 150, footB: 150, label: 'Hold' }, hold: 1.2, move: 1.2 },
      { pose: { hip: [58, 62], torso: 180, armF: { to: [58.5, 64], bend: 1 }, armB: { to: [57.5, 64], bend: 1 }, legF: [86, 86], legB: [87, 87], footF: 150, footB: 150, label: 'Squeeze' }, hold: 0.8, move: 1.2 },
    ],
  },
  Burpee: {
    view: 'side',
    cue: 'Squat and put your hands down, jump back to a plank, jump the feet in, then jump up',
    keys: [
      { pose: { ...STAND, label: 'Stand' }, hold: 0.3, move: 0.55 },
      { pose: { ...SQUAT, label: 'Hands down' }, hold: 0.15, move: 0.45 },
      { pose: { ...PLANK, label: 'Plank' }, hold: 0.3, move: 0.45 },
      { pose: { ...SQUAT, label: 'Feet in' }, hold: 0.15, move: 0.5 },
      { pose: { ...JUMP, label: 'Jump!' }, hold: 0.1, move: 0.5 },
    ],
  },
  'Wall Sit': {
    view: 'side',
    cue: 'Back flat on the wall, thighs level with the floor, knees over ankles — hold',
    props: [{ kind: 'line', x: 38.5, y: 0, x2: 38.5, y2: 72 }],
    keys: [
      { pose: { hip: [45, 57], torso: 180, armF: { to: [53, 43], bend: 1 }, armB: { to: [52, 44], bend: 1 }, legF: { to: [60.5, 71], bend: -1 }, legB: { to: [59, 71], bend: -1 }, label: 'Hold' }, hold: 1.5, move: 1 },
      { pose: { hip: [45, 57.4], torso: 180, armF: { to: [53, 43.4], bend: 1 }, armB: { to: [52, 44.4], bend: 1 }, legF: { to: [60.5, 71], bend: -1 }, legB: { to: [59, 71], bend: -1 }, label: 'Breathe' }, hold: 1, move: 1 },
    ],
  },
  'Tibialis Raise': {
    view: 'side',
    ghost: true,
    cue: 'Lean back on a wall, heels out in front; pull your toes up hard, then lower slowly',
    props: [{ kind: 'line', x: 38.5, y: 0, x2: 38.5, y2: 72 }],
    keys: [
      { pose: { hip: [48, 46], torso: 195, armF: { to: [49, 64], bend: -1 }, armB: { to: [48, 64], bend: -1 }, legF: { to: [66, 70.5], bend: -1 }, legB: { to: [64.5, 70.5], bend: -1 }, footF: 95, footB: 95, label: 'Toes down' }, hold: 0.3, move: 0.8 },
      { pose: { hip: [48, 46], torso: 195, armF: { to: [49, 64], bend: -1 }, armB: { to: [48, 64], bend: -1 }, legF: { to: [66, 70.5], bend: -1 }, legB: { to: [64.5, 70.5], bend: -1 }, footF: 145, footB: 145, label: 'Pull toes up' }, hold: 0.4, move: 1.2 },
    ],
  },
};

/** Drills shown as the box-breathing guide instead of a figure. */
export const isBreathing = (name: string) => /box breathing/i.test(name);

const key = (s: string) => s.toLowerCase().trim();
const BY = new Map(Object.entries(FIGURES).map(([k, v]) => [key(k), v]));
export const figureFor = (name: string) => BY.get(key(name)) ?? null;

export type Part = { d: string; w: number; near: boolean } | { circle: Pt; r: number; near: boolean; head?: boolean };
const seg = (a: Pt, b: Pt) => `M${a[0].toFixed(2)} ${a[1].toFixed(2)}L${b[0].toFixed(2)} ${b[1].toFixed(2)}`;

/** What to draw for a pose, back to front: far limbs, torso and head, near limbs, hands. */
export function parts(j: Joints): Part[] {
  const limb = (near: boolean, s: Pt, e: Pt, h: Pt, k: Pt, a: Pt, t: Pt): Part[] => [
    { d: seg(near ? j.hipF : j.hipB, k), w: 4.6, near },
    { d: seg(k, a), w: 3.8, near },
    { d: seg(a, t), w: 2.6, near },
    { d: seg(s, e), w: 3.6, near },
    { d: seg(e, h), w: 3.1, near },
    { circle: h, r: 1.6, near },
  ];
  return [
    ...limb(false, j.shoulderB, j.elbowB, j.handB, j.kneeB, j.ankleB, j.toeB),
    { d: `M${j.hip[0].toFixed(2)} ${j.hip[1].toFixed(2)}Q${j.spineCtl[0].toFixed(2)} ${j.spineCtl[1].toFixed(2)} ${j.shoulder[0].toFixed(2)} ${j.shoulder[1].toFixed(2)}`, w: 5.8, near: true },
    { d: seg(j.shoulder, j.neck), w: 2.8, near: true },
    { circle: j.head, r: BONES.headR, near: true, head: true },
    ...limb(true, j.shoulderF, j.elbowF, j.handF, j.kneeF, j.ankleF, j.toeF),
  ];
}
