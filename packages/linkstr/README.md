# @linky/linkstr

Linky's Nostr protocol as a typed library. Every operation the app publishes
(send a chat message, react, pay, update profile/status, …) and every inbound
action it expects are defined here as Effect `Schema` types. Raw nostr events
never cross the package boundary: callers hand in drafts and get receipts;
listeners consume a tagged union of app-level facts.

Currently implements the **reactions vertical** (kind 7 + kind 5 retraction
inside NIP-59 gift wraps) as the reference for all other verticals.

## Shape of a vertical

- `reactions/domain.ts` — drafts and receipts (`ReactionDraft`, `ReactionReceipt`)
- `reactions/events.ts` — inbound facts (`ReactionAdded`, `OwnReactionConfirmed`,
  `ReactionRetracted`) plus `WrapDropped` with a typed reason
- `reactions/codec.ts` — the only place the wire format (kinds, tags) exists;
  encode and decode roundtrip by construction
- `reactions/Reactions.ts` — the operation service (`react`, `retract`)
- `inbox/decodeReactionWrap.ts` — pure pipeline for one incoming kind-1059 wrap

## Rules

- **Environment-agnostic.** No React, no Evolu, no `window`. Capabilities come
  in as services: `LinkstrIdentity`, `NostrTransport`, `RelayPolicy`.
- **Honest delivery.** A NIP-17 send publishes the same rumor wrapped to self
  and to the peer. Success means the _recipient's_ copy was accepted by at
  least one relay; "only my self copy landed" is the `RecipientNotReached`
  error, never a silent success.
- **No hidden retries.** `NostrTransport.publish` reports per-relay outcomes;
  retry/backoff policy belongs to the outbox (not built yet).
- **Serializable errors.** All errors are `Schema.TaggedError`, so failures can
  be persisted (e.g. on future outbox rows) without ad-hoc stringification.

## Usage

```ts
import { Effect, Layer } from "effect";
import {
  LinkstrIdentity,
  NostrTransportSimplePool,
  Reactions,
  RelayPolicy,
} from "@linky/linkstr";

const dependencies = Layer.mergeAll(
  LinkstrIdentity.fromSecretKey(secretKey),
  RelayPolicy.fixed({ readRelays, writeRelays }),
  NostrTransportSimplePool,
);

const program = Effect.gen(function* () {
  const reactions = yield* Reactions;
  return yield* reactions.react(draft); // ReactionReceipt | RecipientNotReached | NoRelayReachable
});

Effect.runPromise(
  program.pipe(
    Effect.provide(Reactions.Default.pipe(Layer.provide(dependencies))),
  ),
);
```
