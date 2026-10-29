import { useEffect, useState } from 'react';
import { Bell, BellOff, Send } from 'lucide-react';
import { useSettings } from '../lib/api';
import { CURRENCIES } from '../lib/categories';
import { disablePush, enablePush, pushState, sendTestPush, type PushState } from '../lib/push';
import { Button, Chip, Input, Sheet } from './ui';
import { useToast } from './toast';

const PUSH_COPY: Record<PushState, string> = {
  on: 'On for this device — reminders arrive even when the app is closed. Notifications have Mark done and Snooze 10 min buttons.',
  off: 'Get a push notification when a timed task is due, even with the app closed.',
  denied: 'Notifications are blocked for this site — allow them in your browser / phone settings, then reopen this.',
  unsupported: 'Not available here. Push works in the built app (npm start) and the installed phone app — not in npm run dev.',
  insecure: 'Push needs HTTPS. Open the app through its https://….ts.net address (or localhost on the laptop).',
};

function PushSection() {
  const toast = useToast();
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => void pushState().then(setState), []);
  const act = async (fn: () => Promise<PushState>) => {
    setBusy(true);
    try {
      setState(await fn());
    } catch (e) {
      toast({ message: `Couldn't change push: ${(e as Error).message}` });
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="rounded-xl border border-line p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide">
            Push reminders
            {state === 'on' && <span className="slant bg-green px-2 text-[10px] font-black text-black">ON</span>}
          </p>
          <p className="mt-1 text-xs text-ink-3">{state ? PUSH_COPY[state] : 'Checking…'}</p>
        </div>
        {state === 'off' && (
          <Button size="sm" disabled={busy} onClick={() => act(enablePush)}>
            <Bell className="size-4" /> Enable
          </Button>
        )}
      </div>
      {state === 'on' && (
        <div className="mt-3 flex gap-2">
          <Button
            size="sm"
            variant="soft"
            disabled={busy}
            onClick={async () => {
              const r = await sendTestPush();
              toast({ message: `Test sent to ${r.sent} of ${r.devices} device(s)` });
            }}
          >
            <Send className="size-4" /> Send test
          </Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => act(disablePush)}>
            <BellOff className="size-4" /> Turn off here
          </Button>
        </div>
      )}
    </section>
  );
}

export function SettingsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { settings, save } = useSettings();
  const [name, setName] = useState('');

  useEffect(() => setName(settings.name ?? ''), [settings.name, open]);

  return (
    <Sheet open={open} onClose={onClose} title="Settings">
      <div className="space-y-6">
        <section>
          <p className="mb-2 text-sm font-medium text-ink-2">Your name</p>
          <Input value={name} placeholder="What should I call you?" onChange={(e) => setName(e.target.value)} onBlur={() => save({ name: name.trim() })} />
        </section>
        <section>
          <p className="mb-2 text-sm font-medium text-ink-2">Currency</p>
          <div className="flex flex-wrap gap-2">
            {CURRENCIES.map((c) => (
              <Chip key={c} active={(settings.currency ?? 'INR') === c} onClick={() => save({ currency: c })}>
                {c}
              </Chip>
            ))}
          </div>
        </section>
        <section>
          <p className="mb-2 text-sm font-medium text-ink-2">Daily water goal (glasses)</p>
          <Input type="number" min={1} max={20} value={settings.waterGoal ?? 8} onChange={(e) => save({ waterGoal: Number(e.target.value) || 8 })} className="w-28" />
        </section>
        {open && <PushSection />}
      </div>
    </Sheet>
  );
}
