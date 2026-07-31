import * as Evolu from "@evolu/common";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createCashuTokenId } from "../src/app/lib/cashuTokenIdentity";
import type {
  CashuTokenUpdate,
  CashuTokenUpsert,
} from "../src/app/hooks/payments/persistCashuMessagePayment";
import type {
  CashuTokenRowLike,
  ContactRowLike,
  LocalNostrMessage,
  NewLocalNostrMessage,
} from "../src/app/types/appTypes";

const {
  createLinkyPaymentNoticeEventMock,
  createSendTokenWithTokensAtMintMock,
  getSharedAppNostrPoolMock,
  navigateToMock,
  wrapEventWithPushMarkerMock,
  wrapEventWithoutPushMarkerMock,
} = vi.hoisted(() => ({
  createLinkyPaymentNoticeEventMock: vi.fn(),
  createSendTokenWithTokensAtMintMock: vi.fn(),
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
        return { data: new Uint8Array([1, 2, 3]), type: "nsec" };
      }
      if (value === "npub-test") {
        return { data: "contact-pubkey-hex", type: "npub" };
      }
      throw new Error(`Unexpected decode value: ${value}`);
    }),
  },
}));

vi.mock("../src/app/lib/pushWrappedEvent", () => ({
  createLinkyPaymentNoticeEvent: createLinkyPaymentNoticeEventMock,
  LINKY_PAYMENT_NOTICE_CONTEXT_BANK_PAYMENT_OFFER: "bank_payment_offer",
  wrapEventWithPushMarker: wrapEventWithPushMarkerMock,
  wrapEventWithoutPushMarker: wrapEventWithoutPushMarkerMock,
}));

import { usePayContactWithCashuMessage } from "../src/app/hooks/payments/usePayContactWithCashuMessage";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const oldOwnerResult = Evolu.OwnerId.fromUnknown("AAAAAAAAAAAAAAAAAAAAAA");
const activeOwnerResult = Evolu.OwnerId.fromUnknown("AQEBAQEBAQEBAQEBAQEBAQ");
if (!oldOwnerResult.ok || !activeOwnerResult.ok) {
  throw new Error("Invalid test owner ids");
}
const OLD_OWNER_ID = oldOwnerResult.value;
const ACTIVE_OWNER_ID = activeOwnerResult.value;
const CONTACT_ID = Evolu.createIdFromString<"Contact">("contact");
const OLD_TOKEN_ID = createCashuTokenId("cashu-old-token");
const withOwner = (row: CashuTokenRowLike, ownerId: Evolu.OwnerId) => ({
  ...row,
  ownerId,
});

type PayContact = ReturnType<
  typeof usePayContactWithCashuMessage<ContactRowLike>
>;

interface SetupOptions {
  appendLocalNostrMessage?: (message: NewLocalNostrMessage) => string;
  cashuTokensAll?: readonly CashuTokenRowLike[];
  cashuTokensWithMeta?: readonly CashuTokenRowLike[];
  enqueuePendingPayment?: ReturnType<typeof vi.fn>;
  logPaymentEvent?: ReturnType<typeof vi.fn>;
  nostrMessagesLocal?: LocalNostrMessage[];
  publishSingleWrappedWithRetry?: ReturnType<typeof vi.fn>;
  publishWrappedWithRetry?: ReturnType<typeof vi.fn>;
  pushToast?: ReturnType<typeof vi.fn>;
  showPaidOverlay?: ReturnType<typeof vi.fn>;
  update?: CashuTokenUpdate;
  updateLocalNostrMessage?: ReturnType<typeof vi.fn>;
  upsert?: CashuTokenUpsert;
}

const setup = async (options: SetupOptions = {}) => {
  let payContact: PayContact | null = null;
  const enqueuePendingPayment = options.enqueuePendingPayment ?? vi.fn();
  const logPaymentEvent = options.logPaymentEvent ?? vi.fn();
  const publishSingleWrappedWithRetry =
    options.publishSingleWrappedWithRetry ??
    vi.fn(async () => ({ anySuccess: true, error: null }));
  const publishWrappedWithRetry =
    options.publishWrappedWithRetry ??
    vi.fn(async () => ({ anySuccess: true, error: null }));
  const pushToast = options.pushToast ?? vi.fn();
  const showPaidOverlay = options.showPaidOverlay ?? vi.fn();
  const update =
    options.update ?? vi.fn<CashuTokenUpdate>(() => ({ ok: true }));
  const updateLocalNostrMessage = options.updateLocalNostrMessage ?? vi.fn();
  const upsert =
    options.upsert ?? vi.fn<CashuTokenUpsert>(() => ({ ok: true }));

  const Harness = () => {
    const pay = usePayContactWithCashuMessage<ContactRowLike>({
      activePublishClientIdsRef: { current: new Set<string>() },
      appendLocalNostrMessage:
        options.appendLocalNostrMessage ?? (() => "local-message"),
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
      cashuBalance: 1_000,
      cashuTokensAll: options.cashuTokensAll ?? [],
      cashuTokensWithMeta: options.cashuTokensWithMeta ?? [
        withOwner(
          {
            amount: 1_000,
            id: OLD_TOKEN_ID,
            mint: "https://mint.example",
            state: "accepted",
            token: "cashu-old-token",
            unit: "sat",
          },
          OLD_OWNER_ID,
        ),
      ],
      currentNpub: "npub-test",
      currentNsec: "nsec-test",
      defaultMintUrl: "https://mint.example",
      enqueuePendingPayment,
      formatDisplayedAmountParts: (amountSat) => ({
        approxPrefix: "",
        amountText: String(amountSat),
        unitLabel: "sat",
      }),
      logPayStep: vi.fn(),
      logPaymentEvent,
      nostrMessagesLocal: options.nostrMessagesLocal ?? [],
      payWithCashuEnabled: true,
      publishSingleWrappedWithRetry,
      publishWrappedWithRetry,
      pushToast,
      resolveOwnerIdForWrite: vi.fn(async () => ACTIVE_OWNER_ID),
      setContactsOnboardingHasPaid: vi.fn(),
      setStatus: vi.fn(),
      showPaidOverlay,
      t: (key) => key,
      update,
      updateLocalNostrMessage,
      upsert,
    });

    React.useEffect(() => {
      payContact = pay;
    }, [pay]);
    return null;
  };

  const root = createRoot(document.createElement("div"));
  await act(async () => {
    root.render(<Harness />);
  });

  return {
    enqueuePendingPayment,
    getPay: () => payContact,
    logPaymentEvent,
    publishSingleWrappedWithRetry,
    publishWrappedWithRetry,
    pushToast,
    root,
    showPaidOverlay,
    update,
    updateLocalNostrMessage,
    upsert,
  };
};

describe("usePayContactWithCashuMessage", () => {
  afterEach(() => {
    createLinkyPaymentNoticeEventMock.mockReset();
    createSendTokenWithTokensAtMintMock.mockReset();
    getSharedAppNostrPoolMock.mockReset();
    navigateToMock.mockReset();
    wrapEventWithPushMarkerMock.mockReset();
    wrapEventWithoutPushMarkerMock.mockReset();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("orders swap, owner-aware commit, publish, and transaction finalization", async () => {
    const operations: string[] = [];
    createSendTokenWithTokensAtMintMock.mockImplementation(async () => {
      operations.push("swap");
      return {
        mint: "https://mint.example",
        ok: true,
        remainingAmount: 400,
        remainingToken: "cashu-change-token",
        sendAmount: 600,
        sendProofs: [],
        sendToken: "cashu-send-token",
        unit: "sat",
      };
    });
    getSharedAppNostrPoolMock.mockResolvedValue({});
    wrapEventWithoutPushMarkerMock
      .mockReturnValueOnce({ id: "wrap-me" })
      .mockReturnValueOnce({ id: "wrap-contact" });
    createLinkyPaymentNoticeEventMock.mockReturnValue({
      content: "payment_notice",
      created_at: 1_730_000_000,
      kind: 24133,
      pubkey: "my-pubkey-hex",
      tags: [],
    });
    wrapEventWithPushMarkerMock.mockReturnValue({
      id: "wrap-payment-notice",
    });

    const update = vi.fn<CashuTokenUpdate>((_table, payload, options) => {
      if (typeof payload === "object" && payload !== null) {
        operations.push(
          `delete:${String(Reflect.get(payload, "id"))}:${String(options?.ownerId)}`,
        );
      }
      return { ok: true };
    });
    const upsert = vi.fn<CashuTokenUpsert>((_table, payload) => {
      if (typeof payload === "object" && payload !== null) {
        operations.push(
          `insert:${String(Reflect.get(payload, "token"))}:${String(Reflect.get(payload, "state"))}`,
        );
      }
      return { ok: true };
    });
    const publishWrappedWithRetry = vi.fn(async () => {
      operations.push("publish");
      return { anySuccess: true, error: null };
    });
    const logPaymentEvent = vi.fn(() => {
      operations.push("transaction");
    });
    const harness = await setup({
      logPaymentEvent,
      publishWrappedWithRetry,
      update,
      upsert,
    });

    let result: Awaited<ReturnType<PayContact>> | null = null;
    await act(async () => {
      result =
        (await harness.getPay()?.({
          amountSat: 600,
          contact: {
            id: CONTACT_ID,
            name: "Alice",
            npub: "npub-test",
          },
        })) ?? null;
    });

    expect(result).toEqual({ ok: true, queued: false });
    expect(operations).toEqual([
      "swap",
      `delete:${String(OLD_TOKEN_ID)}:${String(OLD_OWNER_ID)}`,
      "insert:cashu-change-token:accepted",
      "publish",
      "transaction",
    ]);
    expect(operations).not.toContain(
      `delete:${String(OLD_TOKEN_ID)}:${String(ACTIVE_OWNER_ID)}`,
    );

    await act(async () => harness.root.unmount());
  });

  it("queues an offline placeholder without swapping or publishing", async () => {
    vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(false);
    const appendLocalNostrMessage = vi.fn(() => "offline-message");
    const harness = await setup({ appendLocalNostrMessage });

    let result: Awaited<ReturnType<PayContact>> | null = null;
    await act(async () => {
      result =
        (await harness.getPay()?.({
          amountSat: 600,
          contact: {
            id: CONTACT_ID,
            name: "Alice",
            npub: "npub-test",
          },
        })) ?? null;
    });

    expect(result).toEqual({ ok: true, queued: true });
    expect(createSendTokenWithTokensAtMintMock).not.toHaveBeenCalled();
    expect(harness.publishWrappedWithRetry).not.toHaveBeenCalled();
    expect(harness.publishSingleWrappedWithRetry).not.toHaveBeenCalled();
    expect(harness.enqueuePendingPayment).toHaveBeenCalledWith({
      amountSat: 600,
      contactId: CONTACT_ID,
      messageId: "offline-message",
    });
    expect(appendLocalNostrMessage).toHaveBeenCalledOnce();

    await act(async () => harness.root.unmount());
  });

  it("stores an unpublished send token and returns queued on relay failure", async () => {
    createSendTokenWithTokensAtMintMock.mockResolvedValue({
      mint: "https://mint.example",
      ok: true,
      remainingAmount: 0,
      remainingToken: null,
      sendAmount: 600,
      sendProofs: [],
      sendToken: "cashu-send-token",
      unit: "sat",
    });
    getSharedAppNostrPoolMock.mockResolvedValue({});
    wrapEventWithoutPushMarkerMock
      .mockReturnValueOnce({ id: "wrap-me" })
      .mockReturnValueOnce({ id: "wrap-contact" });
    const pushToast = vi.fn();
    const showPaidOverlay = vi.fn();
    const upsert = vi.fn<CashuTokenUpsert>(() => ({ ok: true }));
    const harness = await setup({
      publishWrappedWithRetry: vi.fn(async () => ({
        anySuccess: false,
        error: "relay unavailable",
      })),
      pushToast,
      showPaidOverlay,
      upsert,
    });

    let result: Awaited<ReturnType<PayContact>> | null = null;
    await act(async () => {
      result =
        (await harness.getPay()?.({
          amountSat: 600,
          contact: {
            id: CONTACT_ID,
            name: "Alice",
            npub: "npub-test",
          },
        })) ?? null;
    });

    expect(result).toEqual({ ok: true, queued: true });
    expect(upsert).toHaveBeenCalledWith(
      "cashuToken",
      expect.objectContaining({
        state: "pending",
        token: "cashu-send-token",
      }),
      { ownerId: ACTIVE_OWNER_ID },
    );
    expect(pushToast).toHaveBeenCalledWith("payFailed: relay unavailable");
    expect(showPaidOverlay).toHaveBeenCalledWith("paidQueuedTo");

    await act(async () => harness.root.unmount());
  });
});
