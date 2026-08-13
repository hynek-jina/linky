import { Effect, Layer, Option } from "effect";
import { NostrTransport } from "../services/NostrTransport";
import type { NostrTransportService } from "../services/NostrTransport";
import { Inspector } from "./Inspector";
import type { InspectorService } from "./Inspector";
import {
  WireEventReceived,
  WirePublished,
  WireSubscribed,
  WireSubscriptionEnded,
} from "./events";

const tapWire = (
  inner: NostrTransportService,
  inspector: InspectorService,
): NostrTransportService => ({
  publish: (relays, event) =>
    inner
      .publish(relays, event)
      .pipe(
        Effect.tap((results) =>
          Effect.sync(() =>
            inspector.emit(
              new WirePublished({ wrapId: event.id, wrap: event, results }),
            ),
          ),
        ),
      ),
  subscribe: (relay, filter, onEvent) =>
    Effect.suspend(() => {
      inspector.emit(new WireSubscribed({ relay, filter }));
      return inner.subscribe(relay, filter, (event) => {
        inspector.emit(new WireEventReceived({ relay, event }));
        onEvent(event);
      });
    }).pipe(
      Effect.tap((reason) =>
        Effect.sync(() =>
          inspector.emit(new WireSubscriptionEnded({ relay, detail: reason })),
        ),
      ),
      Effect.tapError((error) =>
        Effect.sync(() =>
          inspector.emit(
            new WireSubscriptionEnded({ relay, detail: error.detail }),
          ),
        ),
      ),
    ),
});

/**
 * Decorates whatever transport layer it is given with wire-level inspector
 * events; a pass-through when no `Inspector` is provided.
 */
export const inspectTransport = (
  transport: Layer.Layer<NostrTransport>,
): Layer.Layer<NostrTransport> =>
  Layer.effect(
    NostrTransport,
    Effect.map(
      Effect.all([NostrTransport, Effect.serviceOption(Inspector)]),
      ([inner, inspector]) =>
        Option.match(inspector, {
          onNone: () => inner,
          onSome: (service) => tapWire(inner, service),
        }),
    ),
  ).pipe(Layer.provide(transport));
