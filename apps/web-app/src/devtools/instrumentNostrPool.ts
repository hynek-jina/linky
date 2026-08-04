import type { AppNostrPool } from "../app/lib/nostrPool";
import { emitInspectorEvent, isInspectorEnabled } from "./inspectorBus";
import { nostrKindLabel, nostrKindsLabel } from "./inspectorGlossary";

let nextSubscriptionId = 1;

const describeKinds = (filter: { kinds?: number[] }): string => {
  return nostrKindsLabel(filter.kinds);
};

export const instrumentAppNostrPool = (pool: AppNostrPool): AppNostrPool => {
  if (!isInspectorEnabled()) return pool;

  const publish: AppNostrPool["publish"] = (relays, event) => {
    emitInspectorEvent({
      channel: "nostr",
      type: "publish",
      direction: "out",
      summary: `publish ${nostrKindLabel(event.kind)} → ${relays.length} relay(s)`,
      data: { relays, event },
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
            summary: `publish ok @ ${relay} (${nostrKindLabel(event.kind)})`,
            data: { relay, eventId: event.id, kind: event.kind, reason },
          });
        },
        (error: unknown) => {
          emitInspectorEvent({
            channel: "nostr",
            type: "publish.result",
            direction: "out",
            summary: `publish FAILED @ ${relay} (${nostrKindLabel(event.kind)})`,
            data: { relay, eventId: event.id, kind: event.kind, error },
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
        summary: `query ${describeKinds(filter)} → ${events.length} event(s)`,
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
        emitInspectorEvent({
          channel: "nostr",
          type: "event",
          direction: "in",
          summary: `${nostrKindLabel(event.kind)} event (sub #${subscriptionId})`,
          data: { subscriptionId, event },
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
