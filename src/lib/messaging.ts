import { getMessaging, getToken, isSupported } from 'firebase/messaging';
import { firebaseApp } from './firebase';
import { saveFcmToken } from './db';

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return null;
  try {
    const reg = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
    return reg;
  } catch {
    return null;
  }
}

export async function initMessagingForUser(uid: string): Promise<string | null> {
  if (!(await isSupported())) return null;
  const vapidKey = (import.meta as any).env?.VITE_FIREBASE_VAPID_KEY as string | undefined;
  if (!vapidKey) return null;
  const reg = await registerServiceWorker();
  const messaging = getMessaging(firebaseApp);
  const token = await getToken(messaging, { vapidKey, serviceWorkerRegistration: reg || undefined });
  if (token) await saveFcmToken(uid, token);
  return token || null;
}


