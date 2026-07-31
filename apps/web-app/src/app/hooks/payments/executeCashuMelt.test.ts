import { describe, expect, it, vi } from "vitest";
import { executeCashuMelt } from "./executeCashuMelt";

describe("executeCashuMelt", () => {
  it("persists change before deleting spent inputs", async () => {
    const calls: string[] = [];
    const result = await executeCashuMelt({
      invoice: "lnbc21",
      mint: "https://mint.example",
      tokens: ["cashu-input"],
      unit: "sat",
      melt: async () => ({
        ok: true,
        feePaid: 1,
        feeReserve: 2,
        mint: "https://mint.example",
        paidAmount: 21,
        remainingAmount: 3,
        remainingToken: "cashu-change",
        unit: "sat",
      }),
      insertAcceptedToken: (token, ignoredAliases) => {
        calls.push(`insert:${token}:${ignoredAliases.join(",")}`);
        return { ok: true, error: null };
      },
      deleteSpentTokens: (tokens, mint) => {
        calls.push(`delete:${tokens.join(",")}:${mint}`);
      },
    });

    expect(result.localPersistenceErrors).toEqual([]);
    expect(calls).toEqual([
      "insert:cashu-change:cashu-input",
      "delete:cashu-input:https://mint.example",
    ]);
  });

  it("records local deletion failures without changing melt success", async () => {
    const result = await executeCashuMelt({
      invoice: "lnbc21",
      mint: "https://mint.example",
      tokens: ["cashu-input"],
      unit: "sat",
      melt: async () => ({
        ok: true,
        feePaid: 0,
        feeReserve: 0,
        mint: "https://mint.example",
        paidAmount: 21,
        remainingAmount: 0,
        remainingToken: null,
        unit: "sat",
      }),
      insertAcceptedToken: vi.fn(),
      deleteSpentTokens: () => {
        throw new Error("write failed");
      },
    });

    expect(result.result.ok).toBe(true);
    expect(result.localPersistenceErrors).toEqual([
      "spent delete: Error: write failed",
    ]);
  });

  it("recovers a failed melt only when the recovery token persists", async () => {
    const deleteSpentTokens = vi.fn();
    const result = await executeCashuMelt({
      invoice: "lnbc21",
      mint: "https://mint.example",
      tokens: ["cashu-input"],
      unit: "sat",
      melt: async () => ({
        ok: false,
        error: "payment failed",
        feePaid: 0,
        feeReserve: 2,
        mint: "https://mint.example",
        paidAmount: 0,
        remainingAmount: 21,
        remainingToken: "cashu-recovery",
        unit: "sat",
      }),
      insertAcceptedToken: () => ({ ok: false, error: "storage failed" }),
      deleteSpentTokens,
    });

    expect(result.result.ok).toBe(false);
    expect(deleteSpentTokens).not.toHaveBeenCalled();
  });
});
