import { Context } from "effect";

export type NostrConsumerOperations = Record<never, never>;

export class NostrConsumer extends Context.Tag("NostrConsumer")<
  NostrConsumer,
  NostrConsumerOperations
>() {}
