// Contacts import: parse vCard (.vcf) exports from iPhone Contacts / iCloud / Google Contacts into
// name, phone and birthday. Pure: no React, no I/O.

export type Contact = { name: string; phone: string | null; birthday: string | null };

/** Undo vCard line folding and quoted-printable soft breaks. */
const unfold = (s: string) => s.replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '').replace(/=\n/g, '');
const unescape = (v: string) => v.replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\n/gi, ' ').replace(/\\\\/g, '\\').trim();

/** Indian numbers to +91XXXXXXXXXX; anything else keeps its digits and a leading +. */
export function normalisePhone(raw: string): string | null {
  const plus = raw.trim().startsWith('+');
  const d = raw.replace(/\D/g, '');
  if (d.length < 6) return null;
  if (!plus && d.length === 10) return `+91${d}`;
  if (!plus && d.length === 11 && d.startsWith('0')) return `+91${d.slice(1)}`;
  if (!plus && d.length === 12 && d.startsWith('91')) return `+${d}`;
  return plus ? `+${d}` : d;
}

/** BDAY:1990-03-14 / 19900314 / --03-14 (no year) → "YYYY-MM-DD" (year 2000 when unknown). */
function birthday(v: string): string | null {
  const s = v.trim();
  let m = /^(\d{4})-?(\d{2})-?(\d{2})/.exec(s);
  if (m) return `${m[1] === '1604' ? '2000' : m[1]}-${m[2]}-${m[3]}`; // iOS uses 1604 for "no year"
  m = /^--(\d{2})-?(\d{2})/.exec(s);
  return m ? `2000-${m[1]}-${m[2]}` : null;
}

export function parseVcf(text: string): Contact[] {
  const out: Contact[] = [];
  for (const card of unfold(text).split(/BEGIN:VCARD/i).slice(1)) {
    let fn = '';
    let n = '';
    let phone: string | null = null;
    let pref = false;
    let bday: string | null = null;
    for (const line of card.split('\n')) {
      const i = line.indexOf(':');
      if (i < 0) continue;
      const head = line.slice(0, i).toUpperCase();
      const val = line.slice(i + 1);
      const prop = head.split(';')[0].replace(/^ITEM\d+\./, '');
      if (prop === 'FN') fn = unescape(val);
      else if (prop === 'N' && !n) n = unescape(val.split(';').slice(0, 2).reverse().join(' '));
      else if (prop === 'TEL') {
        const p = normalisePhone(val);
        // Prefer the mobile / preferred number over landlines and work numbers.
        const better = /CELL|MOBILE|IPHONE|PREF/.test(head);
        if (p && (!phone || (better && !pref))) (phone = p), (pref = better);
      } else if (prop === 'BDAY') bday = birthday(val);
    }
    const name = (fn || n).replace(/\s+/g, ' ').trim();
    if (name) out.push({ name, phone, birthday: bday });
  }
  return out;
}

/** Same person if same phone, or same name with no phone to tell them apart. */
export const contactKey = (c: { name: string; phone: string | null }) => (c.phone ? `t:${c.phone}` : `n:${c.name.toLowerCase()}`);
