import {
  ChatMessageReceipt,
  ClientId,
  ImageMessageDraft,
  RecipientNotReached,
  RelayUrl,
  RumorId,
  TextMessageDraft,
  UnixSeconds,
  WrapDelivery,
  WrapId,
} from "@linky/linkstr";
import { Exit } from "effect";
import { getPublicKey, nip19 } from "nostr-tools";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PrivateImageMessagePayload } from "../../lib/privateImageMessage";
import { serializePrivateImageMessage } from "../../lib/privateImageMessage";
import type {
  ContactIdentityRowLike,
  NewLocalNostrMessage,
  UpdateLocalNostrMessage,
} from "../../types/appTypes";
import type { ReplyContext } from "./useSendChatMessage";

type SendExit = Exit.Exit<ChatMessageReceipt, { readonly _tag: string }>;
type SendTextMessage = (draft: TextMessageDraft) => Promise<SendExit>;
type SendImageMessage = (draft: ImageMessageDraft) => Promise<SendExit>;
type CreatePrivateImageSendPayload = (
  file: File,
  auth: { privateKey: Uint8Array; pubkey: string },
) => Promise<{ content: string }>;

const {
  createPrivateImageSendPayloadMock,
  sendImageMessageMock,
  sendTextMessageMock,
} = vi.hoisted(() => ({
  createPrivateImageSendPayloadMock: vi.fn<CreatePrivateImageSendPayload>(),
  sendImageMessageMock: vi.fn<SendImageMessage>(),
  sendTextMessageMock: vi.fn<SendTextMessage>(),
}));

vi.mock("@linky/linkstr-react", () => ({
  sendChatImageAtom: "sendChatImageAtom",
  sendChatTextAtom: "sendChatTextAtom",
  useAtomSet: (atom: unknown) =>
    atom === "sendChatImageAtom" ? sendImageMessageMock : sendTextMessageMock,
}));

vi.mock("../../lib/privateImageMessage", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../lib/privateImageMessage")>();
  return {
    ...actual,
    createPrivateImageSendPayload: createPrivateImageSendPayloadMock,
  };
});

import { useSendChatMessage } from "./useSendChatMessage";

Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

const MY_PRIVATE_KEY = new Uint8Array(32).fill(1);
const CONTACT_PRIVATE_KEY = new Uint8Array(32).fill(2);
const MY_PUBKEY = getPublicKey(MY_PRIVATE_KEY);
const CONTACT_PUBKEY = getPublicKey(CONTACT_PRIVATE_KEY);
const CURRENT_NSEC = nip19.nsecEncode(MY_PRIVATE_KEY);
const CONTACT_NPUB = nip19.npubEncode(CONTACT_PUBKEY);
const REPLY_TO = RumorId.make("11".repeat(32));
const ROOT = RumorId.make("22".repeat(32));
const MESSAGE_ID = RumorId.make("33".repeat(32));
const SENT_AT = UnixSeconds.make(1_730_000_000);

const delivery = (id: string, accepted = true): WrapDelivery =>
  new WrapDelivery({
    wrapId: WrapId.make(id),
    acceptedBy: accepted ? [RelayUrl.make("wss://relay.example")] : [],
    rejectedBy: [],
  });

const receipt = (clientId: ClientId): ChatMessageReceipt =>
  new ChatMessageReceipt({
    messageId: MESSAGE_ID,
    clientId,
    sentAt: SENT_AT,
    selfCopy: delivery("aa".repeat(32)),
    recipientCopy: delivery("bb".repeat(32)),
  });

const failure = (clientId: ClientId): RecipientNotReached =>
  new RecipientNotReached({
    rumorId: MESSAGE_ID,
    clientId,
    sentAt: SENT_AT,
    selfCopy: delivery("aa".repeat(32)),
    recipientCopy: delivery("bb".repeat(32), false),
  });

interface SendOptions {
  clearDraft?: boolean;
  imageFile?: File | null;
  replyContext?: ReplyContext | null;
  text?: string;
}

type SendChatMessage = (options?: SendOptions) => Promise<void>;

interface SetupOptions {
  chatDraft?: string;
  replyContext?: ReplyContext | null;
}

const setup = async (options: SetupOptions = {}) => {
  let sendChatMessage: SendChatMessage | null = null;
  const operations: string[] = [];
  const activePublishClientIdsRef = { current: new Set<string>() };
  const appendLocalNostrMessage = vi.fn<
    (message: NewLocalNostrMessage) => string
  >(() => {
    operations.push("append");
    return "pending-message";
  });
  const setChatDraft = vi.fn();
  const setChatSendIsBusy = vi.fn();
  const setReplyContext = vi.fn();
  const setStatus = vi.fn();
  const triggerChatScrollToBottom = vi.fn();
  const updateLocalNostrMessage = vi.fn<UpdateLocalNostrMessage>(() => {
    operations.push("update");
  });
  const replyContext = options.replyContext ?? null;

  const Harness = () => {
    const send = useSendChatMessage({
      activePublishClientIdsRef,
      appendLocalNostrMessage,
      chatDraft: options.chatDraft ?? "hello",
      chatSendIsBusy: false,
      currentNsec: CURRENT_NSEC,
      route: { kind: "chat" },
      replyContext,
      replyContextRef: { current: replyContext },
      selectedContact: {
        id: "contact-1",
        npub: CONTACT_NPUB,
      } satisfies ContactIdentityRowLike,
      setReplyContext,
      setChatDraft,
      setChatSendIsBusy,
      setStatus,
      t: (key) => key,
      triggerChatScrollToBottom,
      updateLocalNostrMessage,
    });

    React.useEffect(() => {
      sendChatMessage = send;
    }, [send]);
    return null;
  };

  const root = createRoot(document.createElement("div"));
  await act(async () => {
    root.render(<Harness />);
  });

  return {
    activePublishClientIdsRef,
    appendLocalNostrMessage,
    getSend: () => sendChatMessage,
    operations,
    root,
    setChatDraft,
    setChatSendIsBusy,
    setReplyContext,
    setStatus,
    triggerChatScrollToBottom,
    updateLocalNostrMessage,
  };
};

describe("useSendChatMessage", () => {
  afterEach(() => {
    createPrivateImageSendPayloadMock.mockReset();
    sendImageMessageMock.mockReset();
    sendTextMessageMock.mockReset();
    vi.restoreAllMocks();
  });

  it("sends text with reply context and marks the pending row sent", async () => {
    const harness = await setup({
      replyContext: {
        replyToContent: "parent",
        replyToId: REPLY_TO,
        rootMessageId: ROOT,
      },
    });
    sendTextMessageMock.mockImplementation(async (draft) =>
      Exit.succeed(receipt(draft.clientId ?? ClientId.make("fallback"))),
    );

    await act(async () => {
      await harness.getSend()?.();
    });

    const draft = sendTextMessageMock.mock.calls[0]?.[0];
    expect(draft).toBeInstanceOf(TextMessageDraft);
    expect(draft).toMatchObject({
      to: CONTACT_PUBKEY,
      content: "hello",
      replyTo: REPLY_TO,
      root: ROOT,
    });
    expect(draft?.clientId).toBeTruthy();
    expect(harness.appendLocalNostrMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        clientId: draft?.clientId,
        content: "hello",
        pubkey: MY_PUBKEY,
        replyToId: REPLY_TO,
        rootMessageId: ROOT,
        rumorId: null,
        status: "pending",
        wrapId: `pending:${String(draft?.clientId)}`,
      }),
    );
    expect(harness.triggerChatScrollToBottom).toHaveBeenCalledWith(
      "pending-message",
    );
    expect(harness.updateLocalNostrMessage).toHaveBeenCalledWith(
      "pending-message",
      {
        pubkey: MY_PUBKEY,
        rumorId: MESSAGE_ID,
        status: "sent",
        wrapId: "aa".repeat(32),
      },
    );
    expect(harness.operations).toEqual(["append", "update"]);
    expect(harness.setChatDraft).toHaveBeenCalledWith("");
    expect(harness.setChatSendIsBusy).toHaveBeenNthCalledWith(1, true);
    expect(harness.setChatSendIsBusy).toHaveBeenLastCalledWith(false);
    expect(harness.activePublishClientIdsRef.current).toEqual(new Set());

    await act(async () => harness.root.unmount());
  });

  it("sends an uploaded image draft and stores its compact content", async () => {
    const image: PrivateImageMessagePayload = {
      encryptedSha256: "44".repeat(32),
      encryptedSize: 128,
      encryptionAlgorithm: "aes-gcm",
      fileType: "image/jpeg",
      height: 480,
      key: "55".repeat(32),
      nonce: "66".repeat(12),
      originalSha256: "77".repeat(32),
      storageEncoding: "base64",
      type: "linky.private_image.v1",
      url: "https://blossom.example/image",
      width: 640,
    };
    const compactContent = serializePrivateImageMessage(image);
    createPrivateImageSendPayloadMock.mockResolvedValue({
      content: compactContent,
    });
    sendImageMessageMock.mockImplementation(async (draft) =>
      Exit.succeed(receipt(draft.clientId ?? ClientId.make("fallback"))),
    );
    const harness = await setup({ chatDraft: "caption ignored" });
    const file = new File(["image"], "photo.jpg", { type: "image/jpeg" });

    await act(async () => {
      await harness.getSend()?.({ imageFile: file });
    });

    const draft = sendImageMessageMock.mock.calls[0]?.[0];
    expect(draft).toBeInstanceOf(ImageMessageDraft);
    expect(draft?.to).toBe(CONTACT_PUBKEY);
    expect(draft?.image).toMatchObject({
      encryptedSha256: image.encryptedSha256,
      encryptedSize: image.encryptedSize,
      fileType: image.fileType,
      url: image.url,
    });
    expect(draft?.image).not.toHaveProperty("type");
    expect(harness.appendLocalNostrMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        content: compactContent,
        rumorId: null,
      }),
    );
    expect(harness.updateLocalNostrMessage).toHaveBeenCalledWith(
      "pending-message",
      expect.objectContaining({
        rumorId: MESSAGE_ID,
        status: "sent",
        wrapId: "aa".repeat(32),
      }),
    );

    await act(async () => harness.root.unmount());
  });

  it("keeps the row pending when the recipient is not reached", async () => {
    sendTextMessageMock.mockImplementation(async (draft) =>
      Exit.fail(failure(draft.clientId ?? ClientId.make("fallback"))),
    );
    const harness = await setup();

    await act(async () => {
      await harness.getSend()?.();
    });

    expect(harness.appendLocalNostrMessage).toHaveBeenCalledOnce();
    expect(harness.updateLocalNostrMessage).not.toHaveBeenCalled();
    expect(harness.setStatus).toHaveBeenCalledWith("chatQueued");
    expect(harness.setChatSendIsBusy).toHaveBeenLastCalledWith(false);

    await act(async () => harness.root.unmount());
  });

  it("queues offline without invoking a linkstr dispatcher", async () => {
    vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(false);
    const harness = await setup();

    await act(async () => {
      await harness.getSend()?.();
    });

    expect(harness.appendLocalNostrMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        clientId: expect.any(String),
        content: "hello",
        createdAtSec: expect.any(Number),
        rumorId: null,
        status: "pending",
      }),
    );
    expect(sendTextMessageMock).not.toHaveBeenCalled();
    expect(sendImageMessageMock).not.toHaveBeenCalled();
    expect(harness.updateLocalNostrMessage).not.toHaveBeenCalled();
    expect(harness.setStatus).toHaveBeenCalledWith("chatQueued");

    await act(async () => harness.root.unmount());
  });
});
