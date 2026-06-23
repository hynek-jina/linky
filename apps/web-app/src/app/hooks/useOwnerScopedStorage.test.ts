import { describe, expect, it } from "vitest";
import { createCashuTokenId } from "../lib/cashuTokenIdentity";
import { buildTransactionInsertPayload } from "./useOwnerScopedStorage";

describe("buildTransactionInsertPayload", () => {
  it("stores one canonical classification and compact token references", () => {
    const usedToken = "cashu-used";
    const gainedToken = "cashu-gained";
    const payload = buildTransactionInsertPayload({
      createdAtSec: 123,
      event: {
        amount: 21,
        details: {
          acceptedToken: gainedToken,
          lightningInvoice: "lnbc1invoice",
          lightningMemo: "derived memo",
          rawToken: "cashu-raw",
          requestId: "request-1",
          requestText: "large request payload",
          unknownContactId: "unknown:pubkey",
          usedInputTokens: [usedToken],
        },
        direction: "out",
        fee: 1,
        method: "unknown",
        note: "redundant title",
        phase: "swap",
        status: "ok",
      },
    });

    expect(payload).toEqual({
      amount: 21,
      createdAtSec: 123,
      detailsJson: JSON.stringify({
        requestId: "request-1",
        lightningInvoice: "lnbc1invoice",
        usedTokenIds: [String(createCashuTokenId(usedToken))],
        gainedTokenIds: [String(createCashuTokenId(gainedToken))],
      }),
      direction: "out",
      fee: 1,
      method: "cashu_emit",
      status: "ok",
    });
  });

  it("uses status pending instead of phase and pendingLabel", () => {
    expect(
      buildTransactionInsertPayload({
        createdAtSec: 456,
        event: {
          direction: "out",
          method: "cashu_chat",
          phase: "publish",
          status: "ok",
        },
      }),
    ).toEqual({
      createdAtSec: 456,
      direction: "out",
      method: "cashu_chat",
      status: "pending",
    });
  });
});
