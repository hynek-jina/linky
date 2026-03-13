import type { Event as NostrToolsEvent, UnsignedEvent } from "nostr-tools";

const PUSH_SERVER_URL =
  import.meta.env.VITE_PUSH_SERVER_URL ||
  import.meta.env.VITE_NOTIFICATION_SERVER_URL ||
  "https://push.linky.fit";
const VAPID_PUBLIC_KEY =
  import.meta.env.VITE_PUSH_VAPID_PUBLIC_KEY ||
  import.meta.env.VITE_VAPID_PUBLIC_KEY ||
  "";

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
    return false;
  }

  const permission = await Notification.requestPermission();
  return permission === "granted";
}

export async function registerPushNotifications(
  currentNsec: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!("serviceWorker" in navigator)) {
      return { success: false, error: "Service Worker není podporován" };
    }

    if (!VAPID_PUBLIC_KEY) {
      return { success: false, error: "VAPID public key není nakonfigurován" };
    }

    const { pubkey } = await derivePushIdentity(currentNsec);
    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();

    if (!subscription) {
      try {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: toArrayBuffer(
            urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
          ),
        });
      } catch (subError) {
        return {
          success: false,
          error: `Chyba při vytváření subscription: ${String(subError ?? "")}`,
        };
      }
    }

    const challenge = await requestChallenge(pubkey);
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
        proofs: [proof],
        recipientPubkeys: [pubkey],
        subscription: toPushSubscriptionData(subscription),
      }),
    });

    if (!response.ok) {
      return {
        success: false,
        error: `Server vrátil chybu ${response.status}: ${await readErrorMessage(
          response,
        )}`,
      };
    }

    return { success: true };
  } catch (error) {
    return { success: false, error: `Chyba: ${String(error ?? "")}` };
  }
}

export async function unregisterPushNotifications(): Promise<boolean> {
  try {
    if (!("serviceWorker" in navigator)) {
      return false;
    }

    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();

    if (!subscription) {
      return false;
    }

    const response = await fetch(`${PUSH_SERVER_URL}/unsubscribe`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        endpoint: subscription.endpoint,
      }),
    });

    const unsubscribed = await subscription.unsubscribe().catch(() => false);
    return response.ok && unsubscribed;
  } catch {
    return false;
  }
}
