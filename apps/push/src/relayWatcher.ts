import { encodeNpub, RelayUrl, watchPushInbox } from "@linky/linkstr";
import type { DeliveredPushWrap, PushInboxSubscription } from "@linky/linkstr";

import {
  CATCH_UP_LOOKBACK_SECONDS,
  SEEN_EVENT_RETENTION_MARGIN_MS,
} from "./config";
import { PushDeliveryService } from "./push";
import { PushStorage } from "./storage";
import type { PushNotificationData } from "./types";

interface RelayWatcherOptions {
  relayUrls: string[];
  storage: PushStorage;
  pushDelivery: PushDeliveryService;
  eventDedupeTtlMs: number;
}

export class RelayWatcher {
  private readonly relayUrls: ReadonlyArray<RelayUrl>;
  private readonly storage: PushStorage;
  private readonly pushDelivery: PushDeliveryService;
  private readonly eventDedupeTtlMs: number;
  private subscription: PushInboxSubscription | null = null;

  constructor(options: RelayWatcherOptions) {
    this.relayUrls = options.relayUrls.map((url) => RelayUrl.make(url));
    this.storage = options.storage;
    this.pushDelivery = options.pushDelivery;
    this.eventDedupeTtlMs = options.eventDedupeTtlMs;
  }

  start(): void {
    if (this.subscription !== null) return;
    console.info(
      `[push] opening linkstr relay watcher with ${CATCH_UP_LOOKBACK_SECONDS}s lookback`,
    );
    this.subscription = watchPushInbox(
      {
        readRelays: this.relayUrls,
        lookbackSeconds: CATCH_UP_LOOKBACK_SECONDS,
      },
      (event) => void this.handleEvent(event),
    );
  }

  async stop(): Promise<void> {
    await this.subscription?.close();
    this.subscription = null;
  }

  pruneSeen(nowMs: number): void {
    this.storage.pruneSeenEvents(
      nowMs,
      Math.max(
        this.eventDedupeTtlMs,
        CATCH_UP_LOOKBACK_SECONDS * 1000 + SEEN_EVENT_RETENTION_MARGIN_MS,
      ),
    );
  }

  private async handleEvent({
    delivery,
    wrap,
  }: DeliveredPushWrap): Promise<void> {
    const recipient = wrap.recipient;
    const subscriptions =
      this.storage.getSubscriptionsForPubkeys([recipient]).get(recipient) ?? [];
    const nativeSubscriptions =
      this.storage
        .getNativeSubscriptionsForPubkeys([recipient])
        .get(recipient) ?? [];
    if (subscriptions.length === 0 && nativeSubscriptions.length === 0) {
      console.debug(
        `[push] skipped event without matching subscriptions id=${wrap.wrapId} recipient=${recipient}`,
      );
      return;
    }

    const nowMs = Date.now();
    if (!this.storage.recordSeenEvent(wrap.wrapId, nowMs)) {
      console.debug(`[push] skipped duplicate event id=${wrap.wrapId}`);
      return;
    }

    console.debug(
      `[push] observed gift wrap id=${wrap.wrapId} recipient=${recipient} createdAt=${wrap.createdAt}`,
    );
    if (delivery === "backfill") {
      console.debug(
        `[push] suppressed historical gift wrap id=${wrap.wrapId} recipient=${recipient}`,
      );
      return;
    }

    console.debug(
      `[push] delivering gift wrap id=${wrap.wrapId} recipient=${recipient} webSubscriptions=${subscriptions.length} nativeSubscriptions=${nativeSubscriptions.length}`,
    );
    const payloadData: PushNotificationData = {
      type: "nostr_inbox",
      outerEventId: wrap.wrapId,
      recipientPubkey: recipient,
      recipientNpub: encodeNpub(recipient),
      createdAt: wrap.createdAt,
      relayHints: [...wrap.relayHints],
    };
    const deliveries: Array<Promise<void>> = [];

    for (const subscription of subscriptions) {
      deliveries.push(
        this.pushDelivery
          .deliverWeb(subscription, payloadData)
          .catch((error) => {
            console.warn(
              `[push] failed to deliver ${wrap.wrapId} to ${recipient}`,
              error,
            );
          }),
      );
    }
    for (const subscription of nativeSubscriptions) {
      deliveries.push(
        this.pushDelivery
          .deliverNative(subscription, payloadData)
          .catch((error) => {
            console.warn(
              `[push] failed to deliver native ${wrap.wrapId} to ${recipient}`,
              error,
            );
          }),
      );
    }

    await Promise.allSettled(deliveries);
  }
}
