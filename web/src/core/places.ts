// Places for location triggers: what the app does when an iPhone Shortcuts automation says you
// arrived at or left somewhere. Pure: no React, no I/O — the server runs it, tests pin it down.

export type PlaceKind = 'gym' | 'office' | 'home' | 'other';
export type PlaceEvent = 'arrive' | 'leave';
export type Place = { id: string; name: string; kind: PlaceKind };

export const PLACE_KINDS: Record<PlaceKind, { label: string; emoji: string; arrive: string; leave: string }> = {
  gym: { label: 'Gym', emoji: '🏋️', arrive: 'Today’s workout + warm-up', leave: 'Nudge to log the session if you didn’t' },
  office: { label: 'Office', emoji: '🏢', arrive: 'Clocks you in (logout time follows)', leave: 'Clocks you out + home-by time' },
  home: { label: 'Home', emoji: '🏠', arrive: 'Evening check: water, protein, shutdown', leave: 'Quiet log only' },
  other: { label: 'Other', emoji: '📍', arrive: 'Quiet log only', leave: 'Quiet log only' },
};

/** The bits of today's snapshot a place reaction reads (see server/hooks.ts snapshot). */
export type PlaceSnap = {
  gym: { type: string; label: string; focus: string; sets: number };
  protein: { eaten: number; target: number };
  water: { glasses: number; goal: number };
  habits: { done: number; total: number };
  story: { answered: number; total: number };
  work: { mode: string; logout?: string | null };
  shutdown: string | null;
};

export type PlaceAction = {
  message: string;
  push?: { title: string; body: string; url: string };
  /** Office arrivals/departures stamp the day's real login/logout. */
  clock?: { in?: string; out?: string; mode?: 'office' };
};

/** What happens for one arrive/leave at `hm` ("HH:MM"); `homeAt` is hm + commute. */
export function placeAction(place: Place, event: PlaceEvent, s: PlaceSnap, hm: string, homeAt: string): PlaceAction {
  const proteinLeft = Math.max(0, s.protein.target - s.protein.eaten);
  if (place.kind === 'gym' && event === 'arrive') {
    if (s.gym.type === 'rest') return { message: 'Rest day on the split', push: { title: '🛞 Rest day on the split', body: 'Easy cardio, mobility or a stretch today — or swap the day in Gym.', url: '/gym' } };
    return { message: `${s.gym.label} day`, push: { title: `🏋️ ${s.gym.label} day — warm up first`, body: `${s.gym.focus}. Tap for the warm-up and today’s lifts.`, url: '/gym' } };
  }
  if (place.kind === 'gym' && event === 'leave') {
    if (s.gym.sets === 0) return { message: 'No sets logged yet', push: { title: '💪 Log today’s session?', body: 'You left the gym with nothing logged — add it while it’s fresh.', url: '/gym' } };
    return { message: `${s.gym.sets} sets logged`, push: { title: `💪 ${s.gym.sets} sets in the books`, body: proteinLeft > 20 ? `${proteinLeft} g protein left today — a whey shake or paneer now helps recovery.` : 'Protein’s on track. Stretch, water, recover.', url: '/fuel' } };
  }
  if (place.kind === 'office' && event === 'arrive') return { message: `Clocked in ${hm}`, clock: { in: hm, mode: 'office' } };
  if (place.kind === 'office' && event === 'leave')
    return { message: `Clocked out ${hm}`, clock: { out: hm }, push: { title: `🏠 Heading home — there by ~${homeAt}`, body: [proteinLeft > 20 ? `${proteinLeft} g protein left` : null, s.water.glasses < s.water.goal ? `water ${s.water.glasses}/${s.water.goal}` : null].filter(Boolean).join(' · ') || 'Good day. Easy evening.', url: '/' } };
  if (place.kind === 'home' && event === 'arrive' && hm >= '17:00' && !s.shutdown) {
    const bits = [
      s.water.glasses < s.water.goal ? `💧 ${s.water.glasses}/${s.water.goal}` : null,
      proteinLeft > 20 ? `🥛 ${proteinLeft} g protein left` : null,
      s.habits.total && s.habits.done < s.habits.total ? `🔥 ${s.habits.done}/${s.habits.total} habits` : null,
      s.story.answered < s.story.total ? `✍️ Daily 3 waiting` : null,
    ].filter(Boolean);
    return { message: 'Welcome home', push: { title: '🏁 Welcome home', body: bits.length ? bits.join(' · ') : 'Everything’s done today. Enjoy the evening.', url: '/' } };
  }
  return { message: `${event === 'arrive' ? 'Arrived at' : 'Left'} ${place.name}` };
}

/** A URL-safe id from a name: "Cult Gym, HSR" → "cult-gym-hsr". */
export const placeId = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 32) || 'place';
