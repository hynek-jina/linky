import { createHash } from "node:crypto";
import * as webpush from "web-push";

import { isRecord } from "./guards";
import { PushStorage } from "./storage";
import type {
  PushNotificationData,
  PushNotificationEnvelope,
  StoredSubscription,
  WebPushSubscriptionData,
} from "./types";

interface PushDeliveryServiceOptions {
  vapidSubject: string;
  vapidPublicKey: string;
  vapidPrivateKey: string;
  storage: PushStorage;
}

const DELIVERY_TTL_SECONDS = 24 * 60 * 60;

function isVapidKeyMismatchBody(errorBody: string | null): boolean {
  if (errorBody === null) {
    return false;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(errorBody);
  } catch {
    return false;
  }

  if (!isRecord(parsed)) {
    return false;
  }

  const message = parsed.message;
  if (message === "VAPID public key mismatch") {
    return true;
  }

  const reason = parsed.reason;
  return reason === "VapidPkHashMismatch";
}

function isPermanentPushFailure(
  statusCode: number | null,
  errorBody: string | null,
): boolean {
  if (statusCode === 404 || statusCode === 410) {
    return true;
  }

  return (
    (statusCode === 400 || statusCode === 401) &&
    isVapidKeyMismatchBody(errorBody)
  );
}

function describePermanentPushFailure(
  statusCode: number | null,
  errorBody: string | null,
): string | null {
  if (statusCode === 404) {
    return "not_found";
  }

  if (statusCode === 410) {
    return "gone";
  }

  if (
    (statusCode === 400 || statusCode === 401) &&
    isVapidKeyMismatchBody(errorBody)
  ) {
    return "vapid_key_mismatch";
  }

  return null;
}

function toWebPushSubscription(
  subscription: StoredSubscription,
): WebPushSubscriptionData {
  return {
    endpoint: subscription.endpoint,
    expirationTime: subscription.expirationTime,
    keys: {
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
    },
  };
}

function buildPushTopic(payloadData: PushNotificationData): string {
  return createHash("sha256")
    .update(`${payloadData.outerEventId}:${payloadData.recipientPubkey}`)
    .digest("base64url")
    .slice(0, 32);
}

function hashEndpoint(endpoint: string): string {
  return createHash("sha256").update(endpoint).digest("hex").slice(0, 16);
}

function readErrorStatusCode(error: unknown): number | null {
  if (!isRecord(error)) {
    return null;
  }
  const statusCode = error.statusCode;
  return typeof statusCode === "number" && Number.isFinite(statusCode)
    ? statusCode
    : null;
}

function readErrorBody(error: unknown): string | null {
  if (!isRecord(error)) {
    return null;
  }
  const body = error.body;
  return typeof body === "string" && body.trim().length > 0 ? body : null;
}

export class PushDeliveryService {
  private readonly storage: PushStorage;

  constructor(options: PushDeliveryServiceOptions) {
    this.storage = options.storage;
    webpush.setVapidDetails(
      options.vapidSubject,
      options.vapidPublicKey,
      options.vapidPrivateKey,
    );
  }

  async deliver(
    subscription: StoredSubscription,
    payloadData: PushNotificationData,
  ): Promise<void> {
    const endpointHash = hashEndpoint(subscription.endpoint);
    const payload: PushNotificationEnvelope = {
      title: "Linky",
      body: "New message",
      data: payloadData,
    };

    try {
      await webpush.sendNotification(
        toWebPushSubscription(subscription),
        JSON.stringify(payload),
        {
          TTL: DELIVERY_TTL_SECONDS,
          urgency: "normal",
          topic: buildPushTopic(payloadData),
        },
      );
      console.info(
        `[push] sent notification successfully id=${subscription.id} outerEventId=${payloadData.outerEventId} recipient=${payloadData.recipientPubkey} endpoint=${endpointHash} ttl=${DELIVERY_TTL_SECONDS}`,
      );
    } catch (error) {
      const statusCode = readErrorStatusCode(error);
      const errorBody = readErrorBody(error);
      const permanentFailureReason = describePermanentPushFailure(
        statusCode,
        errorBody,
      );
      if (isPermanentPushFailure(statusCode, errorBody)) {
        this.storage.removeSubscriptionById(subscription.id);
        console.warn(
          `[push] removed subscription from db id=${subscription.id} endpoint=${endpointHash} status=${statusCode ?? "unknown"} reason=${permanentFailureReason ?? "unknown"}`,
        );
      }
      console.warn(
        `[push] delivery failed ${payloadData.outerEventId} to ${payloadData.recipientPubkey} endpoint=${endpointHash} status=${statusCode ?? "unknown"} body=${errorBody ?? "n/a"}`,
      );
      throw error;
    }
  }
}
