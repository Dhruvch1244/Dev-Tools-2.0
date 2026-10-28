import { useEffect, useState } from 'react';
import { Bell, Monitor, Moon, Sun } from 'lucide-react';
import { useSettings } from '../lib/api';
import { CURRENCIES } from '../lib/categories';
import { Button, Chip, Input, Segmented, Sheet } from './ui';

type Theme = 'system' | 'dark' | 'light';

function applyTheme(t: Theme) {
  if (t === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = t;
  try {
    localStorage.setItem('theme', t);
  } catch {}
}

export function SettingsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { settings, save } = useSettings();
  const [name, setName] = useState('');
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      return (localStorage.getItem('theme') as Theme) ?? 'system';
    } catch {
      return 'system';
    }
  });
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
          <p className="mb-2 text-sm font-medium text-ink-2">Appearance <span className="text-ink-3">(this device)</span></p>
          <Segmented
            className="w-full"
            value={theme}
            onChange={(t) => (setTheme(t), applyTheme(t))}
            options={[
              { value: 'system', label: <span className="flex items-center gap-1.5"><Monitor className="size-3.5" />Auto</span> },
              { value: 'dark', label: <span className="flex items-center gap-1.5"><Moon className="size-3.5" />Dark</span> },
              { value: 'light', label: <span className="flex items-center gap-1.5"><Sun className="size-3.5" />Light</span> },
            ]}
          />
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
