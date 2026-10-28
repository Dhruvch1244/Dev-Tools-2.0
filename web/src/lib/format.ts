const pad = (n: number) => String(n).padStart(2, '0');

/** YYYY-MM-DD in the device's local timezone (not UTC). */
export const isoDate = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const today = () => isoDate();
export const parseDate = (s: string) => {
  const [y, m, d] = s.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
};
export const addDays = (s: string, n: number) => {
  const d = parseDate(s);
  d.setDate(d.getDate() + n);
  return isoDate(d);
};
export const addMonths = (s: string, n: number) => {
  const d = parseDate(s);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
  return isoDate(d);
};
export const monthKey = (s: string) => s.slice(0, 7);
export const monthRange = (key: string) => {
  const [y, m] = key.split('-').map(Number);
  return { from: `${key}-01`, to: `${key}-${pad(new Date(y, m, 0).getDate())}` };
};
export const daysBetween = (a: string, b: string) => Math.round((parseDate(b).getTime() - parseDate(a).getTime()) / 86_400_000);

export function relativeDay(s: string) {
  const diff = daysBetween(today(), s);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  if (diff > 1 && diff < 7) return parseDate(s).toLocaleDateString(undefined, { weekday: 'long' });
  return parseDate(s).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: diff < -300 || diff > 300 ? 'numeric' : undefined });
}

export function dueLabel(due: string) {
  const time = due.includes('T') ? new Date(due).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : '';
  return [relativeDay(due), time].filter(Boolean).join(' · ');
}

export function money(n: number, currency = 'INR', compact = false) {
  return new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : undefined, {
    style: 'currency',
    currency,
    maximumFractionDigits: compact || Number.isInteger(n) ? 0 : 2,
    notation: compact && Math.abs(n) >= 100_000 ? 'compact' : 'standard',
  }).format(n);
}

export function bytes(n: number) {
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  while (n >= 1024 && i < units.length - 1) (n /= 1024), i++;
  return `${n.toFixed(i ? 1 : 0)} ${units[i]}`;
}

export function timeAgo(iso: string) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 45) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return relativeDay(isoDate(new Date(iso)));
}

export function greeting(h = new Date().getHours()) {
  if (h < 5) return 'Still up';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  if (h < 22) return 'Good evening';
  return 'Good night';
}

export const haptic = (ms = 8) => navigator.vibrate?.(ms);
