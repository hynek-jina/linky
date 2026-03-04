import { Effect, Layer, Schema } from "effect";
import { describe, expect, it } from "vitest";
import { IdentityProvider } from "./IdentityProvider";
import { MasterSecretProvider } from "./MasterSecretProvider";
import { MasterSecret, NostrNpub, NostrNsec } from "./domain";
import {
  createSlip39Share,
  deriveCashuMnemonicFromMasterSecret,
  deriveOwnerKeyFromMasterSecret,
  deriveOwnerMnemonicFromMasterSecret,
  encodeNostrNpub,
  encodeNostrNsec,
  looksLikeSlip39Share,
  normalizeSlip39Share,
  parseOwnerLaneIndex,
  parseSlip39Share,
  recoverMasterSecretFromSlip39Share,
  recoverMasterSecretFromSlip39Shares,
  validateSlip39Share,
} from "./utils";

const hex = (u8: Uint8Array) => Buffer.from(u8).toString("hex");

const TEST_SEED = MasterSecret.make(
  new Uint8Array(Array.from({ length: 64 }, (_, i) => (i + 1) % 256)),
);

const EXPECTED = {
  storageMetaOwnerKey: "3085ed4fab471db8691a7aa38358779a",
  storageContactsOwnerKey0: "8f6072f2aab734bf3686fee0850f8745",
  storageCashuOwnerKey0: "c36e8b8f44512393ed3158c302f3e8b7",
  storageMessagesOwnerKey0: "54c22ce286e79d6f580d569d443e4a8c",
} as const;

const runIdentity = <E>(
  masterSecretLayer: Layer.Layer<MasterSecretProvider, E>,
) =>
  Effect.runPromise(
    Effect.provide(
      IdentityProvider,
      Layer.provideMerge(IdentityProvider.Live, masterSecretLayer),
    ),
  );

describe("identity utils", () => {
  it("normalizes slip39 shares", () => {
    expect(normalizeSlip39Share("  ALPHA   BETA gamma ")).toBe(
      "alpha beta gamma",
    );
  });

  it("detects and validates slip39 shares", async () => {
    const share = await Effect.runPromise(createSlip39Share());
    expect(looksLikeSlip39Share(share)).toBe(true);
    expect(validateSlip39Share(share)).toBe(true);
  });

  it("parses valid owner lane indexes and rejects invalid ones", async () => {
    const valid = await Effect.runPromise(parseOwnerLaneIndex(7));
    expect(valid).toBe(7);

    await expect(Effect.runPromise(parseOwnerLaneIndex(-1))).rejects.toThrow();
    await expect(
      Effect.runPromise(parseOwnerLaneIndex(Number.NaN)),
    ).rejects.toThrow();
  });

  it("rejects invalid slip39 shares", async () => {
    await expect(
      Effect.runPromise(parseSlip39Share("not a valid slip39 share")),
    ).rejects.toThrow();
  });

  it("recovers a valid master secret from generated share", async () => {
    const share = await Effect.runPromise(createSlip39Share());
    const parsed = await Effect.runPromise(parseSlip39Share(share));
    const single = await Effect.runPromise(
      recoverMasterSecretFromSlip39Share(parsed),
    );
    const many = await Effect.runPromise(
      recoverMasterSecretFromSlip39Shares([parsed]),
    );
    expect(single).toBeInstanceOf(Uint8Array);
    expect(single.length).toBeGreaterThanOrEqual(16);
    expect(single.length).toBeLessThanOrEqual(64);
    expect(single).toEqual(many);
  });

  it("rejects empty slip39 share arrays", async () => {
    await expect(
      Effect.runPromise(recoverMasterSecretFromSlip39Shares([])),
    ).rejects.toThrow();
  });

  it("derives deterministic owner keys from master secret", async () => {
    const meta = await Effect.runPromise(
      deriveOwnerKeyFromMasterSecret(TEST_SEED, "meta"),
    );
    const contacts = await Effect.runPromise(
      deriveOwnerKeyFromMasterSecret(TEST_SEED, "contacts"),
    );
    const cashu = await Effect.runPromise(
      deriveOwnerKeyFromMasterSecret(TEST_SEED, "cashu"),
    );
    const messages = await Effect.runPromise(
      deriveOwnerKeyFromMasterSecret(TEST_SEED, "messages"),
    );

    expect(hex(meta)).toBe(EXPECTED.storageMetaOwnerKey);
    expect(hex(contacts)).toBe(EXPECTED.storageContactsOwnerKey0);
    expect(hex(cashu)).toBe(EXPECTED.storageCashuOwnerKey0);
    expect(hex(messages)).toBe(EXPECTED.storageMessagesOwnerKey0);
  });

  it("encodes valid bech32 nsec/npub", async () => {
    const identity = await runIdentity(MasterSecretProvider.make(TEST_SEED));

    const nsec = await Effect.runPromise(
      encodeNostrNsec(identity.nostrSigningKey),
    );
    const npub = await Effect.runPromise(
      encodeNostrNpub(identity.nostrPublicKey),
    );

    const parsedNsec = Schema.decodeUnknownSync(NostrNsec)(nsec);
    const parsedNpub = Schema.decodeUnknownSync(NostrNpub)(npub);
    expect(parsedNsec).toBe(nsec);
    expect(parsedNpub).toBe(npub);
    expect(nsec.startsWith("nsec1")).toBe(true);
    expect(npub.startsWith("npub1")).toBe(true);
  });

  it("derives owner key and mnemonic for indexed owner lanes", async () => {
    const index = await Effect.runPromise(parseOwnerLaneIndex(2));
    const key = await Effect.runPromise(
      deriveOwnerKeyFromMasterSecret(TEST_SEED, "contacts", index),
    );
    const mnemonic = await Effect.runPromise(
      deriveOwnerMnemonicFromMasterSecret(TEST_SEED, "contacts", index),
    );

    expect(key).toBeInstanceOf(Uint8Array);
    expect(key).toHaveLength(16);
    expect(mnemonic.split(/\s+/)).toHaveLength(12);
  });

  it("derives deterministic cashu mnemonic from master secret", async () => {
    const a = await Effect.runPromise(
      deriveCashuMnemonicFromMasterSecret(TEST_SEED),
    );
    const b = await Effect.runPromise(
      deriveCashuMnemonicFromMasterSecret(TEST_SEED),
    );
    expect(a).toBe(b);
    expect(a.split(/\s+/)).toHaveLength(24);
  });

  it("creates MasterSecretProvider layers from share and share text", async () => {
    const share = await Effect.runPromise(createSlip39Share());
    const parsed = await Effect.runPromise(parseSlip39Share(share));
    const normalizedWithNoise = `  ${share
      .split(/\s+/)
      .map((word) => word.toUpperCase())
      .join("   ")}  `;

    const viaShare = await runIdentity(
      MasterSecretProvider.fromSlip39Share(parsed),
    );
    const viaText = await runIdentity(
      MasterSecretProvider.fromSlip39RawShare(normalizedWithNoise),
    );

    expect(viaShare.nostrPublicKey).toBe(viaText.nostrPublicKey);
    expect(viaShare.nostrSigningKey).toEqual(viaText.nostrSigningKey);
    expect(viaShare.cashuWalletSeed).toEqual(viaText.cashuWalletSeed);
    expect(viaShare.storageMetaOwnerKey).toEqual(viaText.storageMetaOwnerKey);
  });
});
