import { hmac } from "@noble/hashes/hmac.js";
import { sha512 } from "@noble/hashes/sha2.js";
import { HDKey } from "@scure/bip32";
import { entropyToMnemonic, mnemonicToSeedSync } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { Context, Effect, Layer, Schema } from "effect";
import { getPublicKey } from "nostr-tools";
import {
  CashuSeed,
  NostrPrivateKey,
  NostrPublicKeyHex,
  OwnerKey,
  OwnerLaneIndex,
} from "./domain";
import {
  CASHU_SEED_PATH,
  contactsOwnerPath,
  cashuOwnerPath,
  messagesOwnerPath,
  META_OWNER_PATH,
  NOSTR_PATH,
} from "./derivationPaths";
import { MasterSecretProvider } from "./MasterSecretProvider";

export class IdentityProviderError extends Schema.TaggedError<IdentityProviderError>()(
  "IdentityProviderError",
  { cause: Schema.optional(Schema.Unknown), message: Schema.String },
) {}

interface Identities {
  readonly nostrSigningKey: NostrPrivateKey;
  readonly nostrPublicKey: NostrPublicKeyHex;

  readonly cashuWalletSeed: CashuSeed;

  readonly storageMetaOwnerKey: OwnerKey;
  readonly storageContactsOwnerKey: (index: OwnerLaneIndex) => OwnerKey;
  readonly storageCashuOwnerKey: (index: OwnerLaneIndex) => OwnerKey;
  readonly storageMessagesOwnerKey: (index: OwnerLaneIndex) => OwnerKey;
}

const BIP85_HMAC_KEY = new TextEncoder().encode("bip-entropy-from-k");

const bip85Entropy = (
  root: HDKey,
  path: string,
  bytes: 16 | 32,
): Uint8Array => {
  const node = root.derive(path);
  if (!node.privateKey) throw new Error(`BIP-85 derivation failed at ${path}`);
  return hmac(sha512, BIP85_HMAC_KEY, node.privateKey).slice(0, bytes);
};

const deriveOwnerKey = (root: HDKey, path: string): OwnerKey => {
  return OwnerKey.make(bip85Entropy(root, path, 16));
};

export class IdentityProvider extends Context.Tag("IdentityProvider")<
  IdentityProvider,
  Identities
>() {
  static Live: Layer.Layer<
    IdentityProvider,
    IdentityProviderError,
    MasterSecretProvider
  > = Layer.effect(
    IdentityProvider,
    Effect.gen(function* () {
      const masterSecret = yield* MasterSecretProvider;
      const root = HDKey.fromMasterSeed(masterSecret);

      const nostrNode = root.derive(NOSTR_PATH);
      if (!nostrNode.privateKey) {
        return yield* new IdentityProviderError({
          message: "Nostr key derivation failed",
        });
      }
      const nostrSigningKey = NostrPrivateKey.make(nostrNode.privateKey);
      const nostrPublicKey = NostrPublicKeyHex.make(
        getPublicKey(nostrSigningKey),
      );

      const cashuEntropy = bip85Entropy(root, CASHU_SEED_PATH, 32);
      const cashuMnemonic = entropyToMnemonic(cashuEntropy, wordlist);
      const cashuWalletSeed = CashuSeed.make(mnemonicToSeedSync(cashuMnemonic));

      const storageMetaOwnerKey = deriveOwnerKey(root, META_OWNER_PATH);

      return {
        nostrSigningKey,
        nostrPublicKey,
        cashuWalletSeed,
        storageMetaOwnerKey,
        storageContactsOwnerKey: (index: OwnerLaneIndex) =>
          deriveOwnerKey(root, contactsOwnerPath(index)),
        storageCashuOwnerKey: (index: OwnerLaneIndex) =>
          deriveOwnerKey(root, cashuOwnerPath(index)),
        storageMessagesOwnerKey: (index: OwnerLaneIndex) =>
          deriveOwnerKey(root, messagesOwnerPath(index)),
      };
    }).pipe(
      Effect.catchAllDefect(
        (defect) =>
          new IdentityProviderError({
            cause: defect,
            message: `IdentityProvider initialization failed`,
          }),
      ),
    ),
  );
}
