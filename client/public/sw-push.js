// Service Worker Push Notification Handler for Noted PWA
// Assigned tasks and daily critical reminders.
// Always show a visible notification, including for a push with no payload.

self.addEventListener("push", (event) => {
  let payload = {
    title: "Noted",
    body: "You have a new household alert.",
    tag: "noted-push",
    url: "/",
  };

  try {
    const parsed = event.data ? event.data.json() : {};
    payload = { ...payload, ...parsed };
  } catch {
    payload.body = event.data ? event.data.text() : payload.body;
  }

  const options = {
    body: payload.body,
    icon: "/icons/shigoto-v1-192.png",
    badge: "/pwa-192x192.png",
    tag: payload.tag || "noted-push",
    renotify: true,
    vibrate: [100, 50, 100],
    data: {
      url: payload.url || "/",
    },
  };

  event.waitUntil(self.registration.showNotification(payload.title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if ("focus" in client) {
            return client.focus();
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl);
        }
      })
  );
});
