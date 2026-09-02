import { TopupQuote, TopupReceipt } from "@linky/linkshu";
import { Either, Schema } from "effect";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { navigateTo } from "../../../hooks/useRouting";
import type { Route } from "../../../types/route";
import type {
  CashuTopupHandle,
  StartCashuTopup,
} from "../composition/useLinkshuComposition";
import { useTopupFlow } from "./useTopupFlow";

vi.mock("../../../hooks/useRouting", () => ({
  navigateTo: vi.fn(),
}));

Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
  configurable: true,
  value: true,
});

const MINT = "https://mint.example";

const quote = Schema.decodeUnknownSync(TopupQuote)({
  amount: 100,
  expiresAt: null,
  invoice: "lnbc100n1fakeinvoice",
  mint: MINT,
  quoteId: "quote-1",
});

const receipt = Schema.decodeUnknownSync(TopupReceipt)({
  amount: 100,
  mint: MINT,
  quoteId: "quote-1",
  rowId: "row-1",
  tokenText: "cashuAfake",
});

const flowHolder: { current: ReturnType<typeof useTopupFlow> | null } = {
  current: null,
};

const Harness = ({
  routeKind,
  startCashuTopup,
}: {
  routeKind: Route["kind"];
  startCashuTopup: StartCashuTopup;
}): null => {
  const topupPaidNavTimerRef = React.useRef<number | null>(null);
  const flow = useTopupFlow({
    cashuTotalBalance: 0,
    defaultMintUrl: MINT,
    formatDisplayedAmountParts: () => ({
      amountText: "100",
      approxPrefix: "",
      unitLabel: "sat",
    }),
    logPaymentEvent: () => {},
    resumePendingCashuTopups: null,
    routeKind,
    showPaidOverlay: () => {},
    startCashuTopup,
    t: (key) => key,
    topupPaidNavTimerRef,
    topupRecipientNprofile: null,
  });
  React.useEffect(() => {
    flowHolder.current = flow;
  });
  return null;
};

/** Boots the invoice route, starts a topup, and settles it while still there. */
const settleTopupOnInvoiceRoute = async (
  root: Root,
  startCashuTopup: StartCashuTopup,
  resolveCompletion: () => void,
): Promise<void> => {
  await act(async () => {
    root.render(
      <Harness routeKind="topupInvoice" startCashuTopup={startCashuTopup} />,
    );
  });
  await act(async () => {
    flowHolder.current?.setTopupAmount("100");
  });
  await act(async () => {
    resolveCompletion();
  });
};

describe("useTopupFlow paid navigation timer", () => {
  let container: HTMLDivElement;
  let root: Root;
  let startCashuTopup: StartCashuTopup;
  let resolveCompletion: () => void;

  beforeEach(() => {
    vi.useFakeTimers();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    const completion = new Promise<Either.Either<TopupReceipt, never>>(
      (resolve) => {
        resolveCompletion = () => resolve(Either.right(receipt));
      },
    );
    const handle: CashuTopupHandle = { completion, quote };
    startCashuTopup = vi.fn(async () => Either.right(handle));
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it("navigates to the wallet when the user stays on the invoice page", async () => {
    await settleTopupOnInvoiceRoute(root, startCashuTopup, () =>
      resolveCompletion(),
    );

    await act(async () => {
      vi.advanceTimersByTime(1400);
    });

    expect(navigateTo).toHaveBeenCalledWith({ route: "wallet" });
  });

  it("does not stomp a navigation made during the celebration delay", async () => {
    await settleTopupOnInvoiceRoute(root, startCashuTopup, () =>
      resolveCompletion(),
    );

    await act(async () => {
      root.render(
        <Harness routeKind="contacts" startCashuTopup={startCashuTopup} />,
      );
    });
    await act(async () => {
      vi.advanceTimersByTime(1400);
    });

    expect(navigateTo).not.toHaveBeenCalled();
  });
});
