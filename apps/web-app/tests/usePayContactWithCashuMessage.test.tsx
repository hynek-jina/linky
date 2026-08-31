import * as Evolu from "@evolu/common";
import {
  Amount,
  CurrencyUnit,
  InsufficientFunds,
  MintUrl,
  NonNegativeAmount,
  SendReceipt,
  TokenRowId,
  TokenText,
} from "@linky/linkshu";
import {
  ClientId,
  EnqueueReceipt,
  OutboxJobId,
  OutboxRef,
  PaymentNoticeReceipt,
  RelayUrl,
  RumorId,
  UnixSeconds,
  WrapDelivery,
  WrapId,
} from "@linky/linkstr";
import { Either, Exit } from "effect";
import { getPublicKey, nip19 } from "nostr-tools";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  CashuTokenLifecycle,
  SendCashuToken,
} from "../src/app/hooks/composition/useLinkshuComposition";
import type {
  EnqueueOutbox,
  SendPaymentNotice,
} from "../src/app/hooks/payments/publishCashuMessagePayment";
import type {
  ContactRowLike,
  LocalNostrMessage,
  NewLocalNostrMessage,
} from "../src/app/types/appTypes";

const { enqueueOutboxMock, navigateToMock, sendPaymentNoticeMock } = vi.hoisted(
  () => ({
    enqueueOutboxMock: vi.fn<EnqueueOutbox>(),
    navigateToMock: vi.fn(),
    sendPaymentNoticeMock: vi.fn<SendPaymentNotice>(),
  }),
);

vi.mock("../src/hooks/useRouting", () => ({
  navigateTo: navigateToMock,
}));

vi.mock("@linky/linkstr-react", () => ({
  enqueueOutboxAtom: "enqueueOutboxAtom",
  sendPaymentNoticeAtom: "sendPaymentNoticeAtom",
  useAtomSet: (atom: unknown) =>
    atom === "enqueueOutboxAtom" ? enqueueOutboxMock : sendPaymentNoticeMock,
}));

import { usePayContactWithCashuMessage } from "../src/app/hooks/payments/usePayContactWithCashuMessage";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const CONTACT_ID = Evolu.createIdFromString<"Contact">("contact");
const MINT_URL = "https://mint.example";

const currentNpub = nip19.npubEncode(getPublicKey(new Uint8Array(32).fill(1)));
const contactNpub = nip19.npubEncode(getPublicKey(new Uint8Array(32).fill(2)));

const sendTokenText = `cashuA${btoa(
  JSON.stringify({
    token: [
      {
        mint: MINT_URL,
        proofs: [{ amount: 600, C: "c", id: "i", secret: "s" }],
      },
    ],
    unit: "sat",
  }),
)
  .replace(/\+/g, "-")
  .replace(/\//g, "_")
  .replace(/=+$/g, "")}`;

const sendReceipt = new SendReceipt({
  rowId: TokenRowId.make("send-row"),
  tokenText: TokenText.make(sendTokenText),
  mint: MintUrl.make(MINT_URL),
  unit: CurrencyUnit.make("sat"),
  amount: Amount.make(600),
  changeAmount: NonNegativeAmount.make(400),
  feePaid: NonNegativeAmount.make(0),
});

const sentAt = UnixSeconds.make(1_730_000_000);

const delivery = (wrapIdHex: string, accepted: boolean): WrapDelivery =>
  new WrapDelivery({
    wrapId: WrapId.make(wrapIdHex),
    acceptedBy: accepted ? [RelayUrl.make("wss://relay.example")] : [],
    rejectedBy: [],
  });

const enqueueReceipt = (clientId: ClientId, ref: OutboxRef): EnqueueReceipt =>
  new EnqueueReceipt({
    jobId: OutboxJobId.make("job-1"),
    ref,
    messageId: RumorId.make("12".repeat(32)),
    clientId,
    sentAt,
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
  enqueuePendingPayment?: ReturnType<typeof vi.fn>;
  forget?: ReturnType<typeof vi.fn>;
  logPaymentEvent?: ReturnType<typeof vi.fn>;
  nostrMessagesLocal?: LocalNostrMessage[];
  pushToast?: ReturnType<typeof vi.fn>;
  sendCashuToken?: SendCashuToken;
  setStatus?: ReturnType<typeof vi.fn>;
  showPaidOverlay?: ReturnType<typeof vi.fn>;
  updateLocalNostrMessage?: ReturnType<typeof vi.fn>;
}

const setup = async (options: SetupOptions = {}) => {
  let payContact: PayContact | null = null;
  const enqueuePendingPayment = options.enqueuePendingPayment ?? vi.fn();
  const forget = options.forget ?? vi.fn(async () => {});
  const logPaymentEvent = options.logPaymentEvent ?? vi.fn();
  const pushToast = options.pushToast ?? vi.fn();
  const setStatus = options.setStatus ?? vi.fn();
  const showPaidOverlay = options.showPaidOverlay ?? vi.fn();
  const updateLocalNostrMessage = options.updateLocalNostrMessage ?? vi.fn();
  const sendCashuToken =
    options.sendCashuToken ?? vi.fn(async () => Either.right(sendReceipt));

  const cashuTokenLifecycle: CashuTokenLifecycle = {
    checkIssuedClaims: vi.fn(),
    forget,
    markExternalized: vi.fn(),
    markIssued: vi.fn(),
    reserve: vi.fn(),
    returnToWallet: vi.fn(),
  };

  const Harness = () => {
    const pay = usePayContactWithCashuMessage<ContactRowLike>({
      appendLocalNostrMessage:
        options.appendLocalNostrMessage ?? (() => "local-message"),
      cashuBalance: 1_000,
      cashuTokenLifecycle,
      currentNpub,
      currentNsec: "nsec-test",
      defaultMintUrl: MINT_URL,
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
      sendCashuToken,
      setContactsOnboardingHasPaid: vi.fn(),
      setStatus,
      showPaidOverlay,
      t: (key) => key,
      updateLocalNostrMessage,
      walletMintBalances: [{ amount: 1_000, mint: MINT_URL }],
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
    forget,
    getPay: () => payContact,
    logPaymentEvent,
    pushToast,
    root,
    sendCashuToken,
    setStatus,
    showPaidOverlay,
    updateLocalNostrMessage,
  };
};

const payAlice = async (harness: Awaited<ReturnType<typeof setup>>) => {
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
  return result;
};

describe("usePayContactWithCashuMessage", () => {
  afterEach(() => {
    enqueueOutboxMock.mockReset();
    navigateToMock.mockReset();
    sendPaymentNoticeMock.mockReset();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("sends via linkshu, publishes, forgets the delivered row, finalizes transaction", async () => {
    const operations: string[] = [];
    const sendCashuToken = vi.fn<SendCashuToken>(async (args) => {
      operations.push(`send:${args.mint}:${args.amountSat}:${args.produceAs}`);
      return Either.right(sendReceipt);
    });
    enqueueOutboxMock.mockImplementation(async (input) => {
      operations.push("enqueue");
      return Exit.succeed(
        enqueueReceipt(input.op.draft.clientId ?? fallbackClientId, input.ref),
      );
    });
    sendPaymentNoticeMock.mockImplementation(async (draft) =>
      Exit.succeed(noticeReceipt(draft.clientId ?? fallbackClientId)),
    );
    const forget = vi.fn(async (rowId: string) => {
      operations.push(`forget:${rowId}`);
    });
    const logPaymentEvent = vi.fn(() => {
      operations.push("transaction");
    });
    const harness = await setup({ forget, logPaymentEvent, sendCashuToken });

    const result = await payAlice(harness);

    expect(result).toEqual({ ok: true, queued: false });
    expect(operations).toEqual([
      `send:${MINT_URL}:600:pending`,
      "enqueue",
      "forget:send-row",
      "transaction",
    ]);
    expect(logPaymentEvent).toHaveBeenCalledWith(
      expect.objectContaining({ phase: "complete", status: "ok" }),
    );
    expect(sendPaymentNoticeMock).toHaveBeenCalledOnce();
    expect(navigateToMock).toHaveBeenCalledWith({
      id: CONTACT_ID,
      route: "chat",
    });

    await act(async () => harness.root.unmount());
  });

  it("queues an offline placeholder without swapping or publishing", async () => {
    vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(false);
    const appendLocalNostrMessage = vi.fn(() => "offline-message");
    const sendCashuToken = vi.fn<SendCashuToken>();
    const harness = await setup({ appendLocalNostrMessage, sendCashuToken });

    const result = await payAlice(harness);

    expect(result).toEqual({ ok: true, queued: true });
    expect(sendCashuToken).not.toHaveBeenCalled();
    expect(enqueueOutboxMock).not.toHaveBeenCalled();
    expect(sendPaymentNoticeMock).not.toHaveBeenCalled();
    expect(harness.enqueuePendingPayment).toHaveBeenCalledWith({
      amountSat: 600,
      contactId: CONTACT_ID,
      messageId: "offline-message",
    });
    expect(appendLocalNostrMessage).toHaveBeenCalledOnce();

    await act(async () => harness.root.unmount());
  });

  it("keeps the pending row and returns queued on enqueue failure", async () => {
    enqueueOutboxMock.mockResolvedValue(
      Exit.fail({ _tag: "LinkstrNotConfigured" }),
    );
    const pushToast = vi.fn();
    const showPaidOverlay = vi.fn();
    const harness = await setup({ pushToast, showPaidOverlay });

    const result = await payAlice(harness);

    expect(result).toEqual({ ok: true, queued: true });
    expect(harness.forget).not.toHaveBeenCalled();
    expect(sendPaymentNoticeMock).not.toHaveBeenCalled();
    expect(pushToast).toHaveBeenCalledWith("payFailed: LinkstrNotConfigured");
    expect(showPaidOverlay).toHaveBeenCalledWith("paidQueuedTo");

    await act(async () => harness.root.unmount());
  });

  it("reports insufficient funds without publishing when the send fails", async () => {
    const sendCashuToken = vi.fn<SendCashuToken>(async () =>
      Either.left(
        new InsufficientFunds({
          mint: MintUrl.make(MINT_URL),
          required: Amount.make(600),
          available: NonNegativeAmount.make(10),
        }),
      ),
    );
    const setStatus = vi.fn();
    const harness = await setup({ sendCashuToken, setStatus });

    const result = await payAlice(harness);

    expect(result).toEqual({
      error: "Insufficient funds",
      ok: false,
      queued: false,
    });
    expect(setStatus).toHaveBeenCalledWith("payInsufficient");
    expect(enqueueOutboxMock).not.toHaveBeenCalled();
    expect(harness.forget).not.toHaveBeenCalled();

    await act(async () => harness.root.unmount());
  });
});
