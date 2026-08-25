import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import {
  deriveCashuMnemonicFromMasterSecret,
  deriveOwnerKeyFromMasterSecret,
  deriveOwnerMnemonicFromMasterSecret,
  parseOwnerLaneIndex,
} from "./derive";
import { MasterSecret } from "./domain";

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

describe("identity derivation", () => {
  it("parses valid owner lane indexes and rejects invalid ones", async () => {
    const valid = await Effect.runPromise(parseOwnerLaneIndex(7));
    expect(valid).toBe(7);

    await expect(Effect.runPromise(parseOwnerLaneIndex(-1))).rejects.toThrow();
    await expect(
      Effect.runPromise(parseOwnerLaneIndex(Number.NaN)),
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
    const identity = await Effect.runPromise(
      deriveOwnerKeyFromMasterSecret(TEST_SEED, "identity"),
    );
    const messages = await Effect.runPromise(
      deriveOwnerKeyFromMasterSecret(TEST_SEED, "messages"),
    );

    expect(hex(meta)).toBe(EXPECTED.storageMetaOwnerKey);
    expect(hex(contacts)).toBe(EXPECTED.storageContactsOwnerKey0);
    expect(hex(cashu)).toBe(EXPECTED.storageCashuOwnerKey0);
    expect(hex(messages)).toBe(EXPECTED.storageMessagesOwnerKey0);
    expect(identity).not.toEqual(messages);
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
});
