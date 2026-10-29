// Sport logging: activity types, calorie estimates, pace and GPS maths. Pure, no React.

export type SportType = 'badminton' | 'run' | 'walk' | 'cycle' | 'swim' | 'football' | 'cricket' | 'yoga' | 'other';

export const SPORTS: Record<SportType, { label: string; emoji: string; met: number; distance: boolean; gps: boolean }> = {
  badminton: { label: 'Badminton', emoji: '🏸', met: 5.5, distance: false, gps: false },
  run: { label: 'Run', emoji: '🏃', met: 9.8, distance: true, gps: true },
  walk: { label: 'Walk', emoji: '🚶', met: 3.5, distance: true, gps: true },
  cycle: { label: 'Cycling', emoji: '🚴', met: 7.5, distance: true, gps: true },
  swim: { label: 'Swim', emoji: '🏊', met: 7, distance: true, gps: false },
  football: { label: 'Football', emoji: '⚽', met: 7, distance: false, gps: false },
  cricket: { label: 'Cricket', emoji: '🏏', met: 4.8, distance: false, gps: false },
  yoga: { label: 'Yoga', emoji: '🧘', met: 2.5, distance: false, gps: false },
  other: { label: 'Other', emoji: '✨', met: 5, distance: false, gps: false },
};

export type BadmintonDetails = { format: 'singles' | 'doubles'; games: number; won: number; partner?: string; level: 'casual' | 'competitive' };

/**
 * kcal = MET × kg × hours. Runs and walks with a distance use the ACSM metabolic equations, so pace
 * matters (a 5:00/km run burns more per minute than a 7:00/km jog). Badminton MET depends on how
 * hard the play is: casual doubles ≈ 4.5, competitive singles ≈ 7.
 */
export function estimateKcal(type: SportType, minutes: number, weightKg: number, distanceKm?: number | null, details?: Partial<BadmintonDetails>) {
  let met = SPORTS[type].met;
  if ((type === 'run' || type === 'walk') && distanceKm && minutes > 0) {
    const mPerMin = (distanceKm * 1000) / minutes;
    const vo2 = type === 'run' ? 3.5 + 0.2 * mPerMin : 3.5 + 0.1 * mPerMin;
    met = vo2 / 3.5;
  }
  if (type === 'badminton' && details) met = details.level === 'competitive' ? (details.format === 'singles' ? 7 : 6) : details.format === 'singles' ? 5.5 : 4.5;
  return Math.round(met * weightKg * (minutes / 60));
}

/** "5:42 /km" from minutes and km. */
export function pace(minutes: number, km: number) {
  if (!km || !minutes) return '—';
  const p = minutes / km;
  const m = Math.floor(p);
  const s = Math.round((p - m) * 60);
  return `${m}:${String(s === 60 ? 0 : s).padStart(2, '0')}`;
}
export const fmtDuration = (min: number) => {
  const total = Math.round(min * 60);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
};

export type Pt = [lat: number, lng: number, t: number];

/** Great-circle distance in metres. */
export function haversine(a: Pt, b: Pt) {
  const R = 6371e3;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export const trackDistanceKm = (pts: Pt[]) => pts.slice(1).reduce((a, p, i) => a + haversine(pts[i], p), 0) / 1000;

/** Per-km split times in minutes, from a timed track (pauses already excluded by the tracker). */
export function splits(pts: Pt[]) {
  const out: number[] = [];
  let acc = 0;
  let lastT = pts[0]?.[2] ?? 0;
  for (let i = 1; i < pts.length; i++) {
    acc += haversine(pts[i - 1], pts[i]);
    if (acc >= 1000 * (out.length + 1)) {
      out.push((pts[i][2] - lastT) / 60000);
      lastT = pts[i][2];
    }
  }
  return out;
}

/**
 * Accept a GPS fix only if it's accurate and physically plausible: phones emit jumpy points
 * (accuracy 50–200 m) indoors and right after acquiring a signal, which would inflate distance.
 */
export function acceptFix(prev: Pt | undefined, next: Pt, accuracyM: number, type: SportType) {
  if (accuracyM > 30) return false;
  if (!prev) return true;
  const d = haversine(prev, next);
  const dt = (next[2] - prev[2]) / 1000;
  if (dt <= 0) return false;
  const maxSpeed = type === 'cycle' ? 20 : type === 'run' ? 8 : 4; // m/s
  return d >= 3 && d / dt <= maxSpeed;
}

/** Project a track into a 0–100 box (equirectangular is fine at city scale) for the circuit-map SVG. */
export function projectTrack(pts: Pt[], pad = 6) {
  if (pts.length < 2) return '';
  const lats = pts.map((p) => p[0]);
  const lngs = pts.map((p) => p[1]);
  const midLat = ((Math.min(...lats) + Math.max(...lats)) / 2) * (Math.PI / 180);
  const xs = lngs.map((l) => l * Math.cos(midLat));
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...lats), maxY = Math.max(...lats);
  const span = Math.max(maxX - minX, maxY - minY) || 1;
  const sc = (100 - pad * 2) / span;
  const ox = (100 - (maxX - minX) * sc) / 2;
  const oy = (100 - (maxY - minY) * sc) / 2;
  return pts.map((_, i) => `${(ox + (xs[i] - minX) * sc).toFixed(2)},${(oy + (maxY - lats[i]) * sc).toFixed(2)}`).join(' ');
}

// ---------- Route marks (for the 3D map) ----------
/** Compass bearing (degrees) from a to b — used to point the onboard camera where you're heading. */
export function bearing(a: Pt, b: Pt) {
  const toRad = (x: number) => (x * Math.PI) / 180;
  const y = Math.sin(toRad(b[1] - a[1])) * Math.cos(toRad(b[0]));
  const x = Math.cos(toRad(a[0])) * Math.sin(toRad(b[0])) - Math.sin(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.cos(toRad(b[1] - a[1]));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/** Where each full kilometre was crossed, with its split time; the quickest is flagged. */
export function kmMarks(pts: Pt[]) {
  const marks: { km: number; at: Pt; minutes: number; fastest: boolean }[] = [];
  let acc = 0;
  let lastT = pts[0]?.[2] ?? 0;
  for (let i = 1; i < pts.length; i++) {
    acc += haversine(pts[i - 1], pts[i]);
    if (acc >= 1000 * (marks.length + 1)) {
      marks.push({ km: marks.length + 1, at: pts[i], minutes: (pts[i][2] - lastT) / 60000, fastest: false });
      lastT = pts[i][2];
    }
  }
  if (marks.length > 1) {
    const best = Math.min(...marks.map((m) => m.minutes));
    marks.forEach((m) => (m.fastest = m.minutes === best));
  }
  return marks;
}

/** Points roughly every `stepM` metres along the track (for elevation sampling). */
export function resample(pts: Pt[], stepM = 25) {
  if (pts.length < 2) return pts.slice();
  const out: Pt[] = [pts[0]];
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    acc += haversine(pts[i - 1], pts[i]);
    if (acc >= stepM) (out.push(pts[i]), (acc = 0));
  }
  if (out.at(-1) !== pts.at(-1)) out.push(pts.at(-1)!);
  return out;
}

/** Total climb / descent from an elevation series, ignoring sub-3 m noise from DEM interpolation. */
export function climb(elev: number[]) {
  let up = 0;
  let down = 0;
  let ref = elev[0] ?? 0;
  for (const e of elev.slice(1)) {
    const d = e - ref;
    if (Math.abs(d) >= 3) ((d > 0 ? (up += d) : (down -= d)), (ref = e));
  }
  return { up: Math.round(up), down: Math.round(down) };
}
