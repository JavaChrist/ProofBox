self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }
  const title =
    data.title ||
    (data.notification && data.notification.title) ||
    "Notification";
  const body = data.body || (data.notification && data.notification.body) || "";
  const icon =
    data.icon ||
    (data.notification && data.notification.icon) ||
    "/icon-192.png";
  const badge =
    data.badge ||
    (data.notification && data.notification.badge) ||
    "/icon-192.png";
  const options = { body, icon, badge, data: data.data || {} };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url =
    (event.notification &&
      event.notification.data &&
      event.notification.data.url) ||
    "/";
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if ("focus" in client) return client.focus();
        }
        if (self.clients.openWindow) return self.clients.openWindow(url);
      })
  );
});
