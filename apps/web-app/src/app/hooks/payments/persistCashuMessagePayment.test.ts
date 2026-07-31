import * as Evolu from "@evolu/common";
import { describe, expect, it, vi } from "vitest";
import { createCashuTokenId } from "../../lib/cashuTokenIdentity";
import type {
  CashuMessagePaymentPublishingOutcome,
  CashuMessagePaymentSwapCommit,
  SuccessfulCashuMessagePaymentSwap,
} from "./cashuMessagePaymentTypes";
import {
  type CashuTokenMutationResult,
  type CashuTokenUpdate,
  type CashuTokenUpsert,
  logCashuMessagePublishFailure,
  logCashuMessageSwapFailure,
  persistCashuMessagePaymentResult,
  persistCashuMessageSwapAttempt,
} from "./persistCashuMessagePayment";
import { createCashuTokenRowFixture } from "../../../testUtils/cashuTokenRow";
import type { CashuTokenWithMeta } from "../../lib/tokenText";

const oldOwnerResult = Evolu.OwnerId.fromUnknown("AAAAAAAAAAAAAAAAAAAAAA");
const activeOwnerResult = Evolu.OwnerId.fromUnknown("AQEBAQEBAQEBAQEBAQEBAQ");
if (!oldOwnerResult.ok || !activeOwnerResult.ok) {
  throw new Error("Invalid test owner ids");
}
const oldOwnerId = oldOwnerResult.value;
const activeOwnerId = activeOwnerResult.value;
const contactId = Evolu.createIdFromString<"Contact">("contact");
const tokenWithMeta = (
  input: {
    amount?: number;
    mint: string;
    state: string;
    token: string;
  },
  ownerId: Evolu.OwnerId,
): CashuTokenWithMeta => ({
  ...createCashuTokenRowFixture({
    ownerId: String(ownerId),
    state: input.state,
    token: input.token,
  }),
  amount: input.amount ?? null,
  mint: input.mint,
  tokenText: input.token,
  unit: "sat",
});

const selection = {
  amountAttempts: [60],
  candidate: {
    mint: "https://mint.example",
    sum: 100,
    tokens: ["input-token"],
  },
  candidates: [
    {
      mint: "https://mint.example",
      sum: 100,
      tokens: ["input-token"],
    },
  ],
  kind: "selected",
  requestedAmountSat: 60,
} satisfies CashuMessagePaymentSwapCommit["selection"];

const successCommit: CashuMessagePaymentSwapCommit = {
  kind: "success",
  result: {
    mint: "https://mint.example",
    ok: true,
    remainingAmount: 40,
    remainingToken: "change-token",
    sendAmount: 60,
    sendProofs: [],
    sendToken: "send-token",
    unit: "sat",
  },
  selection,
};

const readField = (value: unknown, field: string): unknown => {
  if (typeof value !== "object" || value === null) return undefined;
  return Reflect.get(value, field);
};

describe("persistCashuMessageSwapAttempt", () => {
  it("deletes selected-mint inputs in their stored lanes before inserting change", () => {
    const operations: string[] = [];
    const update = vi.fn<CashuTokenUpdate>(
      (_table, payload, options): CashuTokenMutationResult => {
        operations.push(
          `delete:${String(readField(payload, "id"))}:${String(readField(options, "ownerId"))}`,
        );
        return { ok: true };
      },
    );
    const upsert = vi.fn<CashuTokenUpsert>(
      (_table, payload, options): CashuTokenMutationResult => {
        operations.push(
          `insert:${String(readField(payload, "token"))}:${String(readField(options, "ownerId"))}`,
        );
        return { ok: true };
      },
    );

    persistCashuMessageSwapAttempt({
      cashuTokensAll: [],
      cashuTokensWithMeta: [
        tokenWithMeta(
          {
            amount: 100,
            mint: "https://mint.example",
            state: "accepted",
            token: "old-token",
          },
          oldOwnerId,
        ),
        tokenWithMeta(
          {
            amount: 100,
            mint: "https://other.example",
            state: "accepted",
            token: "other-mint",
          },
          oldOwnerId,
        ),
        tokenWithMeta(
          {
            amount: 100,
            mint: "https://mint.example",
            state: "pending",
            token: "pending",
          },
          oldOwnerId,
        ),
      ],
      cashuWriteOwnerId: activeOwnerId,
      outcome: successCommit,
      update,
      upsert,
    });

    expect(operations).toEqual([
      `delete:${String(createCashuTokenId("old-token"))}:${String(oldOwnerId)}`,
      `insert:change-token:${String(activeOwnerId)}`,
    ]);
  });

  it("inserts recovery funds before deleting old inputs", () => {
    const operations: string[] = [];
    const recoveryCommit: CashuMessagePaymentSwapCommit = {
      kind: "recovery",
      result: {
        error: "recovered",
        mint: "https://mint.example",
        ok: false,
        remainingAmount: 100,
        remainingToken: "recovery-token",
        sendAmount: 60,
        unit: "sat",
      },
      selection,
    };

    persistCashuMessageSwapAttempt({
      cashuTokensAll: [],
      cashuTokensWithMeta: [
        tokenWithMeta(
          {
            mint: "https://mint.example",
            state: "accepted",
            token: "old-token",
          },
          oldOwnerId,
        ),
      ],
      cashuWriteOwnerId: activeOwnerId,
      outcome: recoveryCommit,
      update: vi.fn<CashuTokenUpdate>(() => {
        operations.push("delete");
        return { ok: true };
      }),
      upsert: vi.fn<CashuTokenUpsert>(() => {
        operations.push("insert:recovery");
        return { ok: true };
      }),
    });

    expect(operations).toEqual(["insert:recovery", "delete"]);
  });

  it("surfaces mutation failures to the swap executor", () => {
    let thrown: unknown;
    try {
      persistCashuMessageSwapAttempt({
        cashuTokensAll: [],
        cashuTokensWithMeta: [],
        cashuWriteOwnerId: activeOwnerId,
        outcome: successCommit,
        update: vi.fn<CashuTokenUpdate>(() => ({ ok: true })),
        upsert: vi.fn<CashuTokenUpsert>(() => ({
          error: "write failed",
          ok: false,
        })),
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBe("write failed");
  });
});

describe("persistCashuMessagePaymentResult", () => {
  const swap: SuccessfulCashuMessagePaymentSwap = {
    batch: {
      amount: 59,
      mint: "https://mint.example",
      token: "send-token",
      unit: "sat",
    },
    gainedToken: "change-token",
    kind: "success",
    result: {
      mint: "https://mint.example",
      ok: true,
      remainingAmount: 41,
      remainingToken: "change-token",
      sendAmount: 59,
      sendProofs: [],
      sendToken: "send-token",
      unit: "sat",
    },
    usedInputTokens: ["input-token"],
  };

  const publishing = (
    unpublishedTokenTexts: string[],
  ): CashuMessagePaymentPublishingOutcome => ({
    hasPendingMessages: unpublishedTokenTexts.length > 0,
    paymentNoticeError: null,
    publishErrors: [],
    publishedTokenTexts:
      unpublishedTokenTexts.length === 0 ? ["send-token"] : [],
    unpublishedTokenTexts,
  });

  it("stores only unpublished tokens and logs the actual successful result", () => {
    const upsert = vi.fn<CashuTokenUpsert>(() => ({ ok: true }));
    const logPaymentEvent = vi.fn();

    persistCashuMessagePaymentResult({
      cashuTokensAll: [],
      cashuWriteOwnerId: activeOwnerId,
      contactId,
      logCompletedOnly: false,
      logPaymentEvent,
      paymentRequestId: "request-1",
      publishing: publishing(["send-token"]),
      swap,
      upsert,
    });

    expect(upsert).toHaveBeenCalledOnce();
    expect(upsert.mock.calls[0]?.[1]).toMatchObject({
      state: "pending",
      token: "send-token",
    });
    expect(upsert.mock.calls[0]?.[2]).toEqual({ ownerId: activeOwnerId });
    expect(logPaymentEvent).toHaveBeenCalledWith({
      amount: 59,
      contactId,
      details: {
        gainedToken: "change-token",
        requestId: "request-1",
        usedInputTokens: ["input-token"],
      },
      direction: "out",
      error: null,
      fee: null,
      method: "cashu_chat",
      mint: "https://mint.example",
      phase: "publish",
      status: "ok",
      unit: "sat",
    });
  });

  it("does not reinsert published or duplicate tokens", () => {
    const upsert = vi.fn<CashuTokenUpsert>(() => ({ ok: true }));

    persistCashuMessagePaymentResult({
      cashuTokensAll: [
        createCashuTokenRowFixture({ state: "accepted", token: "send-token" }),
      ],
      cashuWriteOwnerId: activeOwnerId,
      contactId,
      logCompletedOnly: false,
      logPaymentEvent: vi.fn(),
      paymentRequestId: null,
      publishing: publishing(["send-token"]),
      swap,
      upsert,
    });
    persistCashuMessagePaymentResult({
      cashuTokensAll: [],
      cashuWriteOwnerId: activeOwnerId,
      contactId,
      logCompletedOnly: false,
      logPaymentEvent: vi.fn(),
      paymentRequestId: null,
      publishing: publishing([]),
      swap,
      upsert,
    });

    expect(upsert).not.toHaveBeenCalled();
  });

  it("suppresses pending logs but keeps completed logs in completed-only mode", () => {
    const logPaymentEvent = vi.fn();
    const args = {
      cashuTokensAll: [],
      cashuWriteOwnerId: activeOwnerId,
      contactId,
      logCompletedOnly: true,
      logPaymentEvent,
      paymentRequestId: null,
      swap,
      upsert: vi.fn<CashuTokenUpsert>(() => ({ ok: true })),
    };

    persistCashuMessagePaymentResult({
      ...args,
      publishing: publishing(["send-token"]),
    });
    persistCashuMessagePaymentResult({
      ...args,
      publishing: publishing([]),
    });

    expect(logPaymentEvent).toHaveBeenCalledOnce();
    expect(logPaymentEvent).toHaveBeenCalledWith(
      expect.objectContaining({ phase: "complete", status: "ok" }),
    );
  });
});

describe("Cashu message payment failure logs", () => {
  it("preserves swap and publish phases and suppresses completed-only errors", () => {
    const logPaymentEvent = vi.fn();
    const common = {
      amountSat: 100,
      contactId,
      error: "failed",
      logCompletedOnly: false,
      logPaymentEvent,
      mint: "https://mint.example",
    };

    logCashuMessageSwapFailure(common);
    logCashuMessagePublishFailure(common);
    logCashuMessageSwapFailure({ ...common, logCompletedOnly: true });

    expect(logPaymentEvent).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ amount: 100, phase: "swap" }),
    );
    expect(logPaymentEvent).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ amount: 100, phase: "publish" }),
    );
    expect(logPaymentEvent).toHaveBeenCalledTimes(2);
  });
});
