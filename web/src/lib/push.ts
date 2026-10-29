import { api } from './api';

export type PushState = 'unsupported' | 'insecure' | 'denied' | 'off' | 'on';

// The in-app reminder hook checks this so a device with push doesn't get two notifications.
const FLAG = 'push-on';
export const pushFlag = () => {
  try {
    return localStorage.getItem(FLAG) === '1';
  } catch {
    return false;
  }
};
const setFlag = (on: boolean) => {
  try {
    if (on) localStorage.setItem(FLAG, '1');
    else localStorage.removeItem(FLAG);
  } catch {}
};

/** VAPID keys are base64url; PushManager wants raw bytes. */
function keyBytes(b64: string) {
  const s = atob((b64 + '='.repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

/**
 * The service worker only exists in the built app (`npm start` / installed PWA), not `npm run dev`,
 * and push needs a secure context — localhost or the Tailscale https://….ts.net address.
 */
async function registration() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return null;
  return Promise.race([navigator.serviceWorker.ready, new Promise<null>((r) => setTimeout(() => r(null), 3000))]);
}

export async function pushState(): Promise<PushState> {
  if (!window.isSecureContext) return 'insecure';
  const reg = await registration();
  if (!reg) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  const sub = await reg.pushManager.getSubscription();
  setFlag(!!sub && Notification.permission === 'granted');
  return sub && Notification.permission === 'granted' ? 'on' : 'off';
}

export async function enablePush(): Promise<PushState> {
  const reg = await registration();
  if (!reg) return 'unsupported';
  if ((await Notification.requestPermission()) !== 'granted') return 'denied';
  const { publicKey } = await api<{ publicKey: string }>('/push/key');
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) }));
  await api('/push/subscribe', { method: 'POST', body: JSON.stringify(sub.toJSON()) });
  setFlag(true);
  return 'on';
}

export async function disablePush(): Promise<PushState> {
  const reg = await registration();
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    await api('/push/unsubscribe', { method: 'POST', body: JSON.stringify({ endpoint: sub.endpoint }) });
    await sub.unsubscribe();
  }
  setFlag(false);
  return 'off';
}

export const sendTestPush = () => api<{ devices: number; sent: number }>('/push/test', { method: 'POST' });
