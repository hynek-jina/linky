import type { Event as NostrEvent } from "nostr-tools";
import { SimplePool, verifyEvent } from "nostr-tools";

import { isHexString } from "./guards";
import { PushStorage } from "./storage";
import { PushDeliveryService } from "./push";
import type { PushNotificationData } from "./types";

interface RelayWatcherOptions {
  relayUrls: string[];
  storage: PushStorage;
  pushDelivery: PushDeliveryService;
  eventDedupeTtlMs: number;
}

interface ClosableSubscription {
  close: (reason?: string) => void;
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    if (seen.has(value)) {
      continue;
    }
    seen.add(value);
    out.push(value);
  }
  return out;
}

function extractRecipientPubkeys(event: NostrEvent): string[] {
  const out: string[] = [];

  for (const tag of event.tags) {
    if (tag[0] !== "p") {
      continue;
    }
    const candidate = tag[1];
    if (typeof candidate !== "string" || !isHexString(candidate, 64)) {
      continue;
    }
    out.push(candidate);
  }

  return uniqueStrings(out);
}

function extractRelayHints(
  event: NostrEvent,
  recipientPubkey: string,
): string[] {
  const out: string[] = [];

  for (const tag of event.tags) {
    if (tag[0] !== "p" || tag[1] !== recipientPubkey) {
      continue;
    }
    const relayHint = tag[2];
    if (typeof relayHint === "string" && relayHint.length > 0) {
      out.push(relayHint);
    }
  }

  return uniqueStrings(out);
}

function hasSingleRecipientTag(event: NostrEvent): boolean {
  const recipientPubkeys = extractRecipientPubkeys(event);
  return recipientPubkeys.length === 1;
}

function validateGiftWrapForPush(event: NostrEvent): {
  ok: boolean;
  reason: string | null;
} {
  if (event.kind !== 1059) {
    return { ok: false, reason: "wrong_kind" };
  }

  if (!verifyEvent(event)) {
    return { ok: false, reason: "invalid_signature" };
  }

  if (typeof event.content !== "string" || event.content.trim().length === 0) {
    return { ok: false, reason: "empty_content" };
  }

  if (!hasSingleRecipientTag(event)) {
    return { ok: false, reason: "unexpected_recipient_count" };
  }

  return { ok: true, reason: null };
}

function describeEventRecipients(event: NostrEvent): string {
  const recipients = extractRecipientPubkeys(event);
  return recipients.length > 0 ? recipients.join(",") : "none";
}

export class RelayWatcher {
  private readonly relayUrls: string[];
  private readonly storage: PushStorage;
  private readonly pushDelivery: PushDeliveryService;
  private readonly seenEventIds = new Map<string, number>();
  private readonly pool = new SimplePool({ enableReconnect: true });
  private readonly eventDedupeTtlMs: number;
  private subscription: ClosableSubscription | null = null;

  constructor(options: RelayWatcherOptions) {
    this.relayUrls = options.relayUrls;
    this.storage = options.storage;
    this.pushDelivery = options.pushDelivery;
    this.eventDedupeTtlMs = options.eventDedupeTtlMs;
  }

  start(): void {
    if (this.subscription !== null) {
      return;
    }

    const since = Math.floor(Date.now() / 1000) - 15;
    this.subscription = this.pool.subscribeMany(
      this.relayUrls,
      {
        kinds: [1059],
        since,
      },
      {
        onevent: (event) => {
          void this.handleEvent(event);
        },
        oneose: () => {
          console.info("[push] relay watcher caught up");
        },
        onclose: (reasons) => {
          console.warn("[push] relay subscription closed", reasons);
        },
      },
    );
  }

  async stop(): Promise<void> {
    await this.subscription?.close("server shutdown");
    this.subscription = null;
    this.pool.close(this.relayUrls);
  }

  private markSeen(eventId: string, nowMs: number): boolean {
    this.pruneSeen(nowMs);

    if (this.seenEventIds.has(eventId)) {
      return false;
    }

    this.seenEventIds.set(eventId, nowMs + this.eventDedupeTtlMs);
    return true;
  }

  private pruneSeen(nowMs: number): void {
    for (const [eventId, expiresAt] of this.seenEventIds.entries()) {
      if (expiresAt <= nowMs) {
        this.seenEventIds.delete(eventId);
      }
    }
  }

  private async handleEvent(event: NostrEvent): Promise<void> {
    const nowMs = Date.now();
    if (!this.markSeen(event.id, nowMs)) {
      console.info(`[push] skipped duplicate event id=${event.id}`);
      return;
    }

    console.info(
      `[push] observed gift wrap id=${event.id} pubkey=${event.pubkey} recipients=${describeEventRecipients(event)} createdAt=${event.created_at}`,
    );

    const validation = validateGiftWrapForPush(event);
    if (!validation.ok) {
      console.warn(
        `[push] skipped malformed gift wrap id=${event.id} pubkey=${event.pubkey} recipients=${describeEventRecipients(event)} reason=${validation.reason ?? "unknown"}`,
      );
      return;
    }

    const recipientPubkeys = extractRecipientPubkeys(event);
    if (recipientPubkeys.length === 0) {
      console.info(`[push] skipped event without recipients id=${event.id}`);
      return;
    }

    const subscriptionsByPubkey =
      this.storage.getSubscriptionsForPubkeys(recipientPubkeys);
    if (subscriptionsByPubkey.size === 0) {
      console.info(
        `[push] skipped event without matching subscriptions id=${event.id} recipients=${recipientPubkeys.join(",")}`,
      );
      return;
    }

    const deliveries: Promise<void>[] = [];

    for (const recipientPubkey of recipientPubkeys) {
      const subscriptions = subscriptionsByPubkey.get(recipientPubkey);
      if (!subscriptions) {
        console.info(
          `[push] no subscriptions for recipient id=${event.id} recipient=${recipientPubkey}`,
        );
        continue;
      }

      console.info(
        `[push] delivering gift wrap id=${event.id} recipient=${recipientPubkey} subscriptions=${subscriptions.length}`,
      );

      const payloadData: PushNotificationData = {
        type: "nostr_inbox",
        outerEventId: event.id,
        recipientPubkey,
        createdAt: event.created_at,
        relayHints: extractRelayHints(event, recipientPubkey),
      };

      for (const subscription of subscriptions) {
        deliveries.push(
          this.pushDelivery
            .deliver(subscription, payloadData)
            .catch((error) => {
              console.warn(
                `[push] failed to deliver ${event.id} to ${recipientPubkey}`,
                error,
              );
            }),
        );
      }
    }

    await Promise.allSettled(deliveries);
  }
}
