import { Atom } from "@effect-atom/atom-react";
import { WrapInbox } from "@linky/linkstr";
import type { UnixSeconds, WrapInboxEvent } from "@linky/linkstr";
import { Effect, Stream } from "effect";
import { linkstrRuntimeAtom } from "./runtime";

export interface WrapInboxHandler {
  /** Backfill cursor persisted by a previous session, if any. */
  readonly since?: UnixSeconds;
  /** Called once per inbox event, in order; the next event waits for it. */
  readonly onEvent: (event: WrapInboxEvent) => void | Promise<void>;
  /** Called after `onEvent` settles; persist as the next session's `since`. */
  readonly onCursor?: (cursor: UnixSeconds) => void;
}

/** Null keeps the inbox closed; the app registers a handler to open it. */
export const wrapInboxHandlerAtom = Atom.make<WrapInboxHandler | null>(null);

/**
 * While mounted (and a handler is registered), runs the single kind-1059
 * subscription and feeds every typed inbox event through the handler.
 * Unmounting — or a config/handler swap — closes the relay subscriptions.
 * The atom's value is the last handled event, which is useful for debugging.
 */
export const wrapInboxAtom = linkstrRuntimeAtom.atom((get) => {
  const handler = get(wrapInboxHandlerAtom);
  if (handler === null) return Stream.empty;
  return Stream.unwrapScoped(
    Effect.gen(function* () {
      const inbox = yield* WrapInbox;
      const feed = yield* inbox.open(
        handler.since === undefined ? {} : { since: handler.since },
      );
      const handle = (event: WrapInboxEvent) =>
        Effect.promise(async () => {
          await handler.onEvent(event);
        }).pipe(
          Effect.andThen(feed.cursor),
          Effect.tap((cursor) =>
            Effect.sync(() => {
              if (cursor !== null) handler.onCursor?.(cursor);
            }),
          ),
          Effect.as(event),
        );
      return Stream.mapEffect(feed.events, handle);
    }),
  );
});
