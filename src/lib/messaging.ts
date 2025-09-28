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

  // S'assurer que la permission est accordée
  try {
    if (typeof Notification !== 'undefined' && Notification.permission !== 'granted') {
      const res = await Notification.requestPermission();
      if (res !== 'granted') return null;
    }
  } catch { /* ignore */ }

  const messaging = getMessaging(firebaseApp);

  async function attemptGetToken(): Promise<string | null> {
    const reg = await registerServiceWorker();
    return await getToken(messaging, { vapidKey, serviceWorkerRegistration: reg || undefined });
  }

  try {
    const token = await attemptGetToken();
    if (token) await saveFcmToken(uid, token);
    return token || null;
  } catch (e) {
    // Réessaie en nettoyant les SW existants (certaines extensions/browsers corrompent l’état)
    try {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(r => r.unregister().catch(() => false)));
    } catch { /* ignore */ }
    try {
      const token = await attemptGetToken();
      if (token) await saveFcmToken(uid, token);
      return token || null;
    } catch {
      return null;
    }
  }
}

// Petit utilitaire de debug accessible depuis la console
try {
  (window as any).debugFcm = async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const uid = (window as any).proofboxUserId as string | undefined;
    if (!uid) return null;
    return await initMessagingForUser(uid);
  };
} catch { }


