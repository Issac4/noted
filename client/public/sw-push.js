// Service Worker Push Notification Handler for Noted PWA
// Strict Notification Protocol (PRD Section 4):
// 1. Proxy Task Capture Alert
// 2. Critical Hard Deadlines (D-3, D-1, D-0 at 9:00 AM)

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload = {
    title: "Noted",
    body: "You have a new household alert.",
    tag: "noted-push",
    url: "/",
  };

  try {
    const parsed = event.data.json();
    payload = { ...payload, ...parsed };
  } catch {
    payload.body = event.data.text();
  }

  const options = {
    body: payload.body,
    icon: "/pwa-192x192.png",
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
