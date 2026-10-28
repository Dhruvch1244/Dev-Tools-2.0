import { useEffect, useState } from 'react';
import { Bell } from 'lucide-react';
import { useSettings } from '../lib/api';
import { CURRENCIES } from '../lib/categories';
import { Button, Chip, Input, Sheet } from './ui';

export function SettingsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { settings, save } = useSettings();
  const [name, setName] = useState('');
  const [perm, setPerm] = useState(() => ('Notification' in window ? Notification.permission : 'denied'));

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
        <section className="flex items-center justify-between gap-3 rounded-2xl border border-line p-4">
          <div>
            <p className="text-sm font-medium">Task reminders</p>
            <p className="text-xs text-ink-3">{perm === 'granted' ? 'On for this device' : perm === 'denied' ? 'Blocked — allow notifications in browser settings' : 'Get a ping when a timed task is due'}</p>
          </div>
          {perm === 'default' && (
            <Button size="sm" variant="soft" onClick={async () => setPerm(await Notification.requestPermission())}>
              <Bell className="size-4" /> Enable
            </Button>
          )}
        </section>
      </div>
    </Sheet>
  );
}
