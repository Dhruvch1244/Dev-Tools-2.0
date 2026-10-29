// Imported into the generated Workbox service worker (vite.config.ts → workbox.importScripts).
// Runs with the app closed: shows reminders and handles their buttons without opening a window.

self.addEventListener('push', (event) => {
  const d = event.data ? event.data.json() : {};
  event.waitUntil(
    self.registration.showNotification(d.title || 'Reminder', {
      body: d.body || '',
      tag: d.tag,
      renotify: true,
      requireInteraction: true,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: d,
      actions:
        d.actions ??
        (d.taskId
          ? [
              { action: 'done', title: '✓ Mark done' },
              { action: 'snooze', title: '⏰ Snooze 10 min' },
            ]
          : []),
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  const d = event.notification.data || {};
  event.notification.close();

  // "Call" opens the dialer; other action buttons are handled server-side without opening the app.
  if (event.action === 'call' && d.tel) {
    event.waitUntil(self.clients.openWindow(`tel:${d.tel}`));
    return;
  }
  // Action buttons are handled server-side without opening the app.
  if (event.action && (d.taskId || d.routineId || d.suppId || d.personId || event.action === 'water')) {
    event.waitUntil(
      fetch('/api/push/action', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ taskId: d.taskId, routineId: d.routineId, suppId: d.suppId, personId: d.personId, action: event.action }),
      }),
    );
    return;
  }

  const url = d.url || '/tasks';
  event.waitUntil(
    (async () => {
      // External links (e.g. a contest page) open in a new window; app routes reuse an open tab.
      if (/^https?:/.test(url) && !url.startsWith(self.location.origin)) return self.clients.openWindow(url);
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const w of windows) {
        await w.focus();
        if ('navigate' in w) await w.navigate(url);
        return;
      }
      return self.clients.openWindow(url);
    })(),
  );
});
