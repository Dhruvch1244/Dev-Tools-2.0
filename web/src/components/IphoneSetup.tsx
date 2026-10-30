import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, Copy, MapPin, Smartphone, Trash2 } from 'lucide-react';
import { api, useSettings } from '../lib/api';
import { timeAgo } from '../lib/format';
import { PLACE_KINDS, placeId, type Place, type PlaceKind } from '../core/places';
import { widgetScript } from '../core/widget';
import { Button, cx } from './ui';
import { useToast } from './toast';

function useCopy() {
  const toast = useToast();
  return async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ message: `${what} copied` });
    } catch {
      toast({ message: 'Couldn’t copy — long-press the text to copy it instead' });
    }
  };
}

function Steps({ title, steps }: { title: string; steps: React.ReactNode[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-md bg-surface-2">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center justify-between px-3 py-2 text-left text-tiny font-bold uppercase text-ink-2">
        {title} <ChevronDown className={cx('size-4 transition', open && 'rotate-180')} />
      </button>
      {open && (
        <ol className="list-decimal space-y-1.5 pb-3 pl-8 pr-3 text-xs text-ink-2">
          {steps.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ol>
      )}
    </div>
  );
}

/** Places for iPhone location automations: each gets an arrive and a leave URL to paste into Shortcuts. */
export function PlacesSection() {
  const { settings, save } = useSettings();
  const toast = useToast();
  const copy = useCopy();
  const places = settings.places ?? [];
  const [name, setName] = useState('');
  const [kind, setKind] = useState<PlaceKind>('gym');
  const { data: log = [] } = useQuery({ queryKey: ['places', 'log'], queryFn: () => api<{ place: string; event: string; at: string }[]>('/hook/places/log') });
  const origin = window.location.origin;
  const url = (p: Place, e: 'arrive' | 'leave') => `${origin}/api/hook/place/${p.id}/${e}`;
  const add = () => {
    const n = name.trim();
    if (!n) return;
    let id = placeId(n);
    while (places.some((p) => p.id === id)) id = `${id}-2`;
    save({ places: [...places, { id, name: n, kind }] });
    setName('');
  };
  const test = async (p: Place, e: 'arrive' | 'leave') => {
    const r = await api<{ message: string; push: { title: string; body: string } | null }>(`/hook/place/${p.id}/${e}?test=1`);
    toast({ message: r.push ? `${r.push.title} — ${r.push.body}` : r.message });
  };
  return (
    <section className="space-y-3 rounded-xl border border-line p-4">
      <div>
        <p className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide">
          <MapPin className="size-4 text-accent" /> Places
        </p>
        <p className="mt-1 text-xs text-ink-3">Your iPhone tells the app when you arrive at or leave a place (iOS does the location part — the app only hears “arrived at gym”).</p>
      </div>
      {places.map((p) => {
        const last = log.find((l) => l.place === p.id);
        const k = PLACE_KINDS[p.kind];
        return (
          <div key={p.id} className="space-y-2 rounded-md border border-line bg-bg p-3">
            <div className="flex items-center gap-2">
              <span className="text-lg">{k.emoji}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold">{p.name}</span>
                <span className="block text-tiny text-ink-3">{last ? `Last: ${last.event === 'arrive' ? 'arrived' : 'left'} ${timeAgo(last.at)}` : 'Not triggered yet'}</span>
              </span>
              <button onClick={() => save({ places: places.filter((x) => x.id !== p.id) })} aria-label={`Remove ${p.name}`} className="p-1 text-ink-3">
                <Trash2 className="size-4" />
              </button>
            </div>
            {(['arrive', 'leave'] as const).map((e) => (
              <div key={e} className="flex items-center gap-2">
                <span className="w-12 shrink-0 text-micro font-black uppercase text-ink-3">{e === 'arrive' ? 'Arrive' : 'Leave'}</span>
                <span className="min-w-0 flex-1 truncate text-tiny text-ink-2" title={k[e]}>
                  {k[e]}
                </span>
                <button onClick={() => void test(p, e)} className="rounded-md bg-surface-2 px-2 py-1 text-tiny font-bold uppercase">
                  Test
                </button>
                <button onClick={() => void copy(url(p, e), 'URL')} className="flex items-center gap-1 rounded-md bg-accent px-2 py-1 text-tiny font-bold uppercase text-white">
                  <Copy className="size-3" /> URL
                </button>
              </div>
            ))}
          </div>
        );
      })}
      <form onSubmit={(e) => (e.preventDefault(), add())} className="space-y-2">
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(PLACE_KINDS) as PlaceKind[]).map((k) => (
            <button type="button" key={k} onClick={() => setKind(k)} className={cx('rounded-md px-2.5 py-1.5 text-tiny font-bold', k === kind ? 'bg-accent text-white' : 'bg-surface-2 text-ink-2')}>
              {PLACE_KINDS[k].emoji} {PLACE_KINDS[k].label}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder={kind === 'gym' ? 'e.g. Cult HSR' : kind === 'office' ? 'e.g. Office' : 'Name'} enterKeyHint="done" className="field h-10 flex-1 text-sm" />
          <Button size="sm" type="submit" disabled={!name.trim()}>
            Add
          </Button>
        </div>
      </form>
      <Steps
        title="Set it up on iPhone (2 min per place)"
        steps={[
          <>Tap <b>URL</b> next to Arrive above to copy it.</>,
          <>Open <b>Shortcuts</b> → <b>Automation</b> → <b>+</b> → <b>Arrive</b>.</>,
          <>Choose the location (search the gym/office), keep the radius small, pick <b>Run Immediately</b>, then <b>Next</b>.</>,
          <>Tap <b>New Blank Automation</b> → add the action <b>Get Contents of URL</b> → paste the URL. Done.</>,
          <>Repeat with <b>Leave</b> and the Leave URL.</>,
          <>Tailscale must be connected — in the Tailscale app turn on <b>VPN On Demand</b> so it’s always on.</>,
          <>Allow Shortcuts “Always” location access if iOS asks. Check it works: the place here shows “Last: arrived…”.</>,
        ]}
      />
    </section>
  );
}

/** The Scriptable home/lock-screen widget: copy the script, paste it into Scriptable, add the widget. */
export function WidgetSection() {
  const copy = useCopy();
  const script = widgetScript(window.location.origin);
  return (
    <section className="space-y-3 rounded-xl border border-line p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide">
            <Smartphone className="size-4 text-accent" /> iPhone widget
          </p>
          <p className="mt-1 text-xs text-ink-3">Gym day, calories and protein left, water, habits, Daily 3 and what’s next — on your home screen and lock screen. Refreshes about every 15 min.</p>
        </div>
        <Button size="sm" onClick={() => void copy(script, 'Widget script')}>
          <Copy className="size-4" /> Script
        </Button>
      </div>
      <Steps
        title="Set it up (3 min, once)"
        steps={[
          <>Install <b>Scriptable</b> from the App Store (free).</>,
          <>Tap <b>Script</b> above to copy it. In Scriptable tap <b>+</b>, paste, and name it <b>Pit Wall</b> (tap the title at the top). Tap ▶︎ to preview.</>,
          <>Home screen: long-press → <b>Edit</b> → <b>Add Widget</b> → <b>Scriptable</b> → pick Small, Medium or Large → <b>Add</b>.</>,
          <>Long-press the new widget → <b>Edit Widget</b> → Script: <b>Pit Wall</b>.</>,
          <>Lock screen: long-press the lock screen → <b>Customize</b> → <b>Lock Screen</b> → add a Scriptable widget → Script: <b>Pit Wall</b>.</>,
          <>Tailscale needs to be on for it to refresh (VPN On Demand). When it can’t reach the laptop it shows the last numbers.</>,
        ]}
      />
    </section>
  );
}
