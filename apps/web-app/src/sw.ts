/// <reference lib="es2020" />
/// <reference lib="dom" />
/// <reference lib="webworker" />

const SW_BUILD_TAG = "linky-sw-2026-04-29T11:50-bump-2";

import type { Event as NostrEvent } from "nostr-tools";
import { getPublicKey, nip19, SimplePool } from "nostr-tools";
import { unwrapEvent } from "nostr-tools/nip17";
import { createHandlerBoundToURL, precacheAndRoute } from "workbox-precaching";
import { NavigationRoute, registerRoute } from "workbox-routing";
import { CacheFirst } from "workbox-strategies";
import {
  isInvalidInnerRumorPubkey,
  isNestedEncryptedNip44PayloadForAnyPubkey,
} from "./app/hooks/messages/chatNostrProtocol";
import {
  getReceivedMoneyCopyForLanguage,
  isCashuNotificationMessage,
} from "./app/lib/cashuNotificationCopy";
import { isLinkyPaymentNoticeEvent } from "./app/lib/pushWrappedEvent";
import { normalizePubkeyHex } from "./app/hooks/messages/contactIdentity";
import { NOSTR_RELAYS } from "./utils/nostrRelays";
import { appendPushDebugLog } from "./utils/pushDebugLog";
import { getStoredPushNsec } from "./utils/pushNsecStorage";

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

interface DecryptedPushMessage {
  body: string;
  isCashu: boolean;
  isPaymentNotice: boolean;
  senderPub: string;
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error ?? "");
}

function readEnvelopeDebugMeta(
  envelope: PushNotificationEnvelope,
): PushNotificationData {
  const data = envelope.data ?? {};
  return {
    ...(data.createdAt === undefined ? {} : { createdAt: data.createdAt }),
    ...(data.outerEventId ? { outerEventId: data.outerEventId } : {}),
    ...(data.recipientPubkey ? { recipientPubkey: data.recipientPubkey } : {}),
    ...(data.relayHints ? { relayHints: data.relayHints } : {}),
    ...(data.type ? { type: data.type } : {}),
  };
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

function truncateNotificationBody(value: string): string {
  const normalized = value.trim();
  if (normalized.length <= 140) {
    return normalized;
  }
  return `${normalized.slice(0, 140)}…`;
}

function normalizeRelayUrls(urls: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  for (const raw of urls) {
    const url = String(raw ?? "").trim();
    if (!url) continue;
    if (!(url.startsWith("wss://") || url.startsWith("ws://"))) continue;
    if (seen.has(url)) continue;
    seen.add(url);
    out.push(url);
  }

  return out;
}

function getPTagPubkeys(inner: { tags: string[][] }): string[] {
  const out: string[] = [];

  for (const tag of inner.tags) {
    if (!Array.isArray(tag) || tag[0] !== "p") continue;
    const pubkey = String(tag[1] ?? "").trim();
    if (pubkey) {
      out.push(pubkey);
    }
  }

  return out;
}

async function fetchOuterWrapEvent(
  envelope: PushNotificationEnvelope,
): Promise<NostrEvent | null> {
  const outerEventId = String(envelope.data?.outerEventId ?? "").trim();
  const recipientPubkey = String(envelope.data?.recipientPubkey ?? "").trim();
  if (!outerEventId || !recipientPubkey) {
    await logSw(
      "sw decrypt fetch skipped because push envelope is incomplete",
      {
        data: readEnvelopeDebugMeta(envelope),
      },
    );
    return null;
  }

  const relays = normalizeRelayUrls([
    ...(envelope.data?.relayHints ?? []),
    ...NOSTR_RELAYS,
  ]);
  if (relays.length === 0) {
    await logSw("sw decrypt fetch skipped because no relays were available", {
      data: readEnvelopeDebugMeta(envelope),
    });
    return null;
  }

  await logSw("sw decrypt fetching outer wrap", {
    data: readEnvelopeDebugMeta(envelope),
    relayCount: relays.length,
    relays,
  });

  const pool = new SimplePool({ enableReconnect: false });
  try {
    const events = await pool.querySync(
      relays,
      { ids: [outerEventId], kinds: [1059], "#p": [recipientPubkey], limit: 1 },
      { maxWait: 5000 },
    );
    const wrap = events[0] ?? null;
    await logSw("sw decrypt outer wrap fetch completed", {
      data: readEnvelopeDebugMeta(envelope),
      found: Boolean(wrap),
      resultCount: events.length,
    });
    return wrap;
  } catch (error) {
    await logSw("sw decrypt outer wrap fetch failed", {
      data: readEnvelopeDebugMeta(envelope),
      error: describeError(error),
    });
    return null;
  } finally {
    pool.close(relays);
  }
}

async function decryptIncomingMessageBody(
  envelope: PushNotificationEnvelope,
): Promise<DecryptedPushMessage | null> {
  await logSw("sw decrypt started", {
    data: readEnvelopeDebugMeta(envelope),
  });

  const nsec = await getStoredPushNsec();
  if (!nsec) {
    await logSw("sw decrypt failed because nsec is missing from indexeddb", {
      data: readEnvelopeDebugMeta(envelope),
    });
    return null;
  }

  const decoded = nip19.decode(nsec);
  if (decoded.type !== "nsec" || !(decoded.data instanceof Uint8Array)) {
    await logSw("sw decrypt failed because stored nsec is invalid", {
      data: readEnvelopeDebugMeta(envelope),
    });
    return null;
  }

  const privBytes = decoded.data;
  const myPubHex = getPublicKey(privBytes);
  const recipientPubkey = normalizePubkeyHex(envelope.data?.recipientPubkey);
  if (!recipientPubkey || recipientPubkey !== myPubHex) {
    await logSw("sw decrypt failed because recipient pubkey did not match", {
      data: readEnvelopeDebugMeta(envelope),
      derivedPubkey: myPubHex,
      hasRecipientPubkey: Boolean(recipientPubkey),
    });
    return null;
  }

  const wrap = await fetchOuterWrapEvent(envelope);
  if (!wrap) {
    await logSw("sw decrypt failed because outer wrap event was not fetched", {
      data: readEnvelopeDebugMeta(envelope),
    });
    return null;
  }

  let inner: ReturnType<typeof unwrapEvent> | null = null;
  try {
    inner = unwrapEvent(wrap, privBytes);
  } catch (error) {
    await logSw("sw decrypt failed because unwrapEvent threw", {
      data: readEnvelopeDebugMeta(envelope),
      error: describeError(error),
      wrapPubkey: wrap.pubkey,
    });
    return null;
  }
  if (!inner) {
    await logSw(
      "sw decrypt failed because inner rumor was missing or invalid",
      {
        data: readEnvelopeDebugMeta(envelope),
        hasInner: Boolean(inner),
        innerKind: null,
      },
    );
    return null;
  }

  const senderPub = String(inner.pubkey ?? "").trim();
  const content = String(inner.content ?? "").trim();
  if (!senderPub) {
    await logSw(
      "sw decrypt failed because inner rumor lacked sender or content",
      {
        contentLength: content.length,
        data: readEnvelopeDebugMeta(envelope),
        hasSenderPubkey: Boolean(senderPub),
      },
    );
    return null;
  }
  if (isInvalidInnerRumorPubkey(senderPub, wrap.pubkey)) {
    await logSw(
      "sw decrypt rejected inner rumor because it reused wrap pubkey",
      {
        data: readEnvelopeDebugMeta(envelope),
        senderPub,
        wrapPubkey: wrap.pubkey,
      },
    );
    return null;
  }

  const pTags = getPTagPubkeys(inner);
  if (!pTags.includes(myPubHex)) {
    await logSw(
      "sw decrypt failed because inner rumor did not address this recipient",
      {
        data: readEnvelopeDebugMeta(envelope),
        pTagCount: pTags.length,
      },
    );
    return null;
  }

  if (isLinkyPaymentNoticeEvent(inner)) {
    await logSw("sw decrypt succeeded", {
      contentLength: content.length,
      data: readEnvelopeDebugMeta(envelope),
      isPaymentNotice: true,
      senderPub,
    });
    return {
      body: getReceivedMoneyCopyForLanguage(self.navigator.language),
      isCashu: false,
      isPaymentNotice: true,
      senderPub,
    };
  }

  if (inner.kind !== 14 || !content) {
    await logSw(
      "sw decrypt failed because inner rumor was missing or invalid",
      {
        data: readEnvelopeDebugMeta(envelope),
        hasInner: Boolean(inner),
        innerKind: inner.kind,
      },
    );
    return null;
  }

  const taggedPeerPub = pTags.find((pubkey) => pubkey !== myPubHex) ?? "";
  if (
    isNestedEncryptedNip44PayloadForAnyPubkey(
      content,
      [senderPub, taggedPeerPub, wrap.pubkey],
      privBytes,
    )
  ) {
    await logSw("sw decrypt rejected nested encrypted payload", {
      data: readEnvelopeDebugMeta(envelope),
      hasTaggedPeerPub: Boolean(taggedPeerPub),
      senderPub,
      wrapPubkey: wrap.pubkey,
    });
    return null;
  }

  await logSw("sw decrypt succeeded", {
    contentLength: content.length,
    data: readEnvelopeDebugMeta(envelope),
    senderPub,
  });
  if (isCashuNotificationMessage(content)) {
    return {
      body: getReceivedMoneyCopyForLanguage(self.navigator.language),
      isCashu: true,
      isPaymentNotice: false,
      senderPub,
    };
  }
  return {
    body: truncateNotificationBody(content),
    isCashu: false,
    isPaymentNotice: false,
    senderPub,
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
  event.waitUntil(logSw("service worker install", { build: SW_BUILD_TAG }));
});

// vite-plugin-pwa registerType:"prompt" — the client posts SKIP_WAITING when
// the user accepts the update banner; without this the new SW would sit in
// the waiting state forever.
self.addEventListener("message", (event: ExtendableMessageEvent) => {
  const data = event.data as { type?: unknown } | null;
  if (data && typeof data === "object" && data.type === "SKIP_WAITING") {
    void self.skipWaiting();
  }
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
  event.waitUntil(
    logSw("push event parsed", {
      data,
      title: envelope.title ?? "Linky",
    }),
  );

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
      const decryptedMessage = await decryptIncomingMessageBody(envelope).catch(
        () => null,
      );
      const fallbackBody =
        typeof envelope.body === "string" && envelope.body.trim().length > 0
          ? truncateNotificationBody(envelope.body)
          : "";
      const notificationBody = decryptedMessage?.body ?? fallbackBody;
      const options: NotificationOptions = {
        badge: "/pwa-192x192.png",
        body: notificationBody,
        data,
        icon: "/pwa-192x192.png",
        requireInteraction: false,
        tag: data.outerEventId ?? "linky-inbox",
      };

      await Promise.all([
        logSw("push received", {
          data,
          hasWindowClient,
          hasDecryptedBody: Boolean(decryptedMessage),
          isCashuMessage: decryptedMessage?.isCashu ?? false,
          isPaymentNotice: decryptedMessage?.isPaymentNotice ?? false,
          usedFallbackBody:
            decryptedMessage === null && fallbackBody.length > 0,
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
                  isCashuMessage: decryptedMessage?.isCashu ?? false,
                  isPaymentNotice: decryptedMessage?.isPaymentNotice ?? false,
                  tag: options.tag ?? null,
                  usedFallbackBody:
                    decryptedMessage === null && fallbackBody.length > 0,
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
