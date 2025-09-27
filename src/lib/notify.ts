export async function ensureNotificationPermission(): Promise<boolean> {
  if (typeof window === "undefined" || !("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  const res = await Notification.requestPermission();
  return res === "granted";
}

export async function showLocalNotification(title: string, body?: string): Promise<void> {
  try {
    const granted = await ensureNotificationPermission();
    if (!granted) return;
    const opts: NotificationOptions = {
      body,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
    };
    if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg && "showNotification" in reg) {
        await reg.showNotification(title, opts);
        return;
      }
    }
    // Fallback direct notification (si pas de SW)
    // eslint-disable-next-line no-new
    new Notification(title, opts);
  } catch {
    // noop
  }
}

// ATTENTION: timers côté client ne survivent pas au rafraîchissement/fermeture de l’onglet
export function scheduleLocalNotification(when: Date, title: string, body?: string): void {
  const delay = when.getTime() - Date.now();
  if (!isFinite(delay)) return;
  if (delay <= 0) {
    void showLocalNotification(title, body);
    return;
  }
  // Cap à 7 jours pour éviter des timers trop longs
  const MAX_DELAY = 1000 * 60 * 60 * 24 * 7;
  if (delay > MAX_DELAY) return;
  setTimeout(() => { void showLocalNotification(title, body); }, delay);
}


