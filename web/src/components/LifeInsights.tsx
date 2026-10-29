import { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { Link } from 'react-router';
import { Loader2, MapPin, RefreshCw, Sparkles, UserPlus } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { api, useList, useResource, useSettings } from '../lib/api';
import { addDays, parseDate, relativeDay, today } from '../lib/format';
import { md } from '../lib/dsa';
import { FACT_META, MOOD_WORDS, lifeRollup, moodLifts, normaliseInsights, type Day, type FactKind } from '../core/lifeInsights';
import type { Health, Journal, Note, PersonRow } from '../lib/types';
import { Card, SectionTitle, cx } from './ui';
import { useToast } from './toast';

const MOOD_COLORS = ['', '#5b6170', '#8a7f9e', '#c9a227', '#7ccf6b', '#2bd46b'];
const parseIns = (s: string | null | undefined) => {
  try {
    return s ? normaliseInsights(JSON.parse(s)) : null;
  } catch {
    return null;
  }
};

/** A 1–5 meter as five slanted bars. */
function Meter({ label, value, color, invert }: { label: string; value: number | null; color: string; invert?: boolean }) {
  return (
    <div>
      <p className="text-micro font-black uppercase tracking-[0.2em] text-ink-3">{label}</p>
      <div className="mt-1.5 flex gap-1">
        {[1, 2, 3, 4, 5].map((i) => (
          <motion.span key={i} initial={{ scaleY: 0 }} animate={{ scaleY: 1 }} transition={{ delay: i * 0.05 }} className="slant h-4 flex-1 origin-bottom" style={{ background: value != null && i <= Math.round(value) ? color : 'var(--surface-2)' }} />
        ))}
      </div>
      <p className="mt-1 font-mono text-tiny text-ink-2">{value != null ? `${value.toFixed(1)} / 5${invert ? (value >= 3.5 ? ' · high' : value <= 2 ? ' · calm' : '') : ''}` : '—'}</p>
    </div>
  );
}

/**
 * Life, read from your journal: how you've been (mood, energy, stress), an AI recap, the life log
 * of things worth remembering, and the people, places and themes that keep coming up — all
 * auto-detected from what you write at night. People and places can go straight to Pit crew / Notes.
 */
export function LifeInsights() {
  const t = today();
  const qc = useQueryClient();
  const toast = useToast();
  const { settings } = useSettings();
  const { data: entries = [] } = useList<Journal>('journal', { from: addDays(t, -90) });
  const { data: health = [] } = useList<Health>('health', { from: addDays(t, -60) });
  const { data: people = [] } = useList<PersonRow>('people');
  const { data: notes = [] } = useList<Note>('notes');
  const peopleApi = useResource<PersonRow>('people');
  const notesApi = useResource<Note>('notes');
  const [busy, setBusy] = useState<'scan' | 'summary' | null>(null);
  const [kind, setKind] = useState<FactKind | 'all'>('all');

  const days: Day[] = useMemo(() => entries.flatMap((e) => (parseIns(e.insights) ? [{ date: e.date, mood: e.mood, insights: parseIns(e.insights)! }] : [])), [entries]);
  const r = useMemo(() => lifeRollup(days), [days]);
  const lifts = useMemo(() => moodLifts(days), [days]);
  const unread = entries.filter((e) => !e.insights && (e.body?.trim() || e.answers)).length;

  // 35-day mood strip: journal mood, else the mood you tapped on the health card.
  const strip = Array.from({ length: 35 }, (_, i) => addDays(t, i - 34)).map((date) => {
    const j = entries.find((e) => e.date === date);
    const m = j?.mood ?? parseIns(j?.insights)?.mood ?? health.find((h) => h.date === date && h.kind === 'mood')?.value ?? null;
    return { date, mood: m, summary: parseIns(j?.insights)?.summary ?? null };
  });

  const scan = async () => {
    setBusy('scan');
    try {
      const x = await api<{ done: number; left: number }>('/life/scan', { method: 'POST' });
      toast({ message: `Read ${x.done} journal day${x.done === 1 ? '' : 's'}${x.left ? ` · ${x.left} left, tap again` : ''}` });
      await qc.invalidateQueries({ queryKey: ['journal'] });
    } catch (e) {
      toast({ message: (e as Error).message });
    } finally {
      setBusy(null);
    }
  };
  const summarise = async () => {
    setBusy('summary');
    try {
      await api('/life/summary', { method: 'POST' });
      await qc.invalidateQueries({ queryKey: ['settings'] });
    } catch (e) {
      toast({ message: (e as Error).message });
    } finally {
      setBusy(null);
    }
  };
  const known = (name: string) => people.some((p) => p.name.toLowerCase() === name.toLowerCase());
  const placeSaved = (place: string) => notes.some((n) => n.list === 'places' && n.title?.toLowerCase() === place.toLowerCase());
  const log = r.log.filter((f) => kind === 'all' || f.kind === kind);
  const kinds = [...new Set(r.log.map((f) => f.kind))];
  const label = 'text-micro font-black uppercase tracking-[0.2em] text-ink-3';

  if (!days.length)
    return (
      <Card className="lg:col-span-3">
        <SectionTitle>Your life, from the journal</SectionTitle>
        <p className="text-sm text-ink-2">Write tonight’s journal and the AI reads it for mood, energy, the people and places that came up, and anything worth remembering — this fills in as you write.</p>
        {unread > 0 && (
          <button onClick={() => void scan()} disabled={!!busy} className="mt-3 flex h-10 items-center gap-2 rounded-md bg-accent px-4 text-mini font-black uppercase text-white disabled:opacity-50">
            {busy === 'scan' ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />} Read my {unread} journal day{unread === 1 ? '' : 's'}
          </button>
        )}
      </Card>
    );

  return (
    <div className="grid min-w-0 grid-cols-1 gap-4 lg:col-span-3">
      <Card>
        <SectionTitle
          action={
            unread > 0 && (
              <button onClick={() => void scan()} disabled={!!busy} className="flex items-center gap-1 text-mini font-bold uppercase text-accent">
                {busy === 'scan' ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />} Read {unread} new
              </button>
            )
          }
        >
          How you’ve been
        </SectionTitle>
        <div className="flex items-end gap-4">
          <div>
            <p className="font-display text-5xl font-black italic leading-none" style={{ color: r.mood ? MOOD_COLORS[Math.round(r.mood)] : undefined }}>
              {r.mood ? MOOD_WORDS[Math.round(r.mood)] : '—'}
            </p>
            <p className="mt-1 text-tiny text-ink-3">
              last 7 days{r.moodDelta != null && Math.abs(r.moodDelta) >= 0.2 ? <span className={r.moodDelta > 0 ? 'text-green' : 'text-amber'}> · {r.moodDelta > 0 ? '▲ better' : '▼ lower'} than the week before</span> : ''}
            </p>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-3">
          <Meter label="Mood" value={r.mood} color="#2bd46b" />
          <Meter label="Energy" value={r.energy} color="#ffd23f" />
          <Meter label="Stress" value={r.stress} color="#e10600" invert />
        </div>
        <div className="mt-4">
          <p className={label}>Last 5 weeks</p>
          <div className="mt-1.5 grid grid-cols-7 gap-1">
            {strip.map((d) => (
              <span key={d.date} title={`${relativeDay(d.date)}${d.mood ? ` · ${MOOD_WORDS[Math.round(d.mood)]}` : ''}${d.summary ? ` — ${d.summary}` : ''}`} className={cx('aspect-[2/1] rounded-sm', d.date === t && 'ring-1 ring-ink')} style={{ background: d.mood ? MOOD_COLORS[Math.round(d.mood)] : 'var(--surface-2)', opacity: d.mood ? 1 : 0.5 }} />
            ))}
          </div>
          <div className="mt-1.5 flex items-center gap-2 text-micro text-ink-3">
            {[1, 2, 3, 4, 5].map((m) => (
              <span key={m} className="flex items-center gap-1">
                <span className="size-2 rounded-sm" style={{ background: MOOD_COLORS[m] }} /> {MOOD_WORDS[m]}
              </span>
            ))}
          </div>
        </div>
        {lifts.length > 0 && (
          <div className="mt-4">
            <p className={label}>What moves your mood</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {lifts.slice(0, 6).map((l) => (
                <span key={l.tag} className={cx('rounded-md px-2 py-1 text-tiny font-bold', l.lift > 0 ? 'bg-green/15 text-green' : 'bg-amber/15 text-amber')}>
                  {l.tag} {l.lift > 0 ? '▲' : '▼'} {Math.abs(l.lift).toFixed(1)}
                </span>
              ))}
            </div>
          </div>
        )}
      </Card>

      <Card>
        <SectionTitle
          action={
            <button onClick={() => void summarise()} disabled={!!busy} className="flex items-center gap-1 text-mini font-bold uppercase text-accent">
              {busy === 'summary' ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />} {settings.lifeSummary ? 'Refresh' : 'Write it'}
            </button>
          }
        >
          State of my life
        </SectionTitle>
        {busy === 'summary' ? (
          <div className="space-y-2">
            {[90, 70, 95, 60].map((w, j) => (
              <motion.div key={j} className="h-3 rounded bg-surface-2" style={{ width: `${w}%` }} animate={{ opacity: [0.35, 0.8, 0.35] }} transition={{ duration: 1.3, repeat: Infinity, delay: j * 0.1 }} />
            ))}
          </div>
        ) : settings.lifeSummary ? (
          <>
            <div className="prose-f1 text-sm leading-relaxed" dangerouslySetInnerHTML={{ __html: md(settings.lifeSummary.text) }} />
            <p className="mt-2 text-micro text-ink-3">Written {relativeDay(settings.lifeSummary.at.slice(0, 10)).toLowerCase()} from {r.days} journal day{r.days === 1 ? '' : 's'}</p>
          </>
        ) : (
          <p className="text-sm text-ink-3">A short recap of the last month — how you’ve been, what lifts you, one thing for this week.</p>
        )}
      </Card>

      {r.log.length > 0 && (
        <Card>
          <SectionTitle>Life log</SectionTitle>
          <div className="-mx-1 mb-3 flex gap-1.5 overflow-x-auto px-1 no-scrollbar">
            {(['all', ...kinds] as const).map((k) => (
              <button key={k} onClick={() => setKind(k)} className={cx('shrink-0 rounded-md px-2.5 py-1 text-tiny font-bold', kind === k ? 'bg-ink text-bg' : 'bg-surface-2 text-ink-2')}>
                {k === 'all' ? 'All' : `${FACT_META[k].emoji} ${FACT_META[k].label}`}
              </button>
            ))}
          </div>
          <ol className="relative space-y-2 border-l-2 border-line pl-4">
            {log.slice(0, 20).map((f, i) => (
              <motion.li key={`${f.date}${i}`} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: Math.min(i, 8) * 0.03 }} className="relative">
                <span className="absolute -left-[23px] top-1 size-3 rounded-full border-2 border-bg" style={{ background: FACT_META[f.kind].color }} />
                <p className="text-sm">
                  {FACT_META[f.kind].emoji} {f.text}
                </p>
                <p className="text-micro text-ink-3">{parseDate(f.date).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}</p>
              </motion.li>
            ))}
          </ol>
        </Card>
      )}

      {(r.people.length > 0 || r.places.length > 0 || r.tags.length > 0) && (
        <Card>
          {r.people.length > 0 && (
            <>
              <p className={label}>People in your story</p>
              <ul className="mt-2 space-y-1.5">
                {r.people.slice(0, 8).map((p) => (
                  <li key={p.name} className="flex items-center gap-2 rounded-md bg-bg px-3 py-2">
                    <span className="grid size-8 shrink-0 place-items-center rounded-full bg-pink/15 font-black text-pink">{p.name.slice(0, 1).toUpperCase()}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold">
                        {p.name} <span className="font-mono text-tiny font-normal text-ink-3">×{p.n}</span>
                      </p>
                      {p.note && <p className="truncate text-tiny text-ink-3">{p.note}</p>}
                    </div>
                    {known(p.name) ? (
                      <Link to="/people" className="text-micro font-bold uppercase text-ink-3">
                        Pit crew
                      </Link>
                    ) : (
                      <button onClick={() => (void peopleApi.create({ name: p.name, every_days: 7, weekday: null, call_at: '19:00', notes: p.note }), toast({ message: `${p.name} added to Pit crew` }))} className="flex h-8 items-center gap-1 rounded-md bg-surface-2 px-2 text-micro font-bold uppercase text-ink-2">
                        <UserPlus className="size-3.5" /> Add
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
          {r.places.length > 0 && (
            <>
              <p className={cx(label, 'mt-4')}>Places that came up</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {r.places.map((p) => (
                  <button
                    key={p.place}
                    disabled={placeSaved(p.place)}
                    onClick={() => (void notesApi.create({ title: p.place, list: 'places', body: null, pinned: 0, color: null, done: 0 }), toast({ message: `${p.place} saved to Places to go` }))}
                    className="flex items-center gap-1 rounded-md bg-surface-2 px-2 py-1 text-tiny font-bold text-ink-2 disabled:opacity-60"
                  >
                    <MapPin className="size-3 text-accent" /> {p.place}
                    {!placeSaved(p.place) && <span className="text-accent">＋</span>}
                  </button>
                ))}
              </div>
            </>
          )}
          {r.tags.length > 0 && (
            <>
              <p className={cx(label, 'mt-4')}>Themes</p>
              <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                {r.tags.map((x) => (
                  <span key={x.tag} className="font-display font-black uppercase italic text-ink-2" style={{ fontSize: `${Math.min(1.5, 0.75 + x.n * 0.12)}rem`, opacity: Math.min(1, 0.5 + x.n * 0.1) }}>
                    {x.tag}
                  </span>
                ))}
              </div>
            </>
          )}
          {r.gratitude.length > 0 && (
            <>
              <p className={cx(label, 'mt-4')}>Gratitude jar</p>
              <ul className="mt-2 space-y-1 text-sm text-ink-2">
                {r.gratitude.slice(0, 6).map((g, i) => (
                  <li key={i}>
                    ✨ {g.text} <span className="text-micro text-ink-3">· {relativeDay(g.date).toLowerCase()}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>
      )}
    </div>
  );
}
