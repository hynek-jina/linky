import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { serializePrivateImageMessage } from "../app/lib/privateImageMessage";
import type { LocalNostrMessage } from "../app/types/appTypes";
import { ChatMessage, type NpubMessageContactInfo } from "./ChatMessage";

vi.mock("../app/lib/privateImageMessage", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../app/lib/privateImageMessage")>();
  return {
    ...actual,
    decryptPrivateImageMessage: vi.fn(
      async () => new Blob(["img"], { type: "image/jpeg" }),
    ),
  };
});

vi.mock("../devtools/inspector", () => ({
  reportInspectorRows: vi.fn(),
}));

vi.mock("../app/context/AppShellContexts", () => ({
  useAppShellCore: () => ({
    formatDisplayedAmountParts: (amountSat: number) => ({
      amountText: String(amountSat),
      approxPrefix: "",
      unitLabel: "sat",
    }),
    formatDisplayedAmountText: (amountSat: number) => `${amountSat} sat`,
    t: (key: string) => key,
  }),
}));

Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
  configurable: true,
  value: true,
  writable: true,
});

const makeMessage = (
  content: string,
  direction: "in" | "out" = "in",
): LocalNostrMessage => ({
  contactId: "contact-1",
  content,
  createdAtSec: 1_700_000_000,
  direction,
  id: "message-1",
  pubkey: "sender-pubkey",
  rumorId: "rumor-1",
  wrapId: "wrap-1",
});

const contactInfo = (
  npub: string,
  isSaved = false,
): NpubMessageContactInfo => ({
  displayName: npub,
  isSaved,
  npub,
  pictureUrl: "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yw=",
});

interface RenderChatMessageOptions {
  direction?: "in" | "out";
  getNpubMessageContactInfo?: (npub: string) => NpubMessageContactInfo | null;
  onAddNpubContacts?: (npubs: readonly string[]) => void;
}

const renderChatMessage = async (
  content: string,
  options: RenderChatMessageOptions = {},
) => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(
      <ChatMessage
        actionLabels={{
          copy: "copy",
          edit: "edit",
          edited: "edited",
          react: "react",
          reply: "reply",
          save: "save",
          share: "share",
        }}
        bankPaymentOfferInfo={null}
        bankPaymentOfferPeerNotice={null}
        canOpenBankPaymentOfferDetails={true}
        canActOnPaymentRequest={false}
        canEdit={false}
        canReplyOrReact={false}
        chatPendingLabel="pending"
        chatSeenLabel="seen"
        declineInfo={null}
        formatChatDayLabel={() => "day"}
        getCashuTokenMessageInfo={() => null}
        getMintIconUrl={() => ({
          failed: false,
          host: null,
          origin: null,
          url: null,
        })}
        getNpubMessageContactInfo={
          options.getNpubMessageContactInfo ?? ((npub) => contactInfo(npub))
        }
        isSeen={false}
        locale="en"
        message={makeMessage(content, options.direction)}
        nextMessage={null}
        onAddNpubContacts={options.onAddNpubContacts ?? (() => undefined)}
        onCopy={() => undefined}
        onDeclinePaymentRequest={() => undefined}
        onEdit={() => undefined}
        onMintIconError={() => undefined}
        onMintIconLoad={() => undefined}
        onOpenBankPaymentOfferDetails={() => undefined}
        onOpenNpubContact={() => undefined}
        onPayPaymentRequest={() => undefined}
        onReact={() => undefined}
        onReply={() => undefined}
        payPaymentRequestBusy={false}
        payPaymentRequestDisabled={false}
        paymentRequestInfo={null}
        paymentRequestStatus={null}
        previousMessage={null}
        reactions={[]}
        replyQuoteText={null}
      />,
    );
  });

  return container;
};

describe("ChatMessage contact actions", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("adds all unique unsaved contacts from an incoming message", async () => {
    const onAddNpubContacts = vi.fn();
    const container = await renderChatMessage("npub1aaaa npub1cccc npub1aaaa", {
      onAddNpubContacts,
    });
    const button = container.querySelector<HTMLButtonElement>(
      ".chat-add-all-contacts",
    );

    expect(button?.textContent).toContain("addAllContacts");

    await act(async () => {
      button?.click();
    });

    expect(onAddNpubContacts).toHaveBeenCalledOnce();
    expect(onAddNpubContacts).toHaveBeenCalledWith(["npub1aaaa", "npub1cccc"]);
  });

  it("does not show Add all unless two unsaved contacts are incoming", async () => {
    const oneUnsaved = await renderChatMessage("npub1aaaa npub1cccc", {
      getNpubMessageContactInfo: (npub) =>
        contactInfo(npub, npub === "npub1cccc"),
    });
    const outgoing = await renderChatMessage("npub1aaaa npub1cccc", {
      direction: "out",
    });

    expect(oneUnsaved.querySelector(".chat-add-all-contacts")).toBeNull();
    expect(outgoing.querySelector(".chat-add-all-contacts")).toBeNull();
  });
});

describe("ChatMessage image message actions", () => {
  const imageMessageContent = serializePrivateImageMessage({
    encryptedSha256: "a".repeat(64),
    encryptedSize: 4,
    encryptionAlgorithm: "aes-gcm",
    fileType: "image/jpeg",
    height: 10,
    key: "b".repeat(64),
    nonce: "c".repeat(24),
    originalSha256: "d".repeat(64),
    storageEncoding: "base64",
    type: "linky.private_image.v1",
    url: "https://example.com/blob",
    width: 10,
  });
  const share = vi.fn<(data?: ShareData) => Promise<void>>(
    async () => undefined,
  );

  beforeEach(() => {
    share.mockClear();
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:test"),
      writable: true,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn(),
      writable: true,
    });
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: share,
      writable: true,
    });
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  const openMenu = async (container: HTMLElement) => {
    const menuButton = container.querySelector<HTMLButtonElement>(
      '[aria-label="Message actions"]',
    );
    await act(async () => {
      menuButton?.click();
    });
  };

  const menuItemLabels = (): string[] =>
    Array.from(document.body.querySelectorAll(".message-actions-item")).map(
      (item) => item.textContent ?? "",
    );

  it("offers share and save instead of copy once the image is decrypted", async () => {
    const container = await renderChatMessage(imageMessageContent);
    await openMenu(container);

    expect(menuItemLabels()).toEqual(["share", "save"]);
  });

  it("shares the decrypted image as a file through the system share", async () => {
    const container = await renderChatMessage(imageMessageContent);
    await openMenu(container);

    const shareItem = Array.from(
      document.body.querySelectorAll<HTMLButtonElement>(
        ".message-actions-item",
      ),
    ).find((item) => item.textContent === "share");
    await act(async () => {
      shareItem?.click();
    });

    expect(share).toHaveBeenCalledTimes(1);
    const shared = share.mock.calls[0]?.[0];
    const sharedFile = shared?.files?.[0];
    expect(sharedFile?.name).toBe("linky-image.jpg");
    expect(sharedFile?.type).toBe("image/jpeg");
    expect(shared && "url" in shared).toBe(false);
    expect(shared && "text" in shared).toBe(false);
  });

  it("keeps copy for plain text messages", async () => {
    const container = await renderChatMessage("hello there");
    await openMenu(container);

    expect(menuItemLabels()).toEqual(["copy"]);
  });
});
