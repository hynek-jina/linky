import type { AppNostrPool } from "../app/lib/nostrPool";
import { emitInspectorEvent, isInspectorEnabled } from "./inspectorBus";

let nextSubscriptionId = 1;

const describeKinds = (filter: { kinds?: number[] }): string => {
  return filter.kinds?.join(",") ?? "*";
};

export const instrumentAppNostrPool = (pool: AppNostrPool): AppNostrPool => {
  if (!isInspectorEnabled()) return pool;

  const publish: AppNostrPool["publish"] = (relays, event) => {
    emitInspectorEvent({
      channel: "nostr",
      type: "publish",
      direction: "out",
      summary: `publish kind ${event.kind} → ${relays.length} relay(s)`,
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
            summary: `publish ok @ ${relay} (kind ${event.kind})`,
            data: { relay, eventId: event.id, kind: event.kind, reason },
          });
        },
        (error: unknown) => {
          emitInspectorEvent({
            channel: "nostr",
            type: "publish.result",
            direction: "out",
            summary: `publish FAILED @ ${relay} (kind ${event.kind})`,
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
        summary: `query kinds ${describeKinds(filter)} → ${events.length} event(s)`,
        data: { relays, filter, durationMs: Date.now() - startedAtMs, events },
      });
      return events;
    } catch (error) {
      emitInspectorEvent({
        channel: "nostr",
        type: "query",
        direction: "in",
        summary: `query FAILED (kinds ${describeKinds(filter)})`,
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
      summary: `subscribe #${subscriptionId} kinds ${describeKinds(filter)} @ ${relays.length} relay(s)`,
      data: { subscriptionId, relays, filter },
    });
    return pool.subscribe(relays, filter, {
      ...params,
      onevent: (event) => {
        emitInspectorEvent({
          channel: "nostr",
          type: "event",
          direction: "in",
          summary: `event kind ${event.kind} (sub #${subscriptionId})`,
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
