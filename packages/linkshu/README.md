# @linky/linkshu

Linky's cashu wallet as a typed library. Every wallet operation the app
performs (receive a token, send an amount, pay an invoice, top up, validate,
restore, …) is defined here as an Effect service over branded `Schema` types.
Raw cashu-ts types never cross the package boundary: callers hand in drafts
and get receipts; token text is the currency of the API.

> **Status: foundation (#287), token codec (#288), and the receive vertical
> (#289) implemented.** The ports with their in-memory defaults, the
> inspector, mint/wallet management (including the single shared
> wallet-instance cache), the canonical token codec, the token lifecycle
> state machine, and `receive` (deterministic re-signing with
> counter-collision recovery over the lease-locked counter) are real. The
> remaining operation verticals are still interface-contract stubs (#286)
> and land slice by slice.

## Verticals

- `receive/` — one call from pasted/scanned text to an `accepted` row:
  extraction, decoding, dedup by token text, deterministic re-signing with
  counter-collision recovery, lifecycle bookkeeping
- `send/` — amount in, encoded token out: NUT-07 pre-filter, swap with
  disjoint send/keep counter blocks, change persisted before the receipt
  resolves
- `melt/` — bolt11 payment: quote, fee-inclusive swap, NUT-08 blank-output
  accounting that advances the counter past the full blank range
- `validation/` — NUT-07 proof-state checks: batched checkstate, per-row
  spent marking, local (signature-free) merge of surviving proofs, issued
  tokens pruned once the recipient claims them
- `restore/` — NUT-09 recovery from seed across known mints and keysets,
  with cursor-windowed scanning and a deep fallback; also owns the
  seed-bound state wipe
- `topup/` — a self-recovering flow: mint quote out, invoice paid, proofs
  minted; pending quotes persist across crashes and resume
- `autoswap/` — consolidate a foreign mint into the main mint
  (melt-then-mint with fee pre-probe); pending claims recover on their own
- `feeProbe/` — Lightning fee estimation via a real melt quote (NUT-06
  publishes none)
- `token/` — the one token codec (v3 JSON, v4 CBOR, legacy cashu.me JSON)
  plus the `Tokens` read model and lifecycle transitions
- `mint/` — mint info (name, `input_fee_ppk`, MPP) and the known-mint set;
  internally the single wallet-instance cache every vertical shares

## Token lifecycle

The package owns the state machine; platforms persist rows, never decide
states. States: `pending`, `accepted`, `reserved`, `issued`, `externalized`,
`error` — only `accepted` counts as balance. Dedup is by token text against
the row's original encoding. Failures follow one classification rule
everywhere: mark a row `error` only on a _definitive_ mint rejection;
transient failures (network, timeout, 5xx) retry and never change state.
Funds are never outside the store: change, remainders, and recovered proofs
are persisted as `accepted` rows before any receipt resolves.

## Ports

Platform capabilities come in as services the package defines; in-memory
defaults are exported so tests and experiments need no wiring.

- `KeyValueStore` — durable string storage **with lease-lock primitives**.
  Plain get/set is insufficient: deterministic counters must be advanced
  under cross-context mutual exclusion (tabs, service worker, CLI
  processes). The port stays dumb — acquisition retries, queueing, and
  timeouts are package semantics.
- `TokenStore` — a dumb row store (`insert`/`update`/`remove`/`loadAll`).
  All lifecycle transitions are package logic; Evolu specifics (owner lanes,
  ids derived from token text, sparse payloads) live in the app-side
  adapter.
- `CashuSeed` — hands the package raw BIP-39 seed bytes. The package is the
  trust boundary the seed exists for; platforms never derive anything.
- `Inspector` — optional diagnostics bus (`orNoop` pattern, cloned from
  linkstr): accept/send/melt/quote/restore traffic, lifecycle transitions,
  and counter movements become inspector rows when a composition root
  provides the layer. Costs nothing when absent. No event ever carries seed
  material or proof secrets.

Deliberately **not** abstracted (linkstr precedent): HTTP (cashu-ts talks to
mints directly), crypto primitives, and the clock (Effect's `Clock` is
already injectable).

## Rules

- **Environment-agnostic.** No React, no Evolu, no `window`/`localStorage`
  imports. The CLI wallet living in-tree as the package's first consumer
  keeps this honest.
- **No raw cashu-ts types in the public API.** The package pins and wraps
  cashu-ts v4 behind its own domain schema, so cashu-ts upgrades stay
  behind the boundary.
- **The package owns token-lifecycle semantics.** Every platform gets the
  same transitions, dedup, and error classification from its dumb row store.
- **Counters are sacred.** Deterministic counters advance only under the
  lease lock, never move backwards, and over-advance on ambiguity (blank
  outputs, collisions) — a gap costs a restore scan, a reuse costs a mint
  rejection loop.
- **Serializable errors.** All errors are `Schema.TaggedError`, so failures
  can be persisted on token rows without ad-hoc stringification.
- **No dependency edge to `@linky/linkstr`** in either direction. linkstr's
  small internal token classifier is an accepted duplicate.
- **Deferred verticals are designed-around, not built:** LNURL/LN-address
  payment, npub.cash claim and mint-preference sync, and contact payment
  (the app composes a linkshu `send` receipt with linkstr delivery, and
  confirms it via the `pending` row state). Nothing in this surface may
  preclude them.
- **Linky's needs win** every generality conflict; the package is not built
  for publication.

## Tests

Unit tests are colocated (`src/**/*.test.ts`) and run with
`bun run --filter @linky/linkshu test` (included in the root `bun run test`).
The integration suite in `tests/integration/` exercises the public API
against the dev-stack docker mint:

```bash
docker compose -f docker-compose.dev.yml up -d --wait cashu-mint
bun run --filter @linky/linkshu test:integration
```

CI runs it as the `linkshu-integration` job in `tests.yml`.

## Usage

Service assembly has one home: `linkshuServices(config)` layers every
vertical over the ports. React apps will use `@linky/linkshu-react` (phase
two, mirroring linkstr-react's atom architecture) instead of wiring layers
themselves. Non-React environments (the CLI wallet) use the headless
one-shot runner:

```ts
import { Effect } from "effect";
import { Receive, ReceiveDraft, runLinkshu } from "@linky/linkshu";

const receipt = await runLinkshu(
  { bip39Seed, keyValueStore, tokenStore },
  Effect.gen(function* () {
    const receive = yield* Receive;
    return yield* receive.receive(new ReceiveDraft({ text: scannedText }));
  }),
);
```
