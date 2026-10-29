import { useEffect } from 'react';
import { useList } from './api';
import type { Task } from './types';
import { pushFlag } from './push';

const FIRED_KEY = 'reminders-fired';

function fired(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(FIRED_KEY) ?? '[]'));
  } catch {
    return new Set();
  }
}

/**
 * Fallback for devices without push: fires a notification while the app is open. Devices with
 * push enabled get the server's notification instead, so this stays quiet there to avoid doubles.
 */
export function useReminders() {
  const { data: tasks } = useList<Task>('tasks');
  useEffect(() => {
    if (!tasks) return;
    const check = () => {
      const done = fired();
      const now = Date.now();
      for (const t of tasks) {
        if (t.done || !t.due?.includes('T') || done.has(t.id + t.due)) continue;
        const at = new Date(t.due).getTime();
        if (at <= now && now - at < 6 * 3600_000) {
          done.add(t.id + t.due);
          if ('Notification' in window && Notification.permission === 'granted' && !pushFlag()) {
            navigator.serviceWorker?.ready
              .then((reg) => reg.showNotification('⏰ ' + t.title, { body: 'Due now', tag: t.id, icon: '/icon-192.png' }))
              .catch(() => new Notification('⏰ ' + t.title, { body: 'Due now' }));
          }
        }
      }
      try {
        localStorage.setItem(FIRED_KEY, JSON.stringify([...done].slice(-300)));
      } catch {}
    };
    check();
    const id = setInterval(check, 20_000);
    return () => clearInterval(id);
  }, [tasks]);
}
