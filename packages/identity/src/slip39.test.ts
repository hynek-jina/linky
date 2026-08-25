import { Effect, Layer } from "effect";
import { describe, expect, it } from "vitest";
import { IdentityProvider } from "./IdentityProvider";
import { MasterSecretProvider } from "./MasterSecretProvider";
import {
  createSlip39Share,
  looksLikeSlip39Share,
  normalizeSlip39Share,
  parseSlip39Share,
  recoverMasterSecretFromSlip39Share,
  recoverMasterSecretFromSlip39Shares,
  validateSlip39Share,
} from "./slip39";

const runIdentity = <E>(
  masterSecretLayer: Layer.Layer<MasterSecretProvider, E>,
) =>
  Effect.runPromise(
    Effect.provide(
      IdentityProvider,
      Layer.provideMerge(IdentityProvider.Live, masterSecretLayer),
    ),
  );

describe("SLIP-39", () => {
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
