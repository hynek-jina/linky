# @linky/core — Package Strategy

## Purpose

A platform-independent core package containing all Linky business logic, data schemas, and service interfaces. Designed to be consumed by any frontend (web, React Native, CLI) — each consumer provides its own storage and platform layer.

## Structure (horizontal, domain-local)

Core is organized by domain, not by global technical buckets. Keep schemas/types/errors close to the code that uses them.

```text
packages/core/src/
  identity/
    schema.ts
    errors.ts
    services.ts
    operations.ts
    live.ts
    test.ts
    index.ts
  nostr/
    schema.ts
    errors.ts
    services.ts
    operations.ts
    live.ts
    test.ts
    index.ts
  evolu/
    schema.ts
    errors.ts
    services.ts
    operations.ts
    live.ts
    test.ts
    index.ts
  cashu/
    schema.ts
    errors.ts
    services.ts
    operations.ts
    live.ts
    test.ts
    index.ts
  shared/
    schema.ts
    errors.ts
  index.ts
```

Promotion rule: keep definitions local by default. Move to `shared/` only when used by 2+ domains.

## Libraries

- **Effect (`effect`)** — used throughout for services, layers, error handling, and DI. Use latest stable line (`3.19.x` at time of writing).
- **Schema from Effect** — import from `effect` (`import { Schema } from "effect"`) or `effect/Schema`. Do not add a separate `@effect/schema` dependency by default.
- **nostr-tools** — Nostr event signing/verification, relay pool, NIP implementations. Direct dependency of core.
- **@cashu/cashu-ts** — Cashu mint operations, token parsing/validation. Direct dependency of core.
- **SLIP-39 / BIP-85 libraries** — for seed parsing and deterministic derivation paths (identity, owner lanes, cashu wallet seed).

## Key architectural decisions

### Full Effect adoption

All core logic is written using Effect. Service contracts are defined in `services.ts` using `Context.Tag`/`Effect.Service`, implementations are provided as `Layer` in `live.ts`, and business workflows are implemented in `operations.ts` using `Effect.gen`. The Effect runtime is provided at the app edge by each consumer.

Naming conventions:
- `services.ts` = service contracts (what core needs)
- `operations.ts` = business workflows (what core does)
- `live.ts` = live layer implementations (e.g. `FooLive`)
- `test.ts` = test/mock layers (e.g. `FooTest`, `FooMock`)

### Storage is abstract — no Evolu in core

Core defines **repository service interfaces** (e.g. `ContactsRepo`, `MessagesRepo`, `CashuTokenRepo`) as Effect services with typed operations (find, save, update, remove, query). Core never imports Evolu or any specific database library.

Each consumer app provides its own repository implementations:
- **Web app** — implements repos using Evolu (SQLite WASM + sync)
- **React Native app** — could implement repos using op-sqlite or any native SQLite
- **CLI tool** — could implement repos using better-sqlite3 or file-based storage

This means core is fully portable and testable without any browser or platform dependency.

### Owner rotation logic lives in core

The owner rotation mechanism (write-delta tracking, cooldown enforcement, lane migration, pointer management) is business logic. It lives in core's operations layer and talks to the abstract repo interfaces. The actual owner/lane switching mechanics are handled by each repo implementation behind the interface.

### Platform-independent `live/` implementations in core

Core provides default `Layer` implementations only for things that are genuinely cross-platform:
- Crypto operations (identity derivation, signing, verification)
- Protocol logic (Credo promise/settlement creation and validation)
- Network operations (Nostr relay communication, Cashu mint API calls)

Repository implementations are **never** in core — they always come from the consumer app.

### nostr-tools as a direct dependency

Core depends on nostr-tools directly rather than abstracting behind a custom Nostr interface. The library is stable, well-maintained, and works across platforms. No need for an extra abstraction layer here.

## Domain breakdown

These are the logical domains that core covers:

1. **Identity** — SLIP-39 parsing, BIP-85 derivation, Nostr keypair generation, deterministic owner lane derivation, cashu wallet seed derivation
2. **Nostr** — relay pool management, event creation/signing/verification, NIP-17 gift-wrap encryption/decryption, message parsing (replies, edits, reactions)
3. **Cashu** — mint operations, token parsing/validation/spend, token restore, wallet seed management
4. **Credo** — promise creation/validation, settlement creation/validation, partial settlement, wire format encode/decode (`credoA` + base64url)
5. **Contacts** — CRUD, limits enforcement (`MAX_CONTACTS_PER_OWNER`), owner-scoped queries
6. **Messages** — send/edit, reactions, inbox sync, retention enforcement, owner-scoped queries
7. **Payments** — Lightning invoice/LN address payment orchestration, contact payment via Cashu/Credo message flow, npub.cash claim

## What each consumer app provides

| Consumer provides | What it is |
|---|---|
| Repo Layers (ContactsRepo, MessagesRepo, etc.) | Storage implementation for the platform |
| Owner meta / lane management wiring | How owner lanes map to the underlying DB |
| UI / rendering | React, React Native, terminal, etc. |
| Effect runtime | `Effect.runPromise` / `Effect.runFork` at the app edge |
| Platform-specific config | Relay lists, mint URLs, storage paths, etc. |

## Migration approach

The web app migrates incrementally:
- Import schemas and services from `@linky/core` one domain at a time
- Write Evolu-backed repo implementations in `apps/web-app`
- Delete old spaghetti code as each domain is replaced
- No big-bang rewrite — both old and new code coexist during migration
