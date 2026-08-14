import * as Evolu from "@evolu/common";
import {
  ChatMessageReceipt,
  ClientId,
  NoRelayReachable,
  PaymentNoticeReceipt,
  RelayUrl,
  RumorId,
  UnixSeconds,
  WrapDelivery,
  WrapId,
} from "@linky/linkstr";
import { Exit } from "effect";
import { getPublicKey, nip19 } from "nostr-tools";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createCashuTokenId } from "../src/app/lib/cashuTokenIdentity";
import type {
  CashuTokenUpdate,
  CashuTokenUpsert,
} from "../src/app/hooks/payments/persistCashuMessagePayment";
import type {
  SendPaymentNotice,
  SendTokenMessage,
} from "../src/app/hooks/payments/publishCashuMessagePayment";
import type {
  CashuTokenRowLike,
  ContactRowLike,
  LocalNostrMessage,
  NewLocalNostrMessage,
} from "../src/app/types/appTypes";

const {
  createSendTokenWithTokensAtMintMock,
  navigateToMock,
  sendPaymentNoticeMock,
  sendTokenMessageMock,
} = vi.hoisted(() => ({
  createSendTokenWithTokensAtMintMock: vi.fn(),
  navigateToMock: vi.fn(),
  sendPaymentNoticeMock: vi.fn<SendPaymentNotice>(),
  sendTokenMessageMock: vi.fn<SendTokenMessage>(),
}));

vi.mock("../src/cashuSend", () => ({
  createSendTokenWithTokensAtMint: createSendTokenWithTokensAtMintMock,
}));

vi.mock("../src/hooks/useRouting", () => ({
  navigateTo: navigateToMock,
}));

vi.mock("@linky/linkstr-react", () => ({
  sendChatTokenAtom: "sendChatTokenAtom",
  sendPaymentNoticeAtom: "sendPaymentNoticeAtom",
  useAtomSet: (atom: unknown) =>
    atom === "sendChatTokenAtom" ? sendTokenMessageMock : sendPaymentNoticeMock,
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

const currentNpub = nip19.npubEncode(getPublicKey(new Uint8Array(32).fill(1)));
const contactNpub = nip19.npubEncode(getPublicKey(new Uint8Array(32).fill(2)));

const sendTokenText = `cashuA${btoa(
  JSON.stringify({
    token: [
      {
        mint: "https://mint.example",
        proofs: [{ amount: 600, C: "c", id: "i", secret: "s" }],
      },
    ],
    unit: "sat",
  }),
)
  .replace(/\+/g, "-")
  .replace(/\//g, "_")
  .replace(/=+$/g, "")}`;

const sentAt = UnixSeconds.make(1_730_000_000);

const delivery = (wrapIdHex: string, accepted: boolean): WrapDelivery =>
  new WrapDelivery({
    wrapId: WrapId.make(wrapIdHex),
    acceptedBy: accepted ? [RelayUrl.make("wss://relay.example")] : [],
    rejectedBy: [],
  });

const tokenReceipt = (clientId: ClientId): ChatMessageReceipt =>
  new ChatMessageReceipt({
    messageId: RumorId.make("12".repeat(32)),
    clientId,
    sentAt,
    selfCopy: delivery("aa".repeat(32), true),
    recipientCopy: delivery("bb".repeat(32), true),
  });

const noticeReceipt = (clientId: ClientId): PaymentNoticeReceipt =>
  new PaymentNoticeReceipt({
    noticeId: RumorId.make("34".repeat(32)),
    clientId,
    sentAt,
    recipientCopy: delivery("cc".repeat(32), true),
  });

const fallbackClientId = ClientId.make("fallback-client");

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
      currentNpub,
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
    createSendTokenWithTokensAtMintMock.mockReset();
    navigateToMock.mockReset();
    sendPaymentNoticeMock.mockReset();
    sendTokenMessageMock.mockReset();
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
        sendToken: sendTokenText,
        unit: "sat",
      };
    });
    sendTokenMessageMock.mockImplementation(async (draft) => {
      operations.push("publish");
      return Exit.succeed(tokenReceipt(draft.clientId ?? fallbackClientId));
    });
    sendPaymentNoticeMock.mockImplementation(async (draft) =>
      Exit.succeed(noticeReceipt(draft.clientId ?? fallbackClientId)),
    );

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
    const logPaymentEvent = vi.fn(() => {
      operations.push("transaction");
    });
    const harness = await setup({
      logPaymentEvent,
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
            npub: contactNpub,
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
    expect(sendPaymentNoticeMock).toHaveBeenCalledOnce();

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
            npub: contactNpub,
          },
        })) ?? null;
    });

    expect(result).toEqual({ ok: true, queued: true });
    expect(createSendTokenWithTokensAtMintMock).not.toHaveBeenCalled();
    expect(sendTokenMessageMock).not.toHaveBeenCalled();
    expect(sendPaymentNoticeMock).not.toHaveBeenCalled();
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
      sendToken: sendTokenText,
      unit: "sat",
    });
    sendTokenMessageMock.mockImplementation(async (draft) =>
      Exit.fail(
        new NoRelayReachable({
          rumorId: RumorId.make("12".repeat(32)),
          clientId: draft.clientId ?? fallbackClientId,
          sentAt,
          selfCopy: delivery("aa".repeat(32), false),
          recipientCopy: delivery("bb".repeat(32), false),
        }),
      ),
    );
    const pushToast = vi.fn();
    const showPaidOverlay = vi.fn();
    const upsert = vi.fn<CashuTokenUpsert>(() => ({ ok: true }));
    const harness = await setup({
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
            npub: contactNpub,
          },
        })) ?? null;
    });

    expect(result).toEqual({ ok: true, queued: true });
    expect(upsert).toHaveBeenCalledWith(
      "cashuToken",
      expect.objectContaining({
        state: "pending",
        token: sendTokenText,
      }),
      { ownerId: ACTIVE_OWNER_ID },
    );
    expect(sendPaymentNoticeMock).not.toHaveBeenCalled();
    expect(pushToast).toHaveBeenCalledWith("payFailed: NoRelayReachable");
    expect(showPaidOverlay).toHaveBeenCalledWith("paidQueuedTo");

    await act(async () => harness.root.unmount());
  });
});
