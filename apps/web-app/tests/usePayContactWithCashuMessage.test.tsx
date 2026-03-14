import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ContactRowLike } from "../src/app/types/appTypes";

const {
  createSendTokenWithTokensAtMintMock,
  createLinkyPaymentNoticeEventMock,
  getSharedAppNostrPoolMock,
  navigateToMock,
  wrapEventWithPushMarkerMock,
  wrapEventWithoutPushMarkerMock,
} = vi.hoisted(() => ({
  createSendTokenWithTokensAtMintMock: vi.fn(),
  createLinkyPaymentNoticeEventMock: vi.fn(),
  getSharedAppNostrPoolMock: vi.fn(),
  navigateToMock: vi.fn(),
  wrapEventWithPushMarkerMock: vi.fn(),
  wrapEventWithoutPushMarkerMock: vi.fn(),
}));

vi.mock("../src/cashuSend", () => ({
  createSendTokenWithTokensAtMint: createSendTokenWithTokensAtMintMock,
}));

vi.mock("../src/app/lib/nostrPool", () => ({
  getSharedAppNostrPool: getSharedAppNostrPoolMock,
}));

vi.mock("../src/hooks/useRouting", () => ({
  navigateTo: navigateToMock,
}));

vi.mock("nostr-tools", () => ({
  getPublicKey: vi.fn(() => "my-pubkey-hex"),
  nip19: {
    decode: vi.fn((value: string) => {
      if (value === "nsec-test") {
        return { type: "nsec", data: new Uint8Array([1, 2, 3]) };
      }
      if (value === "npub-test") {
        return { type: "npub", data: "contact-pubkey-hex" };
      }
      throw new Error(`Unexpected decode value: ${value}`);
    }),
  },
}));

vi.mock("../src/app/lib/pushWrappedEvent", () => ({
  createLinkyPaymentNoticeEvent: createLinkyPaymentNoticeEventMock,
  wrapEventWithPushMarker: wrapEventWithPushMarkerMock,
  wrapEventWithoutPushMarker: wrapEventWithoutPushMarkerMock,
}));

import { usePayContactWithCashuMessage } from "../src/app/hooks/payments/usePayContactWithCashuMessage";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const flushEffects = async () => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
};

describe("usePayContactWithCashuMessage", () => {
  afterEach(() => {
    createSendTokenWithTokensAtMintMock.mockReset();
    createLinkyPaymentNoticeEventMock.mockReset();
    getSharedAppNostrPoolMock.mockReset();
    navigateToMock.mockReset();
    wrapEventWithPushMarkerMock.mockReset();
    wrapEventWithoutPushMarkerMock.mockReset();
    localStorage.clear();
  });

  it("deletes spent accepted tokens before inserting the change token", async () => {
    createSendTokenWithTokensAtMintMock.mockResolvedValue({
      ok: true,
      mint: "https://mint.example",
      unit: "sat",
      sendAmount: 600,
      sendToken: "cashu-send-token",
      remainingAmount: 400,
      remainingToken: "cashu-change-token",
    });
    getSharedAppNostrPoolMock.mockResolvedValue({});
    wrapEventWithoutPushMarkerMock
      .mockReturnValueOnce({ id: "wrap-me" })
      .mockReturnValueOnce({ id: "wrap-contact" });
    createLinkyPaymentNoticeEventMock.mockReturnValue({
      created_at: 1730000000,
      kind: 24133,
      pubkey: "my-pubkey-hex",
      tags: [
        ["p", "contact-pubkey-hex"],
        ["p", "my-pubkey-hex"],
        ["client", "payment-notice-client"],
        ["linky", "payment_notice"],
      ],
      content: "payment_notice",
    });
    wrapEventWithPushMarkerMock.mockReturnValue({ id: "wrap-payment-notice" });

    const operations: string[] = [];
    const insert = vi.fn(
      (table: string, payload: { state?: string; token?: string }) => {
        if (table === "cashuToken") {
          operations.push(
            `insert:${String(payload.token ?? "")}:${String(payload.state ?? "")}`,
          );
        }
        return { ok: true };
      },
    );
    const update = vi.fn((table: string, payload: { id?: string | null }) => {
      if (table === "cashuToken") {
        operations.push(`update:${String(payload.id ?? "")}`);
      }
      return { ok: true };
    });

    let payContactWithCashuMessage: ReturnType<
      typeof usePayContactWithCashuMessage<ContactRowLike>
    > | null = null;

    const Harness = () => {
      const pay = usePayContactWithCashuMessage<ContactRowLike>({
        appendLocalNostrMessage: () => "local-message-1",
        buildCashuMintCandidates: (mintGroups) => {
          const mint = mintGroups.get("https://mint.example");
          return mint
            ? [
                {
                  mint: "https://mint.example",
                  sum: mint.sum,
                  tokens: mint.tokens,
                },
              ]
            : [];
        },
        cashuBalance: 1000,
        cashuTokensWithMeta: [
          {
            id: "old-token-1",
            state: "accepted",
            mint: "https://mint.example",
            token: "cashu-old-token",
            amount: 1000,
            unit: "sat",
          },
        ],
        chatSeenWrapIdsRef: { current: new Set<string>() },
        currentNpub: "npub-test",
        currentNsec: "nsec-test",
        defaultMintUrl: "https://mint.example",
        displayUnit: "sat",
        enqueuePendingPayment: vi.fn(),
        formatInteger: (value) => String(value),
        insert,
        logPayStep: vi.fn(),
        logPaymentEvent: vi.fn(),
        nostrMessagesLocal: [],
        payWithCashuEnabled: true,
        publishSingleWrappedWithRetry: vi.fn(async () => ({
          anySuccess: true,
          error: null,
        })),
        publishWrappedWithRetry: vi.fn(async () => ({
          anySuccess: true,
          error: null,
        })),
        pushToast: vi.fn(),
        resolveOwnerIdForWrite: vi.fn(async () => null),
        setContactsOnboardingHasPaid: vi.fn(),
        setStatus: vi.fn(),
        showPaidOverlay: vi.fn(),
        t: (key: string) => key,
        update,
        updateLocalNostrMessage: vi.fn(),
      });

      React.useEffect(() => {
        payContactWithCashuMessage = pay;
      }, [pay]);

      return null;
    };

    const container = document.createElement("div");
    const root = createRoot(container);

    await act(async () => {
      root.render(<Harness />);
    });
    await flushEffects();

    expect(payContactWithCashuMessage).not.toBeNull();

    await act(async () => {
      await payContactWithCashuMessage?.({
        contact: {
          id: "contact-1",
          name: "Alice",
          npub: "npub-test",
        },
        amountSat: 600,
      });
    });

    expect(operations).toContain("update:old-token-1");
    expect(operations).toContain("insert:cashu-change-token:accepted");
    expect(operations.indexOf("update:old-token-1")).toBeLessThan(
      operations.indexOf("insert:cashu-change-token:accepted"),
    );

    await act(async () => {
      root.unmount();
    });
  });
});
