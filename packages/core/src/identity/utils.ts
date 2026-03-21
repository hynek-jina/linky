import { hmac } from "@noble/hashes/hmac.js";
import { sha512 } from "@noble/hashes/sha2.js";
import { HDKey } from "@scure/bip32";
import { entropyToMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { Effect, Schema } from "effect";
import { nip19 } from "nostr-tools";
import { Slip39 } from "slip39-ts";
import {
  CASHU_SEED_PATH,
  cashuOwnerPath,
  contactsOwnerPath,
  messagesOwnerPath,
  META_OWNER_PATH,
} from "./derivationPaths";
import {
  Bip39Mnemonic12,
  Bip39Mnemonic24,
  MasterSecret,
  NostrNpub,
  NostrNsec,
  NostrPrivateKey,
  NostrPublicKeyHex,
  OwnerKey,
  OwnerLaneIndex,
  OwnerRole,
  Slip39Passphrase,
  Slip39Share,
} from "./domain";

const BIP85_HMAC_KEY = new TextEncoder().encode("bip-entropy-from-k");
const EMPTY_PASSPHRASE = Slip39Passphrase.make("");
const ZERO_OWNER_LANE_INDEX = OwnerLaneIndex.make(0);

export interface CreateSlip39ShareOptions {
  readonly passphrase?: Slip39Passphrase;
  readonly title?: string;
}

export class IdentityUtilsError extends Schema.TaggedError<IdentityUtilsError>()(
  "IdentityUtilsError",
  {
    cause: Schema.optional(Schema.Unknown),
    message: Schema.String,
  },
) {}

const decodeUnknown = <A, I>(
  schema: Schema.Schema<A, I, never>,
  input: unknown,
  message: string,
): Effect.Effect<A, IdentityUtilsError> =>
  Effect.try({
    try: () => Schema.decodeUnknownSync(schema)(input),
    catch: (cause) => new IdentityUtilsError({ cause, message }),
  });

const toWordList = (rawText: string): ReadonlyArray<string> =>
  rawText
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word.length > 0);

const toSecretBytes = (value: unknown): Uint8Array | null => {
  if (!Array.isArray(value)) return null;

  const out: number[] = [];
  for (const item of value) {
    if (typeof item !== "number") return null;
    if (!Number.isInteger(item)) return null;
    if (item < 0 || item > 255) return null;
    out.push(item);
  }

  return Uint8Array.from(out);
};

const bip85Entropy = (
  root: HDKey,
  path: string,
  bytes: 16 | 32,
): Uint8Array => {
  const node = root.derive(path);
  if (!node.privateKey) throw new Error(`BIP-85 derivation failed at ${path}`);
  return hmac(sha512, BIP85_HMAC_KEY, node.privateKey).slice(0, bytes);
};

const deriveOwnerPath = (
  role: OwnerRole,
  index: OwnerLaneIndex = ZERO_OWNER_LANE_INDEX,
): string => {
  if (role === "meta") return META_OWNER_PATH;
  if (role === "contacts") return contactsOwnerPath(index);
  if (role === "cashu") return cashuOwnerPath(index);
  return messagesOwnerPath(index);
};

const deriveOwnerKeyFromPath = (
  root: HDKey,
  path: string,
): Effect.Effect<OwnerKey, IdentityUtilsError> =>
  decodeUnknown(
    OwnerKey,
    bip85Entropy(root, path, 16),
    `Failed to derive owner key at path ${path}`,
  );

const deriveOwnerMnemonicFromPath = (
  root: HDKey,
  path: string,
): Effect.Effect<Bip39Mnemonic12, IdentityUtilsError> =>
  Effect.gen(function* () {
    const ownerKey = yield* deriveOwnerKeyFromPath(root, path);
    return yield* decodeUnknown(
      Bip39Mnemonic12,
      entropyToMnemonic(ownerKey, wordlist),
      `Failed to derive owner mnemonic at path ${path}`,
    );
  });

export const normalizeSlip39Share = (rawText: string): string =>
  toWordList(rawText).join(" ");

export const looksLikeSlip39Share = (rawText: string): boolean =>
  toWordList(rawText).length === 20;

export const validateSlip39Share = (rawText: string): boolean => {
  const normalized = normalizeSlip39Share(rawText);
  if (!looksLikeSlip39Share(normalized)) return false;
  return Slip39.validateMnemonic(normalized);
};

export const parseSlip39Share = (
  input: string,
): Effect.Effect<Slip39Share, IdentityUtilsError> => {
  const normalized = normalizeSlip39Share(input);
  return decodeUnknown(
    Slip39Share,
    normalized,
    "Invalid SLIP-39 share (expected a valid 20-word share)",
  );
};

export const parseSlip39Passphrase = (
  input: unknown,
): Effect.Effect<Slip39Passphrase, IdentityUtilsError> =>
  decodeUnknown(Slip39Passphrase, input, "Invalid SLIP-39 passphrase");

export const parseOwnerLaneIndex = (
  input: unknown,
): Effect.Effect<OwnerLaneIndex, IdentityUtilsError> =>
  decodeUnknown(
    OwnerLaneIndex,
    input,
    "Invalid owner lane index (expected non-negative integer)",
  );

export const recoverMasterSecretFromSlip39Share = (
  share: Slip39Share,
  passphrase: Slip39Passphrase = EMPTY_PASSPHRASE,
): Effect.Effect<MasterSecret, IdentityUtilsError> =>
  recoverMasterSecretFromSlip39Shares([share], passphrase);

export const recoverMasterSecretFromSlip39Shares = (
  shares: ReadonlyArray<Slip39Share>,
  passphrase: Slip39Passphrase = EMPTY_PASSPHRASE,
): Effect.Effect<MasterSecret, IdentityUtilsError> =>
  Effect.gen(function* () {
    if (shares.length === 0) {
      return yield* Effect.fail(
        new IdentityUtilsError({
          message:
            "Failed to recover master secret from SLIP-39 shares (no shares provided)",
        }),
      );
    }

    const sharesList = Array.from(shares);

    return yield* Effect.tryPromise({
      try: async () => {
        const recovered = await Slip39.recoverSecret(sharesList, passphrase);
        const bytes = toSecretBytes(recovered);
        if (!bytes) {
          throw new Error("Recovered SLIP-39 secret has invalid byte shape");
        }
        return Schema.decodeUnknownSync(MasterSecret)(bytes);
      },
      catch: (cause) =>
        new IdentityUtilsError({
          cause,
          message: "Failed to recover master secret from SLIP-39 shares",
        }),
    });
  });

export const createSlip39Share = (
  options?: CreateSlip39ShareOptions,
): Effect.Effect<Slip39Share, IdentityUtilsError> =>
  Effect.tryPromise({
    try: async () => {
      const cryptoApi = globalThis.crypto;
      if (!cryptoApi) throw new Error("globalThis.crypto is unavailable");

      const entropy = new Uint8Array(16);
      cryptoApi.getRandomValues(entropy);

      const passphrase = options?.passphrase ?? EMPTY_PASSPHRASE;
      const title = String(options?.title ?? "Linky").trim() || "Linky";

      const slip = await Slip39.fromArray(Array.from(entropy), {
        groupThreshold: 1,
        groups: [[1, 1, title]],
        passphrase,
        title,
      });
      const firstShare = slip.fromPath("r/0").mnemonics[0];
      if (typeof firstShare !== "string") {
        throw new Error("Generated SLIP-39 share is missing");
      }

      return Schema.decodeUnknownSync(Slip39Share)(
        normalizeSlip39Share(firstShare),
      );
    },
    catch: (cause) =>
      new IdentityUtilsError({
        cause,
        message: "Failed to create SLIP-39 share",
      }),
  });

export const encodeNostrNsec = (
  privateKey: NostrPrivateKey,
): Effect.Effect<NostrNsec, IdentityUtilsError> =>
  decodeUnknown(
    NostrNsec,
    nip19.nsecEncode(privateKey),
    "Failed to encode nsec",
  );

export const encodeNostrNpub = (
  publicKeyHex: NostrPublicKeyHex,
): Effect.Effect<NostrNpub, IdentityUtilsError> =>
  decodeUnknown(
    NostrNpub,
    nip19.npubEncode(publicKeyHex),
    "Failed to encode npub",
  );

export const deriveOwnerKeyFromMasterSecret = (
  masterSecret: MasterSecret,
  role: OwnerRole,
  index: OwnerLaneIndex = ZERO_OWNER_LANE_INDEX,
): Effect.Effect<OwnerKey, IdentityUtilsError> =>
  Effect.sync(() => HDKey.fromMasterSeed(masterSecret)).pipe(
    Effect.flatMap((root) =>
      deriveOwnerKeyFromPath(root, deriveOwnerPath(role, index)),
    ),
  );

export const deriveOwnerMnemonicFromMasterSecret = (
  masterSecret: MasterSecret,
  role: OwnerRole,
  index: OwnerLaneIndex = ZERO_OWNER_LANE_INDEX,
): Effect.Effect<Bip39Mnemonic12, IdentityUtilsError> =>
  Effect.sync(() => HDKey.fromMasterSeed(masterSecret)).pipe(
    Effect.flatMap((root) =>
      deriveOwnerMnemonicFromPath(root, deriveOwnerPath(role, index)),
    ),
  );

export const deriveCashuMnemonicFromMasterSecret = (
  masterSecret: MasterSecret,
): Effect.Effect<Bip39Mnemonic24, IdentityUtilsError> =>
  Effect.try({
    try: () => {
      const root = HDKey.fromMasterSeed(masterSecret);
      const entropy = bip85Entropy(root, CASHU_SEED_PATH, 32);
      return Schema.decodeUnknownSync(Bip39Mnemonic24)(
        entropyToMnemonic(entropy, wordlist),
      );
    },
    catch: (cause) =>
      new IdentityUtilsError({
        cause,
        message: "Failed to derive Cashu mnemonic from master secret",
      }),
  });
