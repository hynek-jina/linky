import { Context, Effect, Layer } from "effect";
import { SimplePool } from "nostr-tools";

export class NostrPool extends Context.Tag("NostrPool")<
  NostrPool,
  SimplePool
>() {
  static Live = () =>
    Layer.scoped(
      NostrPool,
      Effect.acquireRelease(
        Effect.sync(() => new SimplePool()),
        (pool) => Effect.sync(() => pool.destroy()),
      ),
    );
}
