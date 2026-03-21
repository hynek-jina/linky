import { validateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { Schema } from "effect";
import { nip19 } from "nostr-tools";
import { Slip39 } from "slip39-ts";
import { Hex64LowercaseString, Unit8ArraySchema } from "../utils/schemas";

const hasLengthBetween =
  (min: number, max: number) =>
  (input: unknown): input is Uint8Array =>
    input instanceof Uint8Array && input.length >= min && input.length <= max;

const hasLength =
  (expected: number) =>
  (input: unknown): input is Uint8Array =>
    input instanceof Uint8Array && input.length === expected;

const toWords = (value: string): ReadonlyArray<string> =>
  value
    .trim()
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word.length > 0);

const isNormalizedShare = (value: unknown): value is string => {
  if (typeof value !== "string") return false;
  if (!value) return false;
  if (value !== value.trim()) return false;
  if (value !== value.toLowerCase()) return false;
  if (/\s{2,}/.test(value)) return false;
  return toWords(value).length > 0;
};

const isSlip39Share = (value: unknown): value is string => {
  if (!isNormalizedShare(value)) return false;
  const words = toWords(value);
  if (words.length !== 20) return false;
  return Slip39.validateMnemonic(value);
};

const isBip39MnemonicWithWordCount =
  (expectedWordCount: number) =>
  (value: unknown): value is string => {
    if (typeof value !== "string") return false;
    const words = toWords(value);
    if (words.length !== expectedWordCount) return false;
    return validateMnemonic(words.join(" "), wordlist);
  };

const isOwnerLaneIndex = (value: unknown): value is number => {
  if (typeof value !== "number") return false;
  if (!Number.isInteger(value)) return false;
  return value >= 0;
};

const isNostrNsec = (value: unknown): value is string => {
  if (typeof value !== "string") return false;
  try {
    const decoded = nip19.decode(value);
    return decoded.type === "nsec" && decoded.data instanceof Uint8Array;
  } catch {
    return false;
  }
};

const isNostrNpub = (value: unknown): value is string => {
  if (typeof value !== "string") return false;
  try {
    const decoded = nip19.decode(value);
    return decoded.type === "npub" && typeof decoded.data === "string";
  } catch {
    return false;
  }
};

export const MasterSecret = Unit8ArraySchema.pipe(
  Schema.filter(hasLengthBetween(16, 64)),
  Schema.brand("MasterSecret"),
);
export type MasterSecret = typeof MasterSecret.Type;

export const NostrPrivateKey = Unit8ArraySchema.pipe(
  Schema.filter(hasLength(32)),
  Schema.brand("NostrPrivateKey"),
);
export type NostrPrivateKey = typeof NostrPrivateKey.Type;

export const NostrPublicKeyHex = Hex64LowercaseString.pipe(
  Schema.brand("NostrPublicKeyHex"),
);
export type NostrPublicKeyHex = typeof NostrPublicKeyHex.Type;

export const CashuSeed = Unit8ArraySchema.pipe(
  Schema.filter(hasLength(64)),
  Schema.brand("CashuSeed"),
);
export type CashuSeed = typeof CashuSeed.Type;

export const OwnerKey = Unit8ArraySchema.pipe(
  Schema.filter(hasLength(16)),
  Schema.brand("OwnerKey"),
);
export type OwnerKey = typeof OwnerKey.Type;

export const Slip39ShareNormalized = Schema.String.pipe(
  Schema.filter(isNormalizedShare),
  Schema.brand("Slip39ShareNormalized"),
);
export type Slip39ShareNormalized = typeof Slip39ShareNormalized.Type;

export const Slip39Share = Schema.String.pipe(
  Schema.filter(isSlip39Share),
).pipe(Schema.brand("Slip39Share"));
export type Slip39Share = typeof Slip39Share.Type;

export const Slip39Passphrase = Schema.String.pipe(
  Schema.brand("Slip39Passphrase"),
);
export type Slip39Passphrase = typeof Slip39Passphrase.Type;

export const OwnerLaneIndex = Schema.Number.pipe(
  Schema.filter(isOwnerLaneIndex),
  Schema.brand("OwnerLaneIndex"),
);
export type OwnerLaneIndex = typeof OwnerLaneIndex.Type;

export const NostrNsec = Schema.String.pipe(Schema.filter(isNostrNsec)).pipe(
  Schema.brand("NostrNsec"),
);
export type NostrNsec = typeof NostrNsec.Type;

export const NostrNpub = Schema.String.pipe(Schema.filter(isNostrNpub)).pipe(
  Schema.brand("NostrNpub"),
);
export type NostrNpub = typeof NostrNpub.Type;

export const Bip39Mnemonic12 = Schema.String.pipe(
  Schema.filter(isBip39MnemonicWithWordCount(12)),
  Schema.brand("Bip39Mnemonic12"),
);
export type Bip39Mnemonic12 = typeof Bip39Mnemonic12.Type;

export const Bip39Mnemonic24 = Schema.String.pipe(
  Schema.filter(isBip39MnemonicWithWordCount(24)),
  Schema.brand("Bip39Mnemonic24"),
);
export type Bip39Mnemonic24 = typeof Bip39Mnemonic24.Type;

export const OwnerRole = Schema.Literal(
  "meta",
  "contacts",
  "cashu",
  "messages",
);
export type OwnerRole = typeof OwnerRole.Type;

export const HttpsUrl = Schema.String.pipe(
  Schema.filter(
    (input) =>
      /^https:\/\/[^\s/$.?#].[^\s]*$/.test(input) ||
      "Must be a valid HTTPS URL",
  ),
  Schema.brand("HttpsUrl"),
);
export type HttpsUrl = typeof HttpsUrl.Type;

export const Lud16Address = Schema.String.pipe(
  Schema.lowercased(),
  Schema.filter(
    (input) =>
      /^[a-z0-9._-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(input) ||
      "Must be a valid lud16 address",
  ),
  Schema.brand("Lud16Address"),
);
