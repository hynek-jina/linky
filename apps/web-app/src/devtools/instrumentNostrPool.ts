import type { AppNostrPool } from "../app/lib/nostrPool";
import { emitInspectorEvent, isInspectorEnabled } from "./inspectorBus";
import {
  nostrKindLabel,
  nostrKindsLabel,
  nostrPublishPurpose,
} from "./inspectorGlossary";
import { getNostrEventIntent } from "./nostrIntent";

let nextSubscriptionId = 1;

const describeKinds = (filter: { kinds?: number[] }): string => {
  return nostrKindsLabel(filter.kinds);
};

// Compact "what were those events" suffix for query results, based on intent
// tags registered when the app created or decrypted them. Fresh wraps are not
// tagged until the inbox pipeline decrypts them, so first-time fetches may
// show fewer intents than events.
const describeEventIntents = (
  events: ReadonlyArray<{ id: string }>,
): string => {
  const counts = new Map<string, number>();
  for (const event of events) {
    const intent = getNostrEventIntent(event.id);
    if (intent !== undefined) counts.set(intent, (counts.get(intent) ?? 0) + 1);
  }
  if (counts.size === 0) return "";
  const parts = [...counts.entries()].map(([intent, count]) =>
    count > 1 ? `${count}× ${intent}` : intent,
  );
  return ` — ${parts.join(", ")}`;
};

export const instrumentAppNostrPool = (pool: AppNostrPool): AppNostrPool => {
  if (!isInspectorEnabled()) return pool;

  const publish: AppNostrPool["publish"] = (relays, event) => {
    const intent =
      getNostrEventIntent(event.id) ?? nostrPublishPurpose(event.kind);
    const intentSuffix = intent === undefined ? "" : ` — ${intent}`;
    emitInspectorEvent({
      channel: "nostr",
      type: "publish",
      direction: "out",
      summary: `publish ${nostrKindLabel(event.kind)} → ${relays.length} relay(s)${intentSuffix}`,
      data: { relays, event, intent },
    });
    const results = pool.publish(relays, event);
    results.forEach((result, index) => {
      const relay = relays[index] ?? `relay[${index}]`;
      // Observing marks rejections as handled, so dev loses unhandled-rejection
      // noise for ignored publishes — acceptable for an inspector tap.
      void result.then(
        (reason) => {
          emitInspectorEvent({
            channel: "nostr",
            type: "publish.result",
            direction: "out",
            summary: `publish ok @ ${relay} (${nostrKindLabel(event.kind)})${intentSuffix}`,
            data: {
              relay,
              eventId: event.id,
              kind: event.kind,
              reason,
              intent,
            },
          });
        },
        (error: unknown) => {
          emitInspectorEvent({
            channel: "nostr",
            type: "publish.result",
            direction: "out",
            summary: `publish FAILED @ ${relay} (${nostrKindLabel(event.kind)})${intentSuffix}`,
            data: { relay, eventId: event.id, kind: event.kind, error, intent },
          });
        },
      );
    });
    return results;
  };

  const querySync: AppNostrPool["querySync"] = async (
    relays,
    filter,
    params,
  ) => {
    const startedAtMs = Date.now();
    try {
      const events = await pool.querySync(relays, filter, params);
      emitInspectorEvent({
        channel: "nostr",
        type: "query",
        direction: "in",
        summary: `query ${describeKinds(filter)} → ${events.length} event(s)${describeEventIntents(events)}`,
        data: { relays, filter, durationMs: Date.now() - startedAtMs, events },
      });
      return events;
    } catch (error) {
      emitInspectorEvent({
        channel: "nostr",
        type: "query",
        direction: "in",
        summary: `query FAILED (${describeKinds(filter)})`,
        data: { relays, filter, durationMs: Date.now() - startedAtMs, error },
      });
      throw error;
    }
  };

  const subscribe: AppNostrPool["subscribe"] = (relays, filter, params) => {
    const subscriptionId = nextSubscriptionId++;
    emitInspectorEvent({
      channel: "nostr",
      type: "subscribe",
      summary: `subscribe #${subscriptionId} for ${describeKinds(filter)} @ ${relays.length} relay(s)`,
      data: { subscriptionId, relays, filter },
    });
    return pool.subscribe(relays, filter, {
      ...params,
      onevent: (event) => {
        const intent = getNostrEventIntent(event.id);
        emitInspectorEvent({
          channel: "nostr",
          type: "event",
          direction: "in",
          summary: `${nostrKindLabel(event.kind)} event (sub #${subscriptionId})${intent === undefined ? "" : ` — ${intent}`}`,
          data: { subscriptionId, event, intent },
        });
        params.onevent?.(event);
      },
      onclose: (reasons) => {
        emitInspectorEvent({
          channel: "nostr",
          type: "subscribe.closed",
          summary: `subscribe #${subscriptionId} closed`,
          data: { subscriptionId, reasons },
        });
        params.onclose?.(reasons);
      },
    });
  };

  return {
    listConnectionStatus: pool.listConnectionStatus.bind(pool),
    publish,
    querySync,
    subscribe,
  };
};
