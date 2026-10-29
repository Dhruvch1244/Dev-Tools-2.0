import { lazy, Suspense, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useQuery } from '@tanstack/react-query';
import { BookUser, Cake, Check, ChevronDown, Home, Loader2, MapPin, Phone, Plus, Search, Trash2, Users } from 'lucide-react';
import { api, useList, useResource, useSettings } from '../lib/api';
import { haptic, relativeDay, today } from '../lib/format';
import { listItem } from '../lib/motion';
import { CIRCLES, CIRCLE_ORDER, circleTree, cityPins, kmBetween, nextBirthday, nextContact, overdueDays, rhythmLabel, weatherNudge, weatherOf } from '../core/people';
import type { ContactRow, PersonRow, Note } from '../lib/types';
import { ImportContactsSheet } from '../components/Contacts';
import { useToast } from '../components/toast';
import { Button, Card, Empty, Input, Page, PageHeader, Rise, Segmented, Sheet, Textarea, cx } from '../components/ui';
import type { Pin } from '../components/CrewMap';

const CrewMap = lazy(() => import('../components/CrewMap'));

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const RHYTHMS = [
  { label: 'None', every: 0 },
  { label: 'Daily', every: 1 },
  { label: 'Weekly', every: 7 },
  { label: '2 weeks', every: 14 },
  { label: 'Monthly', every: 30 },
];
const BLANK: Partial<PersonRow> = { name: '', emoji: null, phone: null, birthday: null, every_days: 7, weekday: 0, call_at: '19:00', last_contact: null, notes: null, circle: null, org: null, city: null, lat: null, lon: null };
type Weather = { temp: number; code: number; day: boolean; max: number | null; min: number | null } | null;
const keyOf = (p: { lat: number; lon: number }) => `${p.lat.toFixed(2)},${p.lon.toFixed(2)}`;

/** Live weather for every city on the map (one request, cached by the server for 15 min). */
function useWeather(points: { lat: number; lon: number }[]) {
  const pts = [...new Set(points.map(keyOf))].sort().join(';');
  const { data = {} } = useQuery({ queryKey: ['weather', pts], queryFn: () => api<Record<string, Weather>>(`/geo/weather?pts=${pts}`), enabled: !!pts, staleTime: 10 * 60_000, refetchInterval: 15 * 60_000 });
  return (p: { lat?: number | null; lon?: number | null }) => (p.lat != null && p.lon != null ? (data[keyOf({ lat: p.lat, lon: p.lon })] ?? null) : null);
}

/** Pit crew: your people as circles (Family › Mom's side, Work › Google…), on a live map of India, with who's due a call. */
export function PeoplePage() {
  const { data: people = [] } = useList<PersonRow>('people');
  const { data: gifts = [] } = useList<Note>('notes');
  const { update, remove, create } = useResource<PersonRow>('people');
  const { settings, save } = useSettings();
  const toast = useToast();
  const [editing, setEditing] = useState<Partial<PersonRow> | null>(null);
  const [importing, setImporting] = useState(false);
  const [view, setView] = useState<'crew' | 'map'>('crew');
  const [city, setCity] = useState<string | null>(null);
  const [homeOpen, setHomeOpen] = useState(false);
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  const t = today();
  const dueNow = people.filter((p) => nextContact(p, t) === t);
  const bdays = people.map((p) => ({ p, b: nextBirthday(p, t) })).filter((x) => x.b && x.b.inDays <= 30).sort((a, b) => a.b!.inDays - b.b!.inDays);
  const tree = useMemo(() => circleTree(people, t), [people, t]);
  const home = settings.home ?? null;
  const weather = useWeather([...people.filter((p) => p.lat != null && p.lon != null).map((p) => ({ lat: p.lat!, lon: p.lon! })), ...(home ? [home] : [])]);
  const pins: Pin[] = useMemo(() => cityPins(people).map((p) => ({ ...p, weather: weather(p) })), [people, weather]);
  const sel = pins.find((p) => keyOf(p) === city) ?? null;

  const talked = (p: PersonRow) => {
    haptic(14);
    const prev = p.last_contact;
    update({ id: p.id, last_contact: t });
    toast({ message: `Logged a chat with ${p.name}`, action: { label: 'Undo', onClick: () => update({ id: p.id, last_contact: prev }) } });
  };
  // Gift ideas jotted in Notes for this person (matched by name).
  const giftsFor = (name: string) => gifts.filter((g) => !g.done && g.person?.toLowerCase() === name.toLowerCase()).map((g) => g.title ?? '');
  const sortByDue = (ps: PersonRow[]) => [...ps].sort((a, b) => (nextContact(a, t) ?? '9999').localeCompare(nextContact(b, t) ?? '9999'));
  const row = (p: PersonRow) => <CrewRow key={p.id} p={p} t={t} gifts={giftsFor(p.name)} weather={weather(p)} home={home} onOpen={() => setEditing(p)} onTalked={() => talked(p)} />;

  return (
    <Page>
      <PageHeader
        eyebrow={dueNow.length ? `${dueNow.length} to call today` : `${people.length} in your crew`}
        title="Pit crew"
        action={
          <div className="flex gap-2">
            <Button variant="soft" onClick={() => setImporting(true)}>
              <BookUser className="size-4" /> Import
            </Button>
            <Button onClick={() => setEditing({ ...BLANK })}>
              <Plus className="size-4" /> Person
            </Button>
          </div>
        }
      />

      {bdays.length > 0 && (
        <Rise className="mb-4 flex gap-2 overflow-x-auto no-scrollbar">
          {bdays.map(({ p, b }) => (
            <div key={p.id} className={cx('shrink-0 rounded-xl border px-4 py-3', b!.inDays === 0 ? 'border-yellow bg-yellow/10' : 'border-line bg-surface')}>
              <p className="flex items-center gap-1.5 text-micro font-black uppercase tracking-[0.2em] text-ink-3">
                <Cake className="size-3.5 text-yellow" /> {b!.inDays === 0 ? 'Today!' : relativeDay(b!.date)}
              </p>
              <p className="font-bold">
                {p.emoji} {p.name} {b!.age ? <span className="text-ink-3">· {b!.age}</span> : null}
              </p>
            </div>
          ))}
        </Rise>
      )}

      {people.length > 0 && (
        <Segmented
          className="mb-4 w-full"
          value={view}
          onChange={setView}
          options={[
            { value: 'crew', label: `Circles · ${tree.length}` },
            { value: 'map', label: `Map · ${pins.length} ${pins.length === 1 ? 'city' : 'cities'}` },
          ]}
        />
      )}

      {people.length === 0 ? (
        <Card>
          <Empty icon={<Users className="size-6" />} title="Nobody yet" hint="Add Mom, Dad, college friends, your team — put them in circles and cities. Daily calls show up on Routines with a streak." />
        </Card>
      ) : view === 'crew' ? (
        <div className="space-y-3">
          {tree.map((c) => {
            const meta = CIRCLES[c.circle];
            const open = !closed[c.circle];
            return (
              <Card key={c.circle} className="!p-0 overflow-hidden">
                <button onClick={() => setClosed({ ...closed, [c.circle]: open })} className="flex w-full items-center gap-3 px-4 py-3 text-left">
                  <span className="grid size-10 shrink-0 place-items-center rounded-lg text-xl" style={{ background: `color-mix(in srgb, ${meta.color} 18%, transparent)` }}>
                    {meta.emoji}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-display text-lg font-black uppercase italic leading-tight">{c.circle}</span>
                    <span className="block text-tiny text-ink-3">
                      {c.count} {c.count === 1 ? 'person' : 'people'}
                      {c.orgs.filter((o) => o.org).length > 0 && ` · ${c.orgs.filter((o) => o.org).map((o) => o.org).join(', ')}`}
                    </span>
                  </span>
                  {c.due > 0 && <span className="slant bg-accent px-2 text-micro font-black text-white">{c.due} DUE</span>}
                  <ChevronDown className={cx('size-4 shrink-0 text-ink-3 transition', open && 'rotate-180')} />
                </button>
                <AnimatePresence initial={false}>
                  {open && (
                    <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden">
                      <div className="space-y-3 border-t border-line px-3 py-3" style={{ borderLeft: `3px solid ${meta.color}` }}>
                        {c.orgs.map((o) => (
                          <div key={o.org ?? ''}>
                            {o.org && (
                              <p className="mb-1.5 flex items-center gap-1.5 pl-1 text-micro font-black uppercase tracking-[0.2em] text-ink-3">
                                <span className="h-px w-3 bg-line-strong" /> {o.org} <span className="font-mono">· {o.people.length}</span>
                              </p>
                            )}
                            <ul className={cx('space-y-2', o.org && 'border-l border-line-strong pl-2')}>
                              <AnimatePresence initial={false}>{sortByDue(o.people).map(row)}</AnimatePresence>
                            </ul>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </Card>
            );
          })}
        </div>
      ) : (
        <div className="space-y-3">
          <Suspense fallback={<div className="kerb h-1.5 w-40 animate-pulse" />}>
            <CrewMap pins={pins} me={home} selected={city} onSelect={setCity} />
          </Suspense>
          {sel ? (
            <Card>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-display text-2xl font-black uppercase italic leading-tight">{sel.city}</p>
                  <p className="text-tiny text-ink-3">
                    {sel.people.length} {sel.people.length === 1 ? 'person' : 'people'}
                    {home && ` · ${Math.round(kmBetween(home, sel)).toLocaleString('en-IN')} km from ${home.city}`}
                  </p>
                </div>
                {sel.weather && (
                  <div className="text-right">
                    <p className="font-display text-3xl font-black italic leading-none">
                      {weatherOf(sel.weather.code, sel.weather.day).emoji} {Math.round(sel.weather.temp)}°
                    </p>
                    <p className="text-tiny text-ink-3">
                      {weatherOf(sel.weather.code, sel.weather.day).text}
                      {sel.weather.max != null && ` · ${Math.round(sel.weather.min!)}–${Math.round(sel.weather.max)}°`}
                    </p>
                  </div>
                )}
              </div>
              {sel.weather && weatherNudge(sel.people[0].name, sel.city, sel.weather) && <p className="mt-2 rounded-md bg-accent-soft px-3 py-2 text-sm text-ink-2">💬 {weatherNudge(sel.people[0].name, sel.city, sel.weather)}</p>}
              <ul className="mt-3 space-y-2">{sortByDue(sel.people).map(row)}</ul>
            </Card>
          ) : (
            <Card>
              <p className="mb-2 text-micro font-black uppercase tracking-[0.2em] text-ink-3">Cities</p>
              {pins.length === 0 ? (
                <p className="text-sm text-ink-3">Add a city to someone (tap them → City) and they appear on the map with their live weather.</p>
              ) : (
                <ul className="space-y-1.5">
                  {pins.map((p) => (
                    <li key={keyOf(p)}>
                      <button onClick={() => setCity(keyOf(p))} className="flex w-full items-center gap-3 rounded-md bg-bg px-3 py-2 text-left">
                        <MapPin className="size-4 shrink-0 text-accent" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-bold">{p.city}</span>
                          <span className="block truncate text-tiny text-ink-3">{p.people.map((x) => x.name).join(', ')}</span>
                        </span>
                        {p.weather && (
                          <span className="font-mono text-sm">
                            {weatherOf(p.weather.code, p.weather.day).emoji} {Math.round(p.weather.temp)}°
                          </span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {people.some((p) => p.lat == null) && <p className="mt-2 text-tiny text-ink-3">{people.filter((p) => p.lat == null).length} without a city yet.</p>}
            </Card>
          )}
          <button onClick={() => setHomeOpen(true)} className="flex w-full items-center gap-2 rounded-xl border border-line bg-surface px-4 py-3 text-left text-sm text-ink-2">
            <Home className="size-4 text-sky" /> {home ? `You’re in ${home.city}` : 'Set your city — see how far everyone is'}
            {home && weather(home) && <span className="ml-auto font-mono">{weatherOf(weather(home)!.code, weather(home)!.day).emoji} {Math.round(weather(home)!.temp)}°</span>}
          </button>
        </div>
      )}

      <ImportContactsSheet open={importing} onClose={() => setImporting(false)} />
      <PersonSheet
        person={editing}
        people={people}
        onClose={() => setEditing(null)}
        onSave={(p) => (p.id ? update(p as PersonRow) : void create(p), setEditing(null))}
        onDelete={(id) => (remove(id), setEditing(null))}
      />
      <Sheet open={homeOpen} onClose={() => setHomeOpen(false)} title="Your city">
        <CityPicker value={home?.city ?? null} onPick={(c) => (save({ home: c ? { city: c.name, lat: c.lat, lon: c.lon } : undefined }), setHomeOpen(false))} />
      </Sheet>
    </Page>
  );
}

function CrewRow({ p, t, gifts, weather, home, onOpen, onTalked }: { p: PersonRow; t: string; gifts: string[]; weather: Weather; home: { lat: number; lon: number } | null; onOpen: () => void; onTalked: () => void }) {
  const next = nextContact(p, t);
  const od = overdueDays(p, t);
  const due = next === t;
  const color = CIRCLES[p.circle ?? 'Other']?.color ?? '#9aa0ad';
  return (
    <motion.li layout {...listItem} className={cx('flex items-center gap-3 rounded-lg border bg-bg p-3', due ? 'border-accent/60' : 'border-line')}>
      <button onClick={onOpen} className="grid size-11 shrink-0 place-items-center rounded-full border-2 bg-surface-2 text-xl" style={{ borderColor: color }}>
        {p.emoji || p.name.slice(0, 1).toUpperCase()}
      </button>
      <button onClick={onOpen} className="min-w-0 flex-1 text-left">
        <p className="truncate font-bold">{p.name}</p>
        <p className="line-clamp-2 text-tiny text-ink-3">
          {rhythmLabel(p)}
          {next && ` · ${due ? (od > 0 ? `${od} d overdue` : 'due today') : `next ${relativeDay(next)}`}`}
          {p.last_contact && ` · last ${relativeDay(p.last_contact)}`}
        </p>
        {p.city && (
          <p className="truncate text-tiny text-ink-2">
            📍 {p.city}
            {weather && ` · ${weatherOf(weather.code, weather.day).emoji} ${Math.round(weather.temp)}°`}
            {home && p.lat != null && p.lon != null && kmBetween(home, { lat: p.lat, lon: p.lon }) > 30 && ` · ${Math.round(kmBetween(home, { lat: p.lat, lon: p.lon })).toLocaleString('en-IN')} km`}
          </p>
        )}
        {gifts.length > 0 && <p className="truncate text-tiny text-pink">🎁 {gifts.join(', ')}</p>}
      </button>
      {p.phone && (
        <a href={`tel:${p.phone}`} aria-label={`Call ${p.name}`} className="grid size-10 shrink-0 place-items-center rounded-md bg-surface-2 text-green">
          <Phone className="size-4" />
        </a>
      )}
      <button onClick={onTalked} aria-label={`Talked to ${p.name}`} className={cx('flex h-10 shrink-0 items-center gap-1 rounded-md px-3 text-mini font-bold uppercase', due ? 'bg-accent text-white' : 'bg-surface-2 text-ink-2')}>
        <Check className="size-4" /> <span className="max-sm:hidden">Talked</span>
      </button>
    </motion.li>
  );
}

type City = { name: string; region: string; lat: number; lon: number };

/** Search a city (Open-Meteo geocoding through the server), Indian places first. */
function CityPicker({ value, onPick }: { value: string | null; onPick: (c: City | null) => void }) {
  const [q, setQ] = useState('');
  const [term, setTerm] = useState('');
  const { data: results = [], isFetching } = useQuery({ queryKey: ['geo', term], queryFn: () => api<City[]>(`/geo/search?q=${encodeURIComponent(term)}`), enabled: term.length >= 2, staleTime: Infinity });
  return (
    <div className="space-y-2">
      <form onSubmit={(e) => (e.preventDefault(), setTerm(q.trim()))} className="flex gap-2">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={value ?? 'Jaipur, Bengaluru, Pune…'} enterKeyHint="search" />
        <Button type="submit" variant="soft" aria-label="Search city">
          {isFetching ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
        </Button>
      </form>
      {results.length > 0 && (
        <ul className="space-y-1">
          {results.map((c) => (
            <li key={`${c.lat},${c.lon}`}>
              <button type="button" onClick={() => (onPick(c), setQ(''), setTerm(''))} className="flex w-full items-center gap-2 rounded-md bg-bg px-3 py-2 text-left text-sm">
                <MapPin className="size-3.5 text-accent" /> <b>{c.name}</b> <span className="truncate text-ink-3">{c.region}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {value && (
        <button type="button" onClick={() => onPick(null)} className="text-tiny text-ink-3 underline">
          Clear {value}
        </button>
      )}
    </div>
  );
}

function PersonSheet({ person, people, onClose, onSave, onDelete }: { person: Partial<PersonRow> | null; people: PersonRow[]; onClose: () => void; onSave: (p: Partial<PersonRow>) => void; onDelete: (id: string) => void }) {
  const [d, setD] = useState<Partial<PersonRow>>(person ?? BLANK);
  const { data: contacts = [] } = useList<ContactRow>('contacts');
  const [was, setWas] = useState(person);
  if (person !== was) (setWas(person), person && setD(person));
  const label = 'text-micro font-black uppercase tracking-[0.2em] text-ink-3';
  const weekly = (d.every_days ?? 0) > 0 && (d.every_days ?? 0) % 7 === 0;
  return (
    <Sheet open={!!person} onClose={onClose} title={d.id ? d.name : 'Add a person'}>
      <form className="space-y-4" onSubmit={(e) => (e.preventDefault(), d.name?.trim() && onSave({ ...d, name: d.name.trim() }))}>
        <div className="grid grid-cols-[4rem_1fr] gap-2">
          <Input value={d.emoji ?? ''} onChange={(e) => setD({ ...d, emoji: e.target.value || null })} placeholder="👩" className="text-center text-xl" aria-label="Emoji" />
          <Input value={d.name ?? ''} onChange={(e) => setD({ ...d, name: e.target.value })} placeholder="Name — Mom, Rahul…" autoFocus={!d.id} />
        </div>
        {!d.id && (d.name?.trim().length ?? 0) >= 2 && (
          <div className="flex flex-wrap gap-1.5">
            {contacts
              .filter((c) => c.name.toLowerCase().includes(d.name!.trim().toLowerCase()))
              .slice(0, 5)
              .map((c) => (
                <button type="button" key={c.id} onClick={() => setD({ ...d, name: c.name, phone: c.phone, birthday: c.birthday ?? d.birthday ?? null })} className="flex items-center gap-1.5 rounded-md bg-surface-2 px-2.5 py-1.5 text-mini text-ink-2">
                  <BookUser className="size-3.5" /> {c.name}
                </button>
              ))}
          </div>
        )}
        <div>
          <p className={label}>Circle</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {CIRCLE_ORDER.map((c) => (
              <button type="button" key={c} onClick={() => setD({ ...d, circle: d.circle === c ? null : c })} className={cx('h-9 rounded-md px-2.5 text-tiny font-bold', d.circle === c ? 'text-white' : 'bg-surface-2 text-ink-2')} style={d.circle === c ? { background: CIRCLES[c].color } : undefined}>
                {CIRCLES[c].emoji} {c}
              </button>
            ))}
          </div>
          {d.circle && CIRCLES[d.circle]?.org && (
            <>
              <Input className="mt-2" list="crew-orgs" value={d.org ?? ''} onChange={(e) => setD({ ...d, org: e.target.value || null })} placeholder={`${CIRCLES[d.circle].org} — e.g. ${d.circle === 'Work' ? 'Google' : d.circle === 'College' ? 'IIT Delhi' : d.circle === 'Family' ? 'Mom’s side' : 'name'}`} />
              <datalist id="crew-orgs">
                {[...new Set(people.filter((p) => p.circle === d.circle && p.org).map((p) => p.org!))].map((o) => (
                  <option key={o} value={o} />
                ))}
              </datalist>
            </>
          )}
        </div>
        <div>
          <p className={label}>City {d.city && <span className="normal-case tracking-normal text-ink-2">· {d.city}</span>}</p>
          <div className="mt-2">
            <CityPicker value={d.city ?? null} onPick={(c) => setD({ ...d, city: c?.name ?? null, lat: c?.lat ?? null, lon: c?.lon ?? null })} />
          </div>
        </div>
        <Input type="tel" inputMode="tel" value={d.phone ?? ''} onChange={(e) => setD({ ...d, phone: e.target.value || null })} placeholder="Phone (for the Call button)" />
        <label className="block">
          <span className={label}>Birthday</span>
          <input type="date" value={d.birthday?.length === 10 ? d.birthday : ''} onChange={(e) => setD({ ...d, birthday: e.target.value || null })} className="field mt-2" />
          <span className="mt-1 block text-tiny text-ink-3">Year unknown? Pick any year — only the day and month matter.</span>
        </label>
        <div>
          <p className={label}>Talk every</p>
          <div className="mt-2 grid grid-cols-5 gap-1.5">
            {RHYTHMS.map((r) => (
              <button type="button" key={r.label} onClick={() => setD({ ...d, every_days: r.every })} className={cx('h-10 rounded-md text-mini font-bold uppercase', (d.every_days ?? 0) === r.every ? 'bg-accent text-white' : 'bg-surface-2 text-ink-2')}>
                {r.label}
              </button>
            ))}
          </div>
          {weekly && (
            <div className="mt-2 grid grid-cols-8 gap-1">
              <button type="button" onClick={() => setD({ ...d, weekday: null })} className={cx('h-9 rounded-md text-tiny font-bold', d.weekday == null ? 'bg-ink text-bg' : 'bg-surface-2 text-ink-3')}>
                Any
              </button>
              {DAYS.map((x, i) => (
                <button type="button" key={x} onClick={() => setD({ ...d, weekday: i })} className={cx('h-9 rounded-md text-tiny font-bold', d.weekday === i ? 'bg-ink text-bg' : 'bg-surface-2 text-ink-3')}>
                  {x}
                </button>
              ))}
            </div>
          )}
          {(d.every_days ?? 0) > 0 && (
            <label className="mt-2 flex items-center gap-2 text-sm text-ink-2">
              Remind at <input type="time" value={d.call_at ?? '19:00'} onChange={(e) => setD({ ...d, call_at: e.target.value })} className="field h-9 w-28 !py-0" />
            </label>
          )}
        </div>
        <Textarea rows={2} value={d.notes ?? ''} onChange={(e) => setD({ ...d, notes: e.target.value || null })} placeholder="Notes — ask about her knee, his new job…" />
        <div className="flex gap-2">
          {d.id && (
            <Button type="button" variant="danger" onClick={() => onDelete(d.id!)}>
              <Trash2 className="size-4" />
            </Button>
          )}
          <Button type="submit" className="flex-1" disabled={!d.name?.trim()}>
            Save
          </Button>
        </div>
      </form>
    </Sheet>
  );
}
