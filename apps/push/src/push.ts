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

function isPermanentPushFailure(error: unknown): boolean {
  if (!isRecord(error)) {
    return false;
  }
  const statusCode = error.statusCode;
  return statusCode === 404 || statusCode === 410;
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
          TTL: 60,
          urgency: "normal",
          topic: buildPushTopic(payloadData),
        },
      );
      console.info(
        `[push] delivered ${payloadData.outerEventId} to ${payloadData.recipientPubkey}`,
      );
    } catch (error) {
      if (isPermanentPushFailure(error)) {
        this.storage.removeSubscriptionById(subscription.id);
      }
      throw error;
    }
  }
}
