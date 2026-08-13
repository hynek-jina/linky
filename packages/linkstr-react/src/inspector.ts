import { Atom } from "@effect-atom/atom-react";
import { Inspector } from "@linky/linkstr";
import type { InspectorEvent } from "@linky/linkstr";
import { Effect, Stream } from "effect";
import { linkstrRuntimeAtom } from "./runtime";

/** Where inspector events go; null keeps the feed unconsumed. */
export const inspectorSinkAtom = Atom.make<
  ((event: InspectorEvent) => void) | null
>(null);

/**
 * Mount to run the inspector feed as long as a sink is set. Emits nothing
 * unless the config enables the inspector (`Inspector.disabled` yields an
 * empty stream).
 */
export const inspectorEventsAtom = linkstrRuntimeAtom.atom((get) => {
  const sink = get(inspectorSinkAtom);
  if (sink === null) return Stream.empty;
  return Stream.unwrap(
    Effect.map(Inspector, (inspector) =>
      Stream.tap(inspector.events, (event) => Effect.sync(() => sink(event))),
    ),
  );
});
