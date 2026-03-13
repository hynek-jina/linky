/// <reference lib="es2020" />
/// <reference lib="dom" />
/// <reference lib="webworker" />

import { createHandlerBoundToURL, precacheAndRoute } from "workbox-precaching";
import { NavigationRoute, registerRoute } from "workbox-routing";
import { CacheFirst } from "workbox-strategies";
import { appendPushDebugLog } from "./utils/pushDebugLog";

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

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error ?? "");
}

async function postClientMessage(
  message: Record<string, unknown>,
): Promise<void> {
  const clientList = await self.clients.matchAll({
    type: "window",
    includeUncontrolled: true,
  });
  for (const client of clientList) {
    client.postMessage(message);
  }
}

async function getWindowClients(): Promise<readonly WindowClient[]> {
  return self.clients.matchAll({
    type: "window",
    includeUncontrolled: true,
  });
}

async function logSw(message: string, details?: unknown): Promise<void> {
  await appendPushDebugLog("sw", message, details);
}

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

self.addEventListener("install", (event) => {
  event.waitUntil(logSw("service worker install"));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(logSw("service worker activate"));
});

self.addEventListener("error", (event: ErrorEvent) => {
  void logSw("service worker error", {
    filename: event.filename,
    line: event.lineno,
    message: event.message,
  });
});

self.addEventListener("unhandledrejection", (event: PromiseRejectionEvent) => {
  void logSw("service worker unhandled rejection", {
    reason: describeError(event.reason),
  });
});

self.addEventListener("push", (event) => {
  if (!event.data) {
    event.waitUntil(logSw("push event without data"));
    return;
  }

  let envelope: PushNotificationEnvelope | null = null;
  try {
    envelope = readPushEnvelope(event.data.json());
  } catch (error) {
    event.waitUntil(
      logSw("push event JSON parse failed", {
        error: describeError(error),
      }),
    );
    envelope = null;
  }
  if (!envelope) {
    event.waitUntil(logSw("push event ignored because envelope was invalid"));
    return;
  }

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
  event.waitUntil(
    (async () => {
      const clientList = await getWindowClients();
      const hasWindowClient = clientList.length > 0;

      await Promise.all([
        logSw("push received", {
          data,
          hasWindowClient,
          tag: options.tag ?? null,
          title: envelope.title ?? "Linky",
        }),
        postClientMessage({
          data,
          type: "push-received",
        }),
        hasWindowClient
          ? logSw("notification suppressed because app client is open", {
              data,
              tag: options.tag ?? null,
            })
          : self.registration
              .showNotification(envelope.title ?? "Linky", options)
              .then(() =>
                logSw("notification displayed", {
                  data,
                  tag: options.tag ?? null,
                }),
              )
              .catch((error) =>
                logSw("notification display failed", {
                  data,
                  error: describeError(error),
                }),
              ),
      ]);
    })(),
  );
});

self.addEventListener("notificationclose", (event) => {
  event.waitUntil(
    logSw("notification close", {
      data: event.notification.data ?? null,
      tag: event.notification.tag,
    }),
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
    Promise.all([
      logSw("notification click", {
        data: event.notification.data ?? null,
        tag: event.notification.tag,
      }),
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
    ]),
  );
});

self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    Promise.all([
      logSw("push subscription change", {
        hadNewSubscription: event.newSubscription !== null,
        hadOldSubscription: event.oldSubscription !== null,
      }),
      postClientMessage({
        hadNewSubscription: event.newSubscription !== null,
        hadOldSubscription: event.oldSubscription !== null,
        type: "push-subscription-change",
      }),
    ]),
  );
});
