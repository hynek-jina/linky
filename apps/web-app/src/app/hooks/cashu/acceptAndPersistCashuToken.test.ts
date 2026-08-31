import * as Evolu from "@evolu/common";
import { describe, expect, it, vi } from "vitest";
import { acceptAndPersistCashuToken } from "./acceptAndPersistCashuToken";

const ownerId = Evolu.OwnerId.orThrow("AAAAAAAAAAAAAAAAAAAAAA");

describe("acceptAndPersistCashuToken", () => {
  it("accepts and persists before publishing the accepted token", async () => {
    const calls: string[] = [];
    const result = await acceptAndPersistCashuToken({
      tokenText: " cashu-input ",
      acceptToken: async (token) => {
        calls.push(`accept:${token}`);
        return {
          amount: 21,
          mint: "https://mint.example",
          token: "cashu-accepted",
          unit: "sat",
        };
      },
      isAlreadyStored: () => false,
      resolveOwnerId: async () => ownerId,
      beforePersist: (token) => calls.push(`before:${token}`),
      persistAccepted: (rawToken, acceptedToken, persistedOwnerId) => {
        calls.push(
          `persist:${rawToken}:${acceptedToken}:${String(persistedOwnerId)}`,
        );
        return { ok: true };
      },
      afterPersist: (rawToken, acceptedToken) =>
        calls.push(`after:${rawToken}:${acceptedToken}`),
      persistFailure: vi.fn(() => ({ ok: true })),
    });

    expect(result).toEqual({
      status: "accepted",
      rawToken: "cashu-input",
      accepted: {
        amount: 21,
        mint: "https://mint.example",
        token: "cashu-accepted",
        unit: "sat",
      },
    });
    expect(calls).toEqual([
      "accept:cashu-input",
      "before:cashu-accepted",
      `persist:cashu-input:cashu-accepted:${String(ownerId)}`,
      "after:cashu-input:cashu-accepted",
    ]);
  });

  it("does not accept a token already in storage", async () => {
    const acceptToken = vi.fn();
    const resolveOwnerId = vi.fn();

    const result = await acceptAndPersistCashuToken({
      tokenText: "cashu-duplicate",
      acceptToken,
      isAlreadyStored: () => true,
      resolveOwnerId,
      beforePersist: vi.fn(),
      persistAccepted: vi.fn(),
      afterPersist: vi.fn(),
      persistFailure: vi.fn(() => ({ ok: true })),
    });

    expect(result).toEqual({ status: "duplicate-before-accept" });
    expect(acceptToken).not.toHaveBeenCalled();
    expect(resolveOwnerId).not.toHaveBeenCalled();
  });

  it("persists the raw token as an error when acceptance fails", async () => {
    const persistFailure = vi.fn();
    const result = await acceptAndPersistCashuToken({
      tokenText: "cashu-broken",
      acceptToken: async () => {
        throw new Error("mint rejected");
      },
      isAlreadyStored: () => false,
      resolveOwnerId: async () => ownerId,
      beforePersist: vi.fn(),
      persistAccepted: vi.fn(),
      afterPersist: vi.fn(),
      persistFailure: (...args) => {
        persistFailure(...args);
        return { ok: true };
      },
    });

    expect(result).toEqual({
      status: "accept-failed",
      error: "Error: mint rejected",
      persistenceError: null,
    });
    expect(persistFailure).toHaveBeenCalledWith(
      "cashu-broken",
      "Error: mint rejected",
      ownerId,
    );
  });
});
