import {
  ClientId,
  EditMessageDraft,
  MessageEditReceipt,
  RecipientNotReached,
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
import type {
  ContactIdentityRowLike,
  UpdateLocalNostrMessage,
} from "../../types/appTypes";

type EditMessage = (
  draft: EditMessageDraft,
) => Promise<Exit.Exit<MessageEditReceipt, { readonly _tag: string }>>;

const { editMessageMock } = vi.hoisted(() => ({
  editMessageMock: vi.fn<EditMessage>(),
}));

vi.mock("@linky/linkstr-react", () => ({
  editChatMessageAtom: "editChatMessageAtom",
  useAtomSet: () => editMessageMock,
}));

import { useEditChatMessage } from "./useEditChatMessage";

Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

const MY_PRIVATE_KEY = new Uint8Array(32).fill(3);
const CONTACT_PRIVATE_KEY = new Uint8Array(32).fill(4);
const MY_PUBKEY = getPublicKey(MY_PRIVATE_KEY);
const CONTACT_PUBKEY = getPublicKey(CONTACT_PRIVATE_KEY);
const CURRENT_NSEC = nip19.nsecEncode(MY_PRIVATE_KEY);
const CONTACT_NPUB = nip19.npubEncode(CONTACT_PUBKEY);
const EDITED_FROM = RumorId.make("11".repeat(32));
const EDIT_MESSAGE_ID = RumorId.make("22".repeat(32));
const SENT_AT = UnixSeconds.make(1_730_000_000);

const delivery = (id: string, accepted = true): WrapDelivery =>
  new WrapDelivery({
    wrapId: WrapId.make(id),
    acceptedBy: accepted ? [RelayUrl.make("wss://relay.example")] : [],
    rejectedBy: [],
  });

const receipt = (clientId: ClientId): MessageEditReceipt =>
  new MessageEditReceipt({
    messageId: EDIT_MESSAGE_ID,
    editOf: EDITED_FROM,
    clientId,
    sentAt: SENT_AT,
    selfCopy: delivery("aa".repeat(32)),
    recipientCopy: delivery("bb".repeat(32)),
  });

const failure = (clientId: ClientId): RecipientNotReached =>
  new RecipientNotReached({
    rumorId: EDIT_MESSAGE_ID,
    clientId,
    sentAt: SENT_AT,
    selfCopy: delivery("aa".repeat(32)),
    recipientCopy: delivery("bb".repeat(32), false),
  });

const setup = async () => {
  let editChatMessage: (() => Promise<void>) | null = null;
  const setChatDraft = vi.fn();
  const setChatSendIsBusy = vi.fn();
  const setEditContext = vi.fn();
  const setStatus = vi.fn();
  const updateLocalNostrMessage = vi.fn<UpdateLocalNostrMessage>();

  const Harness = () => {
    const edit = useEditChatMessage({
      chatDraft: "updated text",
      chatSendIsBusy: false,
      currentNsec: CURRENT_NSEC,
      editContext: {
        messageId: "local-message",
        originalContent: "original text",
        rumorId: EDITED_FROM,
      },
      route: { kind: "chat" },
      selectedContact: {
        id: "contact-1",
        npub: CONTACT_NPUB,
      } satisfies ContactIdentityRowLike,
      setChatDraft,
      setChatSendIsBusy,
      setEditContext,
      setStatus,
      t: (key) => key,
      updateLocalNostrMessage,
    });

    React.useEffect(() => {
      editChatMessage = edit;
    }, [edit]);
    return null;
  };

  const root = createRoot(document.createElement("div"));
  await act(async () => {
    root.render(<Harness />);
  });

  return {
    getEdit: () => editChatMessage,
    root,
    setChatDraft,
    setChatSendIsBusy,
    setEditContext,
    setStatus,
    updateLocalNostrMessage,
  };
};

describe("useEditChatMessage", () => {
  afterEach(() => {
    editMessageMock.mockReset();
    vi.restoreAllMocks();
  });

  it("sends an edit and keeps the original rumor id on the local row", async () => {
    editMessageMock.mockImplementation(async (draft) =>
      Exit.succeed(receipt(draft.clientId ?? ClientId.make("fallback"))),
    );
    const harness = await setup();

    await act(async () => {
      await harness.getEdit()?.();
    });

    const draft = editMessageMock.mock.calls[0]?.[0];
    expect(draft).toBeInstanceOf(EditMessageDraft);
    expect(draft).toMatchObject({
      to: CONTACT_PUBKEY,
      editOf: EDITED_FROM,
      content: "updated text",
    });
    expect(draft?.clientId).toBeTruthy();
    expect(harness.updateLocalNostrMessage).toHaveBeenNthCalledWith(
      1,
      "local-message",
      expect.objectContaining({
        clientId: draft?.clientId,
        content: "updated text",
        editedAtSec: expect.any(Number),
        editedFromId: EDITED_FROM,
        isEdited: true,
        originalContent: "original text",
        rumorId: EDITED_FROM,
        status: "pending",
        wrapId: `pending:edit:${String(draft?.clientId)}`,
      }),
    );
    expect(harness.updateLocalNostrMessage).toHaveBeenNthCalledWith(
      2,
      "local-message",
      {
        pubkey: MY_PUBKEY,
        rumorId: EDITED_FROM,
        status: "sent",
        wrapId: "aa".repeat(32),
      },
    );
    expect(harness.setChatDraft).toHaveBeenCalledWith("");
    expect(harness.setEditContext).toHaveBeenCalledWith(null);
    expect(harness.setChatSendIsBusy).toHaveBeenNthCalledWith(1, true);
    expect(harness.setChatSendIsBusy).toHaveBeenLastCalledWith(false);

    await act(async () => harness.root.unmount());
  });

  it("leaves the edit pending when the recipient is not reached", async () => {
    editMessageMock.mockImplementation(async (draft) =>
      Exit.fail(failure(draft.clientId ?? ClientId.make("fallback"))),
    );
    const harness = await setup();

    await act(async () => {
      await harness.getEdit()?.();
    });

    expect(harness.updateLocalNostrMessage).toHaveBeenCalledOnce();
    expect(harness.updateLocalNostrMessage).toHaveBeenCalledWith(
      "local-message",
      expect.objectContaining({
        rumorId: EDITED_FROM,
        status: "pending",
      }),
    );
    expect(harness.setStatus).toHaveBeenCalledWith("chatQueued");
    expect(harness.setChatSendIsBusy).toHaveBeenLastCalledWith(false);

    await act(async () => harness.root.unmount());
  });
});
