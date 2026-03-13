import type { Event as NostrToolsEvent, UnsignedEvent } from "nostr-tools";
import { appendPushDebugLog } from "./pushDebugLog";

const PUSH_SERVER_URL =
  import.meta.env.VITE_PUSH_SERVER_URL ||
  import.meta.env.VITE_NOTIFICATION_SERVER_URL ||
  "https://push.linky.fit";

const VAPID_KEY_STORAGE_KEY = "linky.push_vapid_public_key";
const PUSH_INSTALLATION_ID_STORAGE_KEY = "linky.push_installation_id";
const REGISTERED_PUSH_ENDPOINT_STORAGE_KEY = "linky.push_subscription_endpoint";
const REGISTERED_PUSH_PUBKEY_STORAGE_KEY = "linky.push_subscription_pubkey";

async function fetchVapidPublicKey(): Promise<string> {
  const response = await fetch(`${PUSH_SERVER_URL}/vapid-public-key`);
  if (!response.ok) {
    throw new Error(`Failed to fetch VAPID key: HTTP ${response.status}`);
  }
  const data: unknown = await response.json();
  if (!isRecord(data) || typeof data.vapidPublicKey !== "string") {
    throw new Error("Invalid VAPID key response");
  }
  return data.vapidPublicKey;
}

function getStoredVapidKey(): string | null {
  return localStorage.getItem(VAPID_KEY_STORAGE_KEY);
}

function storeVapidKey(key: string): void {
  localStorage.setItem(VAPID_KEY_STORAGE_KEY, key);
}

function getOrCreatePushInstallationId(): string {
  const existing = localStorage.getItem(PUSH_INSTALLATION_ID_STORAGE_KEY);
  if (existing && existing.trim().length > 0) {
    return existing;
  }

  const nextId =
    typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : uint8ArrayToUrlBase64(crypto.getRandomValues(new Uint8Array(16)));
  localStorage.setItem(PUSH_INSTALLATION_ID_STORAGE_KEY, nextId);
  return nextId;
}

function readStoredRegisteredPushEndpoint(): string | null {
  return localStorage.getItem(REGISTERED_PUSH_ENDPOINT_STORAGE_KEY);
}

function storeRegisteredPushEndpoint(endpoint: string): void {
  localStorage.setItem(REGISTERED_PUSH_ENDPOINT_STORAGE_KEY, endpoint);
}

function clearStoredRegisteredPushEndpoint(): void {
  localStorage.removeItem(REGISTERED_PUSH_ENDPOINT_STORAGE_KEY);
}

function readStoredRegisteredPushPubkey(): string | null {
  return localStorage.getItem(REGISTERED_PUSH_PUBKEY_STORAGE_KEY);
}

function storeRegisteredPushPubkey(pubkey: string): void {
  localStorage.setItem(REGISTERED_PUSH_PUBKEY_STORAGE_KEY, pubkey);
}

function clearStoredRegisteredPushPubkey(): void {
  localStorage.removeItem(REGISTERED_PUSH_PUBKEY_STORAGE_KEY);
}

type PushSubscriptionData = {
  endpoint: string;
  expirationTime: number | null;
  keys: {
    p256dh: string;
    auth: string;
  };
};

type ChallengeResponse = {
  action: "subscribe" | "unsubscribe";
  challenge: string;
  expiresAt: number;
  pubkey: string;
};

type OwnershipProof = {
  event: NostrToolsEvent;
  pubkey: string;
};

function describeSubscription(subscription: PushSubscription | null): {
  applicationServerKey: string | null;
  endpointHash: string | null;
  expirationTime: number | null;
  hasAuth: boolean;
  hasApplicationServerKey: boolean;
  hasP256dh: boolean;
} {
  const endpoint = subscription?.endpoint ?? "";
  const applicationServerKey =
    subscription === null ? null : readApplicationServerKey(subscription);
  return {
    applicationServerKey,
    endpointHash: endpoint ? endpoint.slice(-24) : null,
    expirationTime: subscription?.expirationTime ?? null,
    hasAuth: Boolean(subscription?.getKey("auth")),
    hasApplicationServerKey: applicationServerKey !== null,
    hasP256dh: Boolean(subscription?.getKey("p256dh")),
  };
}

function isRecord(
  value: unknown,
): value is Record<string | number | symbol, unknown> {
  return typeof value === "object" && value !== null;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function uint8ArrayToUrlBase64(bytes: Uint8Array): string {
  let raw = "";
  for (const value of bytes) {
    raw += String.fromCharCode(value);
  }
  return window
    .btoa(raw)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return new Uint8Array(bytes).buffer;
}

function encodeKey(value: ArrayBuffer | null): string {
  if (!value) return "";
  return btoa(String.fromCharCode(...new Uint8Array(value)));
}

function readChallengeResponse(value: unknown): ChallengeResponse {
  if (!isRecord(value)) {
    throw new Error("Challenge response must be an object");
  }

  const action = value.action;
  const challenge = value.challenge;
  const expiresAt = value.expiresAt;
  const pubkey = value.pubkey;

  if (action !== "subscribe" && action !== "unsubscribe") {
    throw new Error("Challenge response action is invalid");
  }
  if (typeof challenge !== "string" || challenge.trim().length === 0) {
    throw new Error("Challenge response challenge is invalid");
  }
  if (typeof expiresAt !== "number" || !Number.isFinite(expiresAt)) {
    throw new Error("Challenge response expiry is invalid");
  }
  if (typeof pubkey !== "string" || pubkey.trim().length === 0) {
    throw new Error("Challenge response pubkey is invalid");
  }

  return {
    action,
    challenge,
    expiresAt,
    pubkey,
  };
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const text = await response.text();
    return text.trim() || `HTTP ${response.status}`;
  } catch {
    return `HTTP ${response.status}`;
  }
}

async function derivePushIdentity(currentNsec: string): Promise<{
  privBytes: Uint8Array;
  pubkey: string;
}> {
  const { getPublicKey, nip19 } = await import("nostr-tools");

  const decoded = nip19.decode(currentNsec);
  if (decoded.type !== "nsec" || !(decoded.data instanceof Uint8Array)) {
    throw new Error("Invalid nsec");
  }

  return {
    privBytes: decoded.data,
    pubkey: getPublicKey(decoded.data),
  };
}

async function requestChallenge(pubkey: string): Promise<ChallengeResponse> {
  const response = await fetch(`${PUSH_SERVER_URL}/auth/challenge`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      action: "subscribe",
      pubkey,
    }),
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  return readChallengeResponse(await response.json());
}

async function unregisterEndpointOnServer(endpoint: string): Promise<boolean> {
  const response = await fetch(`${PUSH_SERVER_URL}/unsubscribe`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      endpoint,
    }),
  });

  return response.ok;
}

async function createOwnershipProof(params: {
  action: "subscribe" | "unsubscribe";
  challenge: string;
  currentNsec: string;
}): Promise<OwnershipProof> {
  const { finalizeEvent } = await import("nostr-tools");
  const { privBytes, pubkey } = await derivePushIdentity(params.currentNsec);

  const content =
    params.action === "subscribe"
      ? "linky-push-subscribe"
      : "linky-push-unsubscribe";

  const baseEvent = {
    kind: 27235,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ["challenge", params.challenge],
      ["action", params.action],
      ["pubkey", pubkey],
    ],
    content,
    pubkey,
  } satisfies UnsignedEvent;

  return {
    event: finalizeEvent(baseEvent, privBytes),
    pubkey,
  };
}

function readApplicationServerKey(
  subscription: PushSubscription,
): string | null {
  const applicationServerKey = subscription.options.applicationServerKey;
  if (applicationServerKey === null) {
    return null;
  }

  return uint8ArrayToUrlBase64(new Uint8Array(applicationServerKey));
}

function toPushSubscriptionData(
  subscription: PushSubscription,
): PushSubscriptionData {
  return {
    endpoint: subscription.endpoint,
    expirationTime: subscription.expirationTime,
    keys: {
      p256dh: encodeKey(subscription.getKey("p256dh")),
      auth: encodeKey(subscription.getKey("auth")),
    },
  };
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (!("Notification" in window)) {
    await appendPushDebugLog("client", "notification permission unsupported");
    return false;
  }

  const permission = await Notification.requestPermission();
  await appendPushDebugLog("client", "notification permission result", {
    permission,
  });
  return permission === "granted";
}

export async function registerPushNotifications(
  currentNsec: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    await appendPushDebugLog("client", "push register start", {
      permission:
        "Notification" in window ? Notification.permission : "missing",
    });

    if (!("serviceWorker" in navigator)) {
      await appendPushDebugLog("client", "push register failed", {
        reason: "service_worker_unsupported",
      });
      return { success: false, error: "Service Worker není podporován" };
    }

    let vapidPublicKey: string;
    try {
      vapidPublicKey = await fetchVapidPublicKey();
    } catch (fetchError) {
      await appendPushDebugLog("client", "push register failed", {
        reason: "vapid_key_fetch_failed",
        error: fetchError,
      });
      return {
        success: false,
        error: `Nepodařilo se získat VAPID klíč: ${String(fetchError ?? "")}`,
      };
    }

    const storedKey = getStoredVapidKey();
    const vapidKeyChanged = storedKey !== null && storedKey !== vapidPublicKey;
    const installationId = getOrCreatePushInstallationId();

    const { pubkey } = await derivePushIdentity(currentNsec);
    const storedEndpoint = readStoredRegisteredPushEndpoint();
    const storedPubkey = readStoredRegisteredPushPubkey();
    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();
    let replacedEndpoint: string | null = null;
    const subscriptionApplicationServerKey =
      subscription === null ? null : readApplicationServerKey(subscription);
    const subscriptionUsesCurrentVapidKey =
      subscription === null
        ? false
        : subscriptionApplicationServerKey === vapidPublicKey;
    await appendPushDebugLog("client", "push registration ready", {
      hasActiveWorker: Boolean(registration.active),
      installationId,
      pubkey,
      storedEndpointHash:
        storedEndpoint === null ? null : storedEndpoint.slice(-24),
      storedPubkey,
      subscription: describeSubscription(subscription),
      storedVapidKey: storedKey,
      subscriptionApplicationServerKey,
      vapidKeyChanged,
      subscriptionUsesCurrentVapidKey,
    });

    if (subscription && !subscriptionUsesCurrentVapidKey) {
      replacedEndpoint = subscription.endpoint;
      await appendPushDebugLog(
        "client",
        "push subscription vapid mismatch, re-subscribing",
        {
          replacedEndpointHash: replacedEndpoint.slice(-24),
          storedVapidKey: storedKey,
          subscriptionApplicationServerKey,
          vapidKeyChanged,
        },
      );
      await subscription.unsubscribe().catch(() => false);
      subscription = null;
    }

    const previousEndpoint = replacedEndpoint ?? storedEndpoint;

    if (!subscription) {
      try {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: toArrayBuffer(
            urlBase64ToUint8Array(vapidPublicKey),
          ),
        });
        storeVapidKey(vapidPublicKey);
        await appendPushDebugLog("client", "push subscribe created", {
          subscription: describeSubscription(subscription),
        });
      } catch (subError) {
        await appendPushDebugLog("client", "push subscribe failed", {
          error: subError,
        });
        return {
          success: false,
          error: `Chyba při vytváření subscription: ${String(subError ?? "")}`,
        };
      }
    } else {
      storeVapidKey(vapidPublicKey);
    }

    const challenge = await requestChallenge(pubkey);
    await appendPushDebugLog("client", "push challenge received", {
      action: challenge.action,
      expiresAt: challenge.expiresAt,
      pubkey: challenge.pubkey,
    });
    const proof = await createOwnershipProof({
      action: "subscribe",
      challenge: challenge.challenge,
      currentNsec,
    });

    const response = await fetch(`${PUSH_SERVER_URL}/subscribe`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        installationId,
        proofs: [proof],
        recipientPubkeys: [pubkey],
        subscription: toPushSubscriptionData(subscription),
      }),
    });

    if (!response.ok) {
      const errorMessage = await readErrorMessage(response);
      await appendPushDebugLog("client", "push register server error", {
        errorMessage,
        pubkey,
        status: response.status,
        subscription: describeSubscription(subscription),
      });
      return {
        success: false,
        error: `Server vrátil chybu ${response.status}: ${errorMessage}`,
      };
    }

    const currentEndpoint = subscription.endpoint;
    if (previousEndpoint && previousEndpoint !== currentEndpoint) {
      const shouldCleanupPreviousEndpoint =
        storedPubkey === null ||
        storedPubkey === pubkey ||
        replacedEndpoint !== null;
      if (shouldCleanupPreviousEndpoint) {
        try {
          const removed = await unregisterEndpointOnServer(previousEndpoint);
          await appendPushDebugLog(
            "client",
            "push stale endpoint cleanup result",
            {
              currentEndpointHash: currentEndpoint.slice(-24),
              installationId,
              previousEndpointHash: previousEndpoint.slice(-24),
              pubkey,
              removed,
              replacedEndpointHash:
                replacedEndpoint === null ? null : replacedEndpoint.slice(-24),
              storedPubkey,
            },
          );
        } catch (cleanupError) {
          await appendPushDebugLog(
            "client",
            "push stale endpoint cleanup failed",
            {
              currentEndpointHash: currentEndpoint.slice(-24),
              installationId,
              previousEndpointHash: previousEndpoint.slice(-24),
              pubkey,
              error: cleanupError,
              replacedEndpointHash:
                replacedEndpoint === null ? null : replacedEndpoint.slice(-24),
              storedPubkey,
            },
          );
        }
      }
    }

    storeRegisteredPushEndpoint(currentEndpoint);
    storeRegisteredPushPubkey(pubkey);

    await appendPushDebugLog("client", "push register success", {
      currentEndpointHash: currentEndpoint.slice(-24),
      installationId,
      previousEndpointHash:
        previousEndpoint === null ? null : previousEndpoint.slice(-24),
      pubkey,
      subscription: describeSubscription(subscription),
    });
    return { success: true };
  } catch (error) {
    await appendPushDebugLog("client", "push register exception", { error });
    return { success: false, error: `Chyba: ${String(error ?? "")}` };
  }
}

export async function unregisterPushNotifications(): Promise<boolean> {
  try {
    if (!("serviceWorker" in navigator)) {
      await appendPushDebugLog("client", "push unregister failed", {
        reason: "service_worker_unsupported",
      });
      return false;
    }

    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    const storedEndpoint = readStoredRegisteredPushEndpoint();

    if (!subscription) {
      if (storedEndpoint) {
        const responseOk = await unregisterEndpointOnServer(
          storedEndpoint,
        ).catch(() => false);
        if (responseOk) {
          clearStoredRegisteredPushEndpoint();
          clearStoredRegisteredPushPubkey();
        }
      }
      await appendPushDebugLog("client", "push unregister noop", {
        reason: "missing_subscription",
        storedEndpointHash:
          storedEndpoint === null ? null : storedEndpoint.slice(-24),
      });
      return false;
    }

    const responseOk = await unregisterEndpointOnServer(subscription.endpoint);
    const unsubscribed = await subscription.unsubscribe().catch(() => false);
    if (responseOk) {
      clearStoredRegisteredPushEndpoint();
      clearStoredRegisteredPushPubkey();
    }
    await appendPushDebugLog("client", "push unregister result", {
      ok: responseOk && unsubscribed,
      responseOk,
      storedEndpointHash:
        storedEndpoint === null ? null : storedEndpoint.slice(-24),
      subscription: describeSubscription(subscription),
      unsubscribed,
    });
    return responseOk && unsubscribed;
  } catch (error) {
    await appendPushDebugLog("client", "push unregister exception", { error });
    return false;
  }
}
