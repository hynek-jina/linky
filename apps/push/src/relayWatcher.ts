import type { Event as NostrEvent } from "nostr-tools";
import { SimplePool, verifyEvent } from "nostr-tools";

import { isHexString } from "./guards";
import { PushDeliveryService } from "./push";
import { PushStorage } from "./storage";
import type { PushNotificationData } from "./types";

interface RelayWatcherOptions {
  relayUrls: string[];
  storage: PushStorage;
  pushDelivery: PushDeliveryService;
  eventDedupeTtlMs: number;
}

interface SeenEventIdCacheOptions {
  ttlMs: number;
  maxEntries: number;
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

const LINKY_PUSH_MARKER_TAG = "linky";
const LINKY_PUSH_MARKER_VALUE = "push";

function hasLinkyPushMarker(event: NostrEvent): boolean {
  return event.tags.some(
    (tag) =>
      tag[0] === LINKY_PUSH_MARKER_TAG && tag[1] === LINKY_PUSH_MARKER_VALUE,
  );
}

function describeEventRecipients(event: NostrEvent): string {
  const recipients = extractRecipientPubkeys(event);
  return recipients.length > 0 ? recipients.join(",") : "none";
}

export class SeenEventIdCache {
  private readonly entries = new Map<string, number>();
  private readonly ttlMs: number;
  private readonly maxEntries: number;

  constructor(options: SeenEventIdCacheOptions) {
    this.ttlMs = options.ttlMs;
    this.maxEntries = options.maxEntries;
  }

  has(eventId: string, nowMs: number): boolean {
    const expiresAt = this.entries.get(eventId);
    if (expiresAt === undefined) {
      return false;
    }

    if (expiresAt <= nowMs) {
      this.entries.delete(eventId);
      return false;
    }

    return true;
  }

  markSeen(eventId: string, nowMs: number): void {
    this.entries.delete(eventId);
    this.entries.set(eventId, nowMs + this.ttlMs);
    this.pruneOverflow();
  }

  pruneExpired(nowMs: number): void {
    // Entries are inserted in first-seen order, so with a fixed TTL the oldest
    // ids also expire first and cleanup can stop at the first live entry.
    for (const [eventId, expiresAt] of this.entries) {
      if (expiresAt > nowMs) {
        break;
      }
      this.entries.delete(eventId);
    }
  }

  get size(): number {
    return this.entries.size;
  }

  private pruneOverflow(): void {
    while (this.entries.size > this.maxEntries) {
      const oldestEventId = this.entries.keys().next().value;
      if (typeof oldestEventId !== "string") {
        return;
      }
      this.entries.delete(oldestEventId);
    }
  }
}

export class RelayWatcher {
  private static readonly CATCH_UP_LOOKBACK_SECONDS = 3 * 24 * 60 * 60;
  private static readonly LIVE_SUBSCRIPTION_REFRESH_MS = 10 * 60 * 1000;
  private static readonly SEEN_EVENT_CACHE_MAX_ENTRIES = 50_000;
  static readonly SEEN_EVENT_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

  private readonly relayUrls: string[];
  private readonly storage: PushStorage;
  private readonly pushDelivery: PushDeliveryService;
  private readonly seenEventIds: SeenEventIdCache;
  private readonly pool = new SimplePool({ enableReconnect: true });
  private liveDeliveryEnabled = false;
  private refreshIntervalHandle: ReturnType<typeof setInterval> | null = null;
  private subscription: ClosableSubscription | null = null;

  constructor(options: RelayWatcherOptions) {
    this.relayUrls = options.relayUrls;
    this.storage = options.storage;
    this.pushDelivery = options.pushDelivery;
    this.seenEventIds = new SeenEventIdCache({
      ttlMs: options.eventDedupeTtlMs,
      maxEntries: RelayWatcher.SEEN_EVENT_CACHE_MAX_ENTRIES,
    });
  }

  start(): void {
    if (this.subscription !== null) {
      return;
    }

    this.openSubscription("initial start");
    this.refreshIntervalHandle = setInterval(() => {
      this.restartSubscription("periodic refresh");
    }, RelayWatcher.LIVE_SUBSCRIPTION_REFRESH_MS);
  }

  async stop(): Promise<void> {
    if (this.refreshIntervalHandle !== null) {
      clearInterval(this.refreshIntervalHandle);
      this.refreshIntervalHandle = null;
    }
    this.liveDeliveryEnabled = false;
    await this.subscription?.close("server shutdown");
    this.subscription = null;
    this.pool.close(this.relayUrls);
  }

  private openSubscription(reason: string): void {
    const since =
      Math.floor(Date.now() / 1000) - RelayWatcher.CATCH_UP_LOOKBACK_SECONDS;
    this.liveDeliveryEnabled = false;
    console.info(
      `[push] opening relay watcher subscription reason=${reason} since=${since}`,
    );
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
          this.liveDeliveryEnabled = true;
          console.info("[push] relay watcher caught up; live delivery enabled");
        },
        onclose: (reasons) => {
          this.liveDeliveryEnabled = false;
          console.warn("[push] relay subscription closed", reasons);
        },
      },
    );
  }

  private restartSubscription(reason: string): void {
    this.liveDeliveryEnabled = false;
    this.subscription?.close(reason);
    this.subscription = null;
    this.openSubscription(reason);
  }

  private markSeen(eventId: string, nowMs: number): boolean {
    if (this.seenEventIds.has(eventId, nowMs)) {
      return false;
    }

    if (!this.storage.recordSeenEvent(eventId, nowMs)) {
      this.seenEventIds.markSeen(eventId, nowMs);
      return false;
    }

    this.seenEventIds.markSeen(eventId, nowMs);
    return true;
  }

  pruneSeen(nowMs: number): void {
    this.seenEventIds.pruneExpired(nowMs);
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

    if (!hasLinkyPushMarker(event)) {
      console.info(
        `[push] skipped non-push gift wrap id=${event.id} pubkey=${event.pubkey} recipients=${describeEventRecipients(event)}`,
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
    const nativeSubscriptionsByPubkey =
      this.storage.getNativeSubscriptionsForPubkeys(recipientPubkeys);
    if (
      subscriptionsByPubkey.size === 0 &&
      nativeSubscriptionsByPubkey.size === 0
    ) {
      console.info(
        `[push] skipped event without matching subscriptions id=${event.id} recipients=${recipientPubkeys.join(",")}`,
      );
      return;
    }

    if (!this.liveDeliveryEnabled) {
      console.info(
        `[push] suppressed historical gift wrap id=${event.id} recipients=${recipientPubkeys.join(",")} until live delivery is enabled`,
      );
      return;
    }

    const deliveries: Promise<void>[] = [];

    for (const recipientPubkey of recipientPubkeys) {
      const subscriptions = subscriptionsByPubkey.get(recipientPubkey) ?? [];
      const nativeSubscriptions =
        nativeSubscriptionsByPubkey.get(recipientPubkey) ?? [];
      if (subscriptions.length === 0 && nativeSubscriptions.length === 0) {
        console.info(
          `[push] no subscriptions for recipient id=${event.id} recipient=${recipientPubkey}`,
        );
        continue;
      }

      console.info(
        `[push] delivering gift wrap id=${event.id} recipient=${recipientPubkey} webSubscriptions=${subscriptions.length} nativeSubscriptions=${nativeSubscriptions.length}`,
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
            .deliverWeb(subscription, payloadData)
            .catch((error) => {
              console.warn(
                `[push] failed to deliver ${event.id} to ${recipientPubkey}`,
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
                `[push] failed to deliver native ${event.id} to ${recipientPubkey}`,
                error,
              );
            }),
        );
      }
    }

    await Promise.allSettled(deliveries);
  }
}
