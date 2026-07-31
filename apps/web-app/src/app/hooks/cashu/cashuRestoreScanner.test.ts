import {
  Amount,
  CheckStateEnum,
  type Proof,
  type ProofState,
} from "@cashu/cashu-ts";
import { describe, expect, it, vi } from "vitest";
import { scanCashuRestoreKeyset } from "./cashuRestoreScanner";

const makeProof = (secret: string): Proof => ({
  amount: Amount.from(1),
  C: `C-${secret}`,
  id: "keyset",
  secret,
});

const makeState = (state: ProofState["state"]): ProofState => ({
  Y: "Y",
  state,
  witness: null,
});

describe("scanCashuRestoreKeyset", () => {
  it("scans behind the high-water mark and returns fresh unspent proofs", async () => {
    const known = makeProof("known");
    const fresh = makeProof("fresh");
    const spent = makeProof("spent");
    const batchRestore = vi.fn(async () => ({
      lastCounterWithSignature: 4500,
      proofs: [known, fresh, spent],
    }));

    const result = await scanCashuRestoreKeyset({
      savedCursor: 5000,
      deterministicCounter: 4500,
      knownSecrets: new Set(["known"]),
      rescanWindow: 4000,
      batchRestore,
      checkProofsStates: async () => [
        makeState(CheckStateEnum.UNSPENT),
        makeState(CheckStateEnum.SPENT),
      ],
    });

    expect(batchRestore).toHaveBeenCalledWith(1000);
    expect(result).toEqual({
      status: "ok",
      nextCursor: 4501,
      proofs: [fresh],
    });
  });

  it("deep scans from zero when the recent window has no spendable proofs", async () => {
    const restored = makeProof("restored");
    const batchRestore = vi
      .fn()
      .mockResolvedValueOnce({
        lastCounterWithSignature: 4200,
        proofs: [],
      })
      .mockResolvedValueOnce({
        lastCounterWithSignature: 4700,
        proofs: [restored],
      });

    const result = await scanCashuRestoreKeyset({
      savedCursor: 5000,
      deterministicCounter: null,
      knownSecrets: new Set(),
      rescanWindow: 4000,
      batchRestore,
      checkProofsStates: async () => [makeState(CheckStateEnum.UNSPENT)],
    });

    expect(batchRestore).toHaveBeenNthCalledWith(1, 1000);
    expect(batchRestore).toHaveBeenNthCalledWith(2, 0);
    expect(result).toEqual({
      status: "ok",
      nextCursor: 4701,
      proofs: [restored],
    });
  });

  it("leaves the keyset untouched when its first restore request fails", async () => {
    const result = await scanCashuRestoreKeyset({
      savedCursor: 0,
      deterministicCounter: null,
      knownSecrets: new Set(),
      rescanWindow: 4000,
      batchRestore: async () => {
        throw new Error("offline");
      },
      checkProofsStates: vi.fn(),
    });

    expect(result).toEqual({ status: "unavailable" });
  });
});
