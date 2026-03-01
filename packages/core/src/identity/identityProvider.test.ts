import { Effect, Layer } from "effect";
import { describe, expect, it } from "vitest";
import { IdentityProvider, IdentityProviderError } from "./IdentityProvider";
import { MasterSecretProvider } from "./MasterSecretProvider";
import { MasterSecret } from "./domain";

const hex = (u8: Uint8Array) => Buffer.from(u8).toString("hex");

/** Deterministic 64-byte master seed for testing. */
const TEST_SEED = MasterSecret.make(
  new Uint8Array(Array.from({ length: 64 }, (_, i) => (i + 1) % 256)),
);

/**
 * Known-good derivation output for TEST_SEED.
 * If any value here changes, the derivation logic has regressed.
 */
const EXPECTED = {
  nostrSigningKey:
    "6467093d4ff55fb8d8158d578a44bb984a62513b9043b2d2ff8fc0820be877c7",
  nostrPublicKey:
    "b402852069fe3caa7a74c19f5f8a363c9d0d6d1ae7b4acc7c5798aefd443d773",
  cashuWalletSeed:
    "79f289bb2ed0276d7f5ac120d499b46d6da6f181c030c3a3891e5c5eeacc1265b45791f7922816cf4bf685d12659f0c62a41c044d0a835a6de482ab4c5a7b4a4",
  storageMetaOwnerKey: "3085ed4fab471db8691a7aa38358779a",
  storageContactsOwnerKey0: "8f6072f2aab734bf3686fee0850f8745",
  storageContactsOwnerKey1: "f2895760c0d8b39f6478b8052bb57abd",
  storageCashuOwnerKey0: "c36e8b8f44512393ed3158c302f3e8b7",
  storageCashuOwnerKey1: "1371639e7119e3a1e3c02aba9a494eb9",
  storageMessagesOwnerKey0: "54c22ce286e79d6f580d569d443e4a8c",
  storageMessagesOwnerKey1: "5457f8344ed636177013e64144a20090",
} as const;

const testLayer = Layer.provideMerge(
  IdentityProvider.Live,
  MasterSecretProvider.make(TEST_SEED),
);

const runTest = <A>(
  effect: Effect.Effect<A, IdentityProviderError, IdentityProvider>,
) => Effect.runPromise(Effect.provide(effect, testLayer));

describe("IdentityProvider", () => {
  it("derives exact expected keys from test seed (regression guard)", async () => {
    const id = await runTest(IdentityProvider);

    expect(hex(id.nostrSigningKey)).toBe(EXPECTED.nostrSigningKey);
    expect(id.nostrPublicKey).toBe(EXPECTED.nostrPublicKey);
    expect(hex(id.cashuWalletSeed)).toBe(EXPECTED.cashuWalletSeed);
    expect(hex(id.storageMetaOwnerKey)).toBe(EXPECTED.storageMetaOwnerKey);
    expect(hex(id.storageContactsOwnerKey(0))).toBe(
      EXPECTED.storageContactsOwnerKey0,
    );
    expect(hex(id.storageContactsOwnerKey(1))).toBe(
      EXPECTED.storageContactsOwnerKey1,
    );
    expect(hex(id.storageCashuOwnerKey(0))).toBe(
      EXPECTED.storageCashuOwnerKey0,
    );
    expect(hex(id.storageCashuOwnerKey(1))).toBe(
      EXPECTED.storageCashuOwnerKey1,
    );
    expect(hex(id.storageMessagesOwnerKey(0))).toBe(
      EXPECTED.storageMessagesOwnerKey0,
    );
    expect(hex(id.storageMessagesOwnerKey(1))).toBe(
      EXPECTED.storageMessagesOwnerKey1,
    );
  });

  it("produces a valid nostr keypair", async () => {
    const id = await runTest(IdentityProvider);
    expect(id.nostrSigningKey).toBeInstanceOf(Uint8Array);
    expect(id.nostrSigningKey).toHaveLength(32);
    expect(id.nostrPublicKey).toMatch(/^[0-9a-f]{64}$/);
  });

  it("produces a cashu wallet seed", async () => {
    const id = await runTest(IdentityProvider);
    expect(id.cashuWalletSeed).toBeInstanceOf(Uint8Array);
    expect(id.cashuWalletSeed).toHaveLength(64);
  });

  it("produces a storage meta owner key", async () => {
    const id = await runTest(IdentityProvider);
    expect(id.storageMetaOwnerKey).toBeInstanceOf(Uint8Array);
    expect(id.storageMetaOwnerKey).toHaveLength(16);
  });

  it("produces deterministic results for the same seed", async () => {
    const a = await runTest(IdentityProvider);
    const b = await runTest(IdentityProvider);

    expect(a.nostrSigningKey).toEqual(b.nostrSigningKey);
    expect(a.nostrPublicKey).toBe(b.nostrPublicKey);
    expect(a.cashuWalletSeed).toEqual(b.cashuWalletSeed);
    expect(a.storageMetaOwnerKey).toEqual(b.storageMetaOwnerKey);
  });

  it("derives different owner keys for contacts at different indices", async () => {
    const id = await runTest(IdentityProvider);
    const key0 = id.storageContactsOwnerKey(0);
    const key1 = id.storageContactsOwnerKey(1);

    expect(key0).toBeInstanceOf(Uint8Array);
    expect(key0).toHaveLength(16);
    expect(key1).toHaveLength(16);
    expect(key0).not.toEqual(key1);
  });

  it("derives different owner keys for cashu at different indices", async () => {
    const id = await runTest(IdentityProvider);
    const key0 = id.storageCashuOwnerKey(0);
    const key1 = id.storageCashuOwnerKey(1);

    expect(key0).toHaveLength(16);
    expect(key1).toHaveLength(16);
    expect(key0).not.toEqual(key1);
  });

  it("derives different owner keys for messages at different indices", async () => {
    const id = await runTest(IdentityProvider);
    const key0 = id.storageMessagesOwnerKey(0);
    const key1 = id.storageMessagesOwnerKey(1);

    expect(key0).toHaveLength(16);
    expect(key1).toHaveLength(16);
    expect(key0).not.toEqual(key1);
  });

  it("derives deterministic indexed owner keys", async () => {
    const a = await runTest(IdentityProvider);
    const b = await runTest(IdentityProvider);

    expect(a.storageContactsOwnerKey(5)).toEqual(b.storageContactsOwnerKey(5));
    expect(a.storageCashuOwnerKey(3)).toEqual(b.storageCashuOwnerKey(3));
    expect(a.storageMessagesOwnerKey(7)).toEqual(b.storageMessagesOwnerKey(7));
  });

  it("uses distinct derivation paths across key families", async () => {
    const id = await runTest(IdentityProvider);

    const contacts0 = id.storageContactsOwnerKey(0);
    const cashu0 = id.storageCashuOwnerKey(0);
    const messages0 = id.storageMessagesOwnerKey(0);

    expect(contacts0).not.toEqual(cashu0);
    expect(contacts0).not.toEqual(messages0);
    expect(cashu0).not.toEqual(messages0);
  });

  it("produces different identities from a different seed", async () => {
    const differentSeed = MasterSecret.make(
      new Uint8Array(Array.from({ length: 64 }, () => 0xab)),
    );
    const differentLayer = Layer.provideMerge(
      IdentityProvider.Live,
      MasterSecretProvider.make(differentSeed),
    );

    const original = await runTest(IdentityProvider);
    const different = await Effect.runPromise(
      Effect.provide(IdentityProvider, differentLayer),
    );

    expect(original.nostrPublicKey).not.toBe(different.nostrPublicKey);
    expect(original.nostrSigningKey).not.toEqual(different.nostrSigningKey);
    expect(original.cashuWalletSeed).not.toEqual(different.cashuWalletSeed);
    expect(original.storageMetaOwnerKey).not.toEqual(
      different.storageMetaOwnerKey,
    );
  });
});
