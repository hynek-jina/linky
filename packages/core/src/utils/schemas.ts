import { Schema } from "effect";

export const Unit8ArraySchema = Schema.declare(
  (input: unknown): input is Uint8Array => input instanceof Uint8Array,
);
export type Unit8ArraySchema = typeof Unit8ArraySchema.Type;

export const NonEmptyTrimmedString = Schema.String.pipe(
  Schema.trimmed(),
  Schema.nonEmptyString(),
  Schema.brand("NonEmptyTrimmedString"),
);
export type NonEmptyTrimmedString = typeof NonEmptyTrimmedString.Type;

export const Hex64LowercaseString = Schema.String.pipe(
  Schema.filter(
    (input) =>
      /^[0-9a-f]{64}$/.test(input) ||
      "Must be a 64-character lowercase hexadecimal string",
  ),
  Schema.brand("Hex64LowercaseString"),
).annotations({
  description:
    "A 64-character lowercase hexadecimal string. Represents 32 bytes of data.",
});
export type Hex64LowercaseString = typeof Hex64LowercaseString.Type;

export const Hex128LowercaseString = Schema.String.pipe(
  Schema.filter(
    (input) =>
      /^[0-9a-f]{64}$/.test(input) ||
      "Must be a 64-character lowercase hexadecimal string",
  ),
  Schema.brand("Hex128LowercaseString"),
).annotations({
  description:
    "A 128-character lowercase hexadecimal string. Represents 64 bytes of data.",
});
export type Hex128LowercaseString = typeof Hex128LowercaseString.Type;

export const UnixTimeSeconds = Schema.Number.pipe(
  Schema.finite(),
  Schema.int(),
  Schema.brand("UnixTimeSeconds"),
);
export type UnixTimeSeconds = typeof UnixTimeSeconds.Type;

export const WebsocketUrl = Schema.String.pipe(
  Schema.filter(
    (input) =>
      /^wss?:\/\/.+/.test(input) ||
      "Must be a valid WebSocket URL starting with ws:// or wss://",
  ),
  Schema.brand("WebsocketUrl"),
).annotations({
  description: "A WebSocket URL starting with ws:// or wss://",
});
export type WebsocketUrl = typeof WebsocketUrl.Type;
