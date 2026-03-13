/// <reference lib="es2020" />
/// <reference lib="dom" />
/// <reference lib="webworker" />

import { createHandlerBoundToURL, precacheAndRoute } from "workbox-precaching";
import { NavigationRoute, registerRoute } from "workbox-routing";
import { CacheFirst } from "workbox-strategies";

declare const self: ServiceWorkerGlobalScope;

type PushNotificationData = {
  createdAt?: number;
  outerEventId?: string;
  recipientPubkey?: string;
  relayHints?: string[];
  type?: string;
};

type PushNotificationEnvelope = {
  body?: string;
  data?: PushNotificationData;
  title?: string;
};

function isRecord(
  value: unknown,
): value is Record<string | number | symbol, unknown> {
  return typeof value === "object" && value !== null;
}

function readPushEnvelope(value: unknown): PushNotificationEnvelope | null {
  if (!isRecord(value)) return null;

  const rawData = value.data;
  const data = isRecord(rawData)
    ? {
        ...(typeof rawData.createdAt === "number" &&
        Number.isFinite(rawData.createdAt)
          ? { createdAt: rawData.createdAt }
          : {}),
        ...(typeof rawData.outerEventId === "string" &&
        rawData.outerEventId.trim().length > 0
          ? { outerEventId: rawData.outerEventId }
          : {}),
        ...(typeof rawData.recipientPubkey === "string" &&
        rawData.recipientPubkey.trim().length > 0
          ? { recipientPubkey: rawData.recipientPubkey }
          : {}),
        ...(Array.isArray(rawData.relayHints)
          ? {
              relayHints: rawData.relayHints.filter(
                (entry): entry is string =>
                  typeof entry === "string" && entry.trim().length > 0,
              ),
            }
          : {}),
        ...(typeof rawData.type === "string" && rawData.type.trim().length > 0
          ? { type: rawData.type }
          : {}),
      }
    : undefined;

  return {
    ...(typeof value.body === "string" && value.body.trim().length > 0
      ? { body: value.body }
      : {}),
    ...(data ? { data } : {}),
    ...(typeof value.title === "string" && value.title.trim().length > 0
      ? { title: value.title }
      : {}),
  };
}

precacheAndRoute(self.__WB_MANIFEST || []);

registerRoute(
  ({ request }: { request: Request }) => request.destination === "image",
  new CacheFirst({
    cacheName: "linky-runtime-images-v1",
  }),
);

registerRoute(new NavigationRoute(createHandlerBoundToURL("index.html")));

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let envelope: PushNotificationEnvelope | null = null;
  try {
    envelope = readPushEnvelope(event.data.json());
  } catch {
    envelope = null;
  }
  if (!envelope) return;

  const data = envelope.data ?? { type: "nostr_inbox" };
  const options: NotificationOptions = {
    badge: "/pwa-192x192.png",
    body: envelope.body ?? "New message",
    data,
    icon: "/pwa-192x192.png",
    requireInteraction: false,
    tag: data.outerEventId ?? "linky-inbox",
  };

  if ("setAppBadge" in navigator) {
    navigator.setAppBadge().catch(() => {
      // ignore badge failures
    });
  }

  console.info("[linky][sw] push received", data);
  void self.clients
    .matchAll({ type: "window", includeUncontrolled: true })
    .then((clientList) => {
      for (const client of clientList) {
        client.postMessage({
          data,
          type: "push-received",
        });
      }
    });

  event.waitUntil(
    self.registration.showNotification(envelope.title ?? "Linky", options),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  if ("clearAppBadge" in navigator) {
    navigator.clearAppBadge().catch(() => {
      // ignore badge failures
    });
  }

  console.info("[linky][sw] notification click");
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if (client.url && "focus" in client) {
            return client.navigate("/").then(() => client.focus());
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow("/");
        }
      }),
  );
});

self.addEventListener("activate", () => {
  // Let new SW versions take over on the next navigation instead of claiming
  // an already-booting dev page, which can break Vite's dynamic imports.
});
