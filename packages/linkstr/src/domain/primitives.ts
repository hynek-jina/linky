import { Schema } from "effect";

const HEX_64 = /^[0-9a-f]{64}$/;

export const Pubkey = Schema.String.pipe(
  Schema.pattern(HEX_64),
  Schema.brand("Pubkey"),
);
export type Pubkey = typeof Pubkey.Type;

/**
 * Id of the inner (unsigned) rumor — the stable identity of a message or
 * reaction. Distinct from WrapId: gift wraps are regenerated on every publish,
 * rumor ids are not.
 */
export const RumorId = Schema.String.pipe(
  Schema.pattern(HEX_64),
  Schema.brand("RumorId"),
);
export type RumorId = typeof RumorId.Type;

/** Id of a signed outer gift-wrap event — transport-level identity only. */
export const WrapId = Schema.String.pipe(
  Schema.pattern(HEX_64),
  Schema.brand("WrapId"),
);
export type WrapId = typeof WrapId.Type;

/**
 * Locally generated id travelling in the ["client", …] tag; the key used to
 * reconcile an optimistic local row with its relay echo.
 */
export const ClientId = Schema.NonEmptyTrimmedString.pipe(
  Schema.brand("ClientId"),
);
export type ClientId = typeof ClientId.Type;

export const RelayUrl = Schema.NonEmptyTrimmedString.pipe(
  Schema.filter((url) => url.startsWith("wss://") || url.startsWith("ws://"), {
    description: "a ws:// or wss:// relay url",
  }),
  Schema.brand("RelayUrl"),
);
export type RelayUrl = typeof RelayUrl.Type;

export const UnixSeconds = Schema.Int.pipe(
  Schema.positive(),
  Schema.brand("UnixSeconds"),
);
export type UnixSeconds = typeof UnixSeconds.Type;

export const NostrSecretKey = Schema.Uint8ArrayFromSelf.pipe(
  Schema.filter((bytes) => bytes.length === 32, {
    description: "a 32-byte nostr secret key",
  }),
  Schema.brand("NostrSecretKey"),
);
export type NostrSecretKey = typeof NostrSecretKey.Type;
