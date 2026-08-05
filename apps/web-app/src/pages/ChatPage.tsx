import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FC,
} from "react";
import { useAppShellCore } from "../app/context/AppShellContexts";
import { aggregateReactions } from "../app/hooks/messages/chatNostrProtocol";
import type { EditChatContext } from "../app/hooks/messages/useEditChatMessage";
import type { ReplyContext } from "../app/hooks/messages/useSendChatMessage";
import {
  getLinkyBankPaymentOfferInfo,
  isLinkyBankPaymentOfferExpired,
  isLinkyBankPaymentOfferMinimized,
  setLinkyBankPaymentOfferMinimized,
  type LinkyBankPaymentOfferInfo,
  type LinkyBankPaymentOfferStatus,
} from "../app/lib/bankPaymentOffer";
import { formatChatMessagePreviewText } from "../app/lib/chatMessageDisplay";
import {
  getMessageEditorValue,
  setMessageEditorCaret,
} from "../app/lib/messageEditorDom";
import {
  captureChatViewportAnchor,
  restoreChatViewportAnchor,
  type ChatViewportAnchor,
} from "../app/lib/chatViewport";
import {
  applyMessageMentionSuggestion,
  getMessageMentionQuery,
  getMessageMentionSuggestions,
  type MessageMentionContact,
  type MessageMentionSuggestion,
} from "../app/lib/messageMentions";
import {
  parseCashuPaymentRequestMessage,
  parseLinkyPaymentRequestDeclineMessage,
  type CashuPaymentRequestMessageInfo,
} from "../app/lib/paymentRequestMessage";
import { parsePrivateImageMessage } from "../app/lib/privateImageMessage";
import type { CashuTokenMessageInfo } from "../app/lib/tokenMessageInfo";
import type {
  ChatReactionChip,
  LocalNostrMessage,
  LocalNostrReaction,
  MintUrlInput,
} from "../app/types/appTypes";
import {
  ChatMessage,
  type BankPaymentOfferPeerNotice,
  type NpubMessageContactInfo,
} from "../components/ChatMessage";
import { ChatMessageEditor } from "../components/ChatMessageEditor";
import {
  DonateIcon,
  GalleryIcon,
  PayIcon,
  RequestIcon,
  SendIcon,
} from "../components/icons";
import { ReplyPreview } from "../components/ReplyPreview";
import { navigateTo } from "../hooks/useRouting";
import { formatChatDayLabel, normalizeLocale } from "../utils/formatting";
import { normalizeNpubIdentifier } from "../utils/nostrNpub";

interface Contact {
  id: string;
  isUnknownContact?: boolean;
  npub?: string | null;
  unknownPubkeyHex?: string | null;
  lnAddress?: string | null;
}

interface ChatPageProps {
  cashuBalance: number;
  cashuBalanceAfterMelt: number;
  cashuIsBusy: boolean;
  chatDraft: string;
  chatMessageElByIdRef: React.MutableRefObject<Map<string, HTMLDivElement>>;
  chatMessages: LocalNostrMessage[];
  bankPaymentOfferMessages: LocalNostrMessage[];
  chatMessagesRef: React.RefObject<HTMLDivElement | null>;
  chatOwnPubkeyHex: string | null;
  chatSendIsBusy: boolean;
  editContext: EditChatContext | null;
  feedbackContactNpub: string;
  getCashuTokenMessageInfo: (id: string) => CashuTokenMessageInfo | null;
  getMintIconUrl: (mint: MintUrlInput) => {
    origin: string | null;
    url: string | null;
    host: string | null;
    failed: boolean;
  };
  getNpubMessageContactInfo: (npub: string) => NpubMessageContactInfo | null;
  isBankPaymentOfferCanceled: (offerId: string) => boolean;
  lang: string;
  mentionContacts: MessageMentionContact[];
  onCancelEdit: () => void;
  onCancelReply: () => void;
  onAddUnknownContact: () => Promise<void>;
  onAddNpubContacts: (npubs: readonly string[]) => void;
  onBlockUnknownContact: () => Promise<void>;
  onCopy: (message: LocalNostrMessage) => void;
  onDeclinePaymentRequest: (message: LocalNostrMessage) => Promise<void>;
  onRespondBankPaymentOffer: (
    message: LocalNostrMessage,
    nextStatus: LinkyBankPaymentOfferStatus,
    options?: {
      expiresAtSec?: number | null;
      extensionSec?: number | null;
      withPush?: boolean;
    },
  ) => Promise<boolean>;
  onSettleBankPaymentOffer: (message: LocalNostrMessage) => Promise<void>;
  onEdit: (message: LocalNostrMessage) => void;
  onOpenNpubContact: (npub: string) => void;
  onPayPaymentRequest: (
    message: LocalNostrMessage,
    requestInfo: CashuPaymentRequestMessageInfo,
  ) => Promise<void>;
  onReact: (message: LocalNostrMessage, emoji: string) => void;
  onReply: (message: LocalNostrMessage) => void;
  openContactPay: (
    id: string,
    returnToChat?: boolean,
    intent?: "pay" | "request",
  ) => void;
  payWithCashuEnabled: boolean;
  reactionsByMessageId: Map<string, LocalNostrReaction[]>;
  replyContext: ReplyContext | null;
  selectedContact: Contact | null;
  sendChatImage: (
    file: File,
    replyToMessage?: LocalNostrMessage,
  ) => Promise<void>;
  sendChatMessage: () => Promise<void>;
  setChatDraft: (value: string) => void;
  setMintIconUrlByMint: React.Dispatch<
    React.SetStateAction<Record<string, string | null>>
  >;
  t: (key: string) => string;
}

interface IndexedBankPaymentOffer {
  contactId: string;
  info: LinkyBankPaymentOfferInfo;
  updatedAtSec: number;
}

interface ParsedChatMessage {
  bankPaymentOfferInfo: LinkyBankPaymentOfferInfo | null;
  declineInfo: ReturnType<typeof parseLinkyPaymentRequestDeclineMessage>;
  isCashuToken: boolean;
  paymentRequestInfo: CashuPaymentRequestMessageInfo | null;
  privateImageInfo: ReturnType<typeof parsePrivateImageMessage>;
}

interface ChatMessageViewModel extends ParsedChatMessage {
  bankPaymentOfferPeerNotice: BankPaymentOfferPeerNotice | null;
  canActOnPaymentRequest: boolean;
  canEdit: boolean;
  canReplyOrReact: boolean;
  message: LocalNostrMessage;
  nextMessage: LocalNostrMessage | null;
  onDeclinePaymentRequest: () => void;
  onOpenBankPaymentOfferDetails: () => void;
  onPayPaymentRequest: (requestInfo: CashuPaymentRequestMessageInfo) => void;
  payPaymentRequestDisabled: boolean;
  paymentRequestStatus: "declined" | "paid" | "requested" | null;
  previousMessage: LocalNostrMessage | null;
  reactions: readonly ChatReactionChip[];
  replyQuoteText: string | null;
}

const buildBankPaymentOfferIndex = (
  messages: LocalNostrMessage[],
): Map<string, IndexedBankPaymentOffer[]> => {
  const byOfferId = new Map<string, IndexedBankPaymentOffer[]>();

  for (const message of messages) {
    const info = getLinkyBankPaymentOfferInfo(String(message.content ?? ""));
    if (!info) continue;

    const indexed = {
      contactId: String(message.contactId ?? "").trim(),
      info,
      updatedAtSec:
        info.statusUpdatedAtSec || Number(message.createdAtSec ?? 0) || 0,
    };
    const candidates = byOfferId.get(info.offerId);
    if (candidates) candidates.push(indexed);
    else byOfferId.set(info.offerId, [indexed]);
  }

  return byOfferId;
};

const getBankPaymentOfferPeerNotice = (
  message: LocalNostrMessage,
  offerInfo: LinkyBankPaymentOfferInfo | null,
  offersById: Map<string, IndexedBankPaymentOffer[]>,
): BankPaymentOfferPeerNotice | null => {
  if (!offerInfo || String(message.direction ?? "") !== "out") return null;
  if (
    offerInfo.status === "accepted_by_other" ||
    offerInfo.status === "bank_details_sent" ||
    offerInfo.status === "bank_paid" ||
    offerInfo.status === "canceled" ||
    offerInfo.status === "settled"
  ) {
    return null;
  }

  const contactId = String(message.contactId ?? "").trim();
  const currentUpdatedAtSec =
    offerInfo.statusUpdatedAtSec || Number(message.createdAtSec ?? 0) || 0;
  let otherAccepted = false;
  let otherHasPriority = false;

  for (const candidate of offersById.get(offerInfo.offerId) ?? []) {
    if (!candidate.contactId || candidate.contactId === contactId) continue;

    if (
      candidate.info.status === "bank_details_sent" ||
      candidate.info.status === "bank_paid" ||
      candidate.info.status === "settled"
    ) {
      otherAccepted = true;
      otherHasPriority = true;
      break;
    }

    if (candidate.info.status !== "accepted") continue;
    otherAccepted = true;
    if (
      offerInfo.status === "accepted" &&
      (candidate.updatedAtSec < currentUpdatedAtSec ||
        (candidate.updatedAtSec === currentUpdatedAtSec &&
          candidate.contactId.localeCompare(contactId) < 0))
    ) {
      otherHasPriority = true;
    }
  }

  if (!otherAccepted) return null;
  if (offerInfo.status === "accepted") {
    return otherHasPriority ? "backup_recipient" : null;
  }
  return "accepted_by_other";
};

interface ChatMessageListProps {
  bankPaymentOfferMessages: LocalNostrMessage[];
  canOpenBankPaymentOfferDetails: boolean;
  cashuBalanceAfterMelt: number;
  cashuIsBusy: boolean;
  chatMessageElByIdRef: React.MutableRefObject<Map<string, HTMLDivElement>>;
  chatMessages: LocalNostrMessage[];
  chatMessagesRef: React.RefObject<HTMLDivElement | null>;
  chatOwnPubkeyHex: string | null;
  formatDisplayedAmountText: (amount: number) => string;
  getCashuTokenMessageInfo: (id: string) => CashuTokenMessageInfo | null;
  getMintIconUrl: ChatPageProps["getMintIconUrl"];
  getNpubMessageContactInfo: ChatPageProps["getNpubMessageContactInfo"];
  lang: string;
  onCopy: ChatPageProps["onCopy"];
  onAddNpubContacts: ChatPageProps["onAddNpubContacts"];
  onDeclinePaymentRequest: ChatPageProps["onDeclinePaymentRequest"];
  onEdit: ChatPageProps["onEdit"];
  onOpenNpubContact: ChatPageProps["onOpenNpubContact"];
  onPayPaymentRequest: ChatPageProps["onPayPaymentRequest"];
  onReact: ChatPageProps["onReact"];
  onReply: ChatPageProps["onReply"];
  reactionsByMessageId: Map<string, LocalNostrReaction[]>;
  selectedContactId: string;
  setMintIconUrlByMint: ChatPageProps["setMintIconUrlByMint"];
  t: ChatPageProps["t"];
}

const ChatMessageList = memo(function ChatMessageList({
  bankPaymentOfferMessages,
  canOpenBankPaymentOfferDetails,
  cashuBalanceAfterMelt,
  cashuIsBusy,
  chatMessageElByIdRef,
  chatMessages,
  chatMessagesRef,
  chatOwnPubkeyHex,
  formatDisplayedAmountText,
  getCashuTokenMessageInfo,
  getMintIconUrl,
  getNpubMessageContactInfo,
  lang,
  onCopy,
  onAddNpubContacts,
  onDeclinePaymentRequest,
  onEdit,
  onOpenNpubContact,
  onPayPaymentRequest,
  onReact,
  onReply,
  reactionsByMessageId,
  selectedContactId,
  setMintIconUrlByMint,
  t,
}: ChatMessageListProps) {
  const actionLabels = useMemo(
    () => ({
      copy: t("copy"),
      edit: t("chatEditAction"),
      edited: t("chatEdited"),
      react: t("chatReactAction"),
      reply: t("chatReplyAction"),
    }),
    [t],
  );
  const chatPendingLabel = t("chatPendingShort");
  const locale = normalizeLocale(lang);
  const formatChatDayLabelForLang = useCallback(
    (timestamp: number) => formatChatDayLabel(timestamp, lang, t),
    [lang, t],
  );
  const onMintIconLoad = useCallback(
    (origin: string, url: string | null) => {
      setMintIconUrlByMint((previous) => ({ ...previous, [origin]: url }));
    },
    [setMintIconUrlByMint],
  );
  const onMintIconError = useCallback(
    (origin: string, nextUrl: string | null) => {
      setMintIconUrlByMint((previous) => ({
        ...previous,
        [origin]: nextUrl,
      }));
    },
    [setMintIconUrlByMint],
  );
  const messageElRef = useCallback(
    (element: HTMLDivElement | null, messageId: string) => {
      const elements = chatMessageElByIdRef.current;
      if (element) elements.set(messageId, element);
      else elements.delete(messageId);
    },
    [chatMessageElByIdRef],
  );

  const viewModels = useMemo<ChatMessageViewModel[]>(() => {
    const byRumorId = new Map<string, LocalNostrMessage>();
    const parsedByMessage = new Map<LocalNostrMessage, ParsedChatMessage>();

    for (const message of chatMessages) {
      const content = String(message.content ?? "");
      const rumorId = String(message.rumorId ?? "").trim();
      if (rumorId) byRumorId.set(rumorId, message);
      parsedByMessage.set(message, {
        bankPaymentOfferInfo: getLinkyBankPaymentOfferInfo(content),
        declineInfo: parseLinkyPaymentRequestDeclineMessage(content),
        isCashuToken: Boolean(getCashuTokenMessageInfo(content)),
        paymentRequestInfo: parseCashuPaymentRequestMessage(content),
        privateImageInfo: parsePrivateImageMessage(content),
      });
    }

    const latestRequestResponseByRumorId = new Map<
      string,
      { respondedAtSec: number; status: "declined" | "paid" }
    >();
    for (const message of chatMessages) {
      const replyToId = String(message.replyToId ?? "").trim();
      const parsed = parsedByMessage.get(message);
      if (!replyToId || !parsed) continue;
      if (!parsed.isCashuToken && !parsed.declineInfo) continue;

      const createdAtSec = Number(message.createdAtSec ?? 0) || 0;
      const previous = latestRequestResponseByRumorId.get(replyToId);
      if (previous && previous.respondedAtSec > createdAtSec) continue;
      latestRequestResponseByRumorId.set(replyToId, {
        respondedAtSec: createdAtSec,
        status: parsed.isCashuToken ? "paid" : "declined",
      });
    }

    const offersById = buildBankPaymentOfferIndex(bankPaymentOfferMessages);

    return chatMessages.map((message, index) => {
      const parsed = parsedByMessage.get(message) ?? {
        bankPaymentOfferInfo: null,
        declineInfo: null,
        isCashuToken: false,
        paymentRequestInfo: null,
        privateImageInfo: null,
      };
      const rumorId = String(message.rumorId ?? "").trim();
      const paymentRequestStatus = rumorId
        ? (latestRequestResponseByRumorId.get(rumorId)?.status ?? "requested")
        : "requested";
      const replyToId = String(message.replyToId ?? "").trim();
      const fallbackReplyContent =
        String(message.replyToContent ?? "").trim() || null;
      const repliedMessage = replyToId ? byRumorId.get(replyToId) : null;
      const replyQuoteText = replyToId
        ? formatChatMessagePreviewText({
            content: repliedMessage?.content ?? fallbackReplyContent ?? "",
            direction: repliedMessage?.direction ?? null,
            formatDisplayedAmountText,
            t,
          })
        : fallbackReplyContent
          ? formatChatMessagePreviewText({
              content: fallbackReplyContent,
              formatDisplayedAmountText,
              t,
            })
          : null;
      const bankPaymentOfferPeerNotice = getBankPaymentOfferPeerNotice(
        message,
        parsed.bankPaymentOfferInfo,
        offersById,
      );

      return {
        ...parsed,
        bankPaymentOfferPeerNotice,
        canActOnPaymentRequest:
          Boolean(parsed.paymentRequestInfo) &&
          String(message.direction ?? "") === "in" &&
          paymentRequestStatus === "requested",
        canEdit:
          String(message.direction ?? "") === "out" &&
          Boolean(rumorId) &&
          !parsed.isCashuToken &&
          !parsed.paymentRequestInfo &&
          !parsed.privateImageInfo &&
          !parsed.bankPaymentOfferInfo &&
          !parsed.declineInfo,
        canReplyOrReact: Boolean(rumorId),
        message,
        nextMessage:
          index + 1 < chatMessages.length ? chatMessages[index + 1] : null,
        onDeclinePaymentRequest: () => {
          void onDeclinePaymentRequest(message);
        },
        onOpenBankPaymentOfferDetails: () => {
          const offerId = String(
            parsed.bankPaymentOfferInfo?.offerId ?? "",
          ).trim();
          const chatId = String(message.contactId ?? selectedContactId).trim();
          if (!offerId || !chatId) return;
          setLinkyBankPaymentOfferMinimized(chatId, offerId, false);
          navigateTo({ route: "bankPaymentOffer", chatId, offerId });
        },
        onPayPaymentRequest: (requestInfo) => {
          void onPayPaymentRequest(message, requestInfo);
        },
        payPaymentRequestDisabled:
          !parsed.paymentRequestInfo ||
          cashuIsBusy ||
          parsed.paymentRequestInfo.amount > cashuBalanceAfterMelt,
        paymentRequestStatus: parsed.paymentRequestInfo
          ? paymentRequestStatus
          : null,
        previousMessage: index > 0 ? chatMessages[index - 1] : null,
        reactions: rumorId
          ? aggregateReactions(
              reactionsByMessageId.get(rumorId) ?? [],
              chatOwnPubkeyHex,
            )
          : [],
        replyQuoteText,
      };
    });
  }, [
    bankPaymentOfferMessages,
    cashuBalanceAfterMelt,
    cashuIsBusy,
    chatMessages,
    chatOwnPubkeyHex,
    formatDisplayedAmountText,
    getCashuTokenMessageInfo,
    onDeclinePaymentRequest,
    onPayPaymentRequest,
    reactionsByMessageId,
    selectedContactId,
    t,
  ]);

  return (
    <div
      className="chat-messages"
      role="log"
      aria-live="polite"
      ref={chatMessagesRef}
    >
      {viewModels.length === 0 ? (
        <p className="muted">{t("chatEmpty")}</p>
      ) : (
        viewModels.map((viewModel) => (
          <ChatMessage
            key={String(viewModel.message.id)}
            message={viewModel.message}
            previousMessage={viewModel.previousMessage}
            nextMessage={viewModel.nextMessage}
            locale={locale}
            formatChatDayLabel={formatChatDayLabelForLang}
            getCashuTokenMessageInfo={getCashuTokenMessageInfo}
            getMintIconUrl={getMintIconUrl}
            getNpubMessageContactInfo={getNpubMessageContactInfo}
            onMintIconLoad={onMintIconLoad}
            onMintIconError={onMintIconError}
            actionLabels={actionLabels}
            canEdit={viewModel.canEdit}
            canReplyOrReact={viewModel.canReplyOrReact}
            reactions={viewModel.reactions}
            paymentRequestInfo={viewModel.paymentRequestInfo}
            paymentRequestStatus={viewModel.paymentRequestStatus}
            declineInfo={viewModel.declineInfo}
            bankPaymentOfferInfo={viewModel.bankPaymentOfferInfo}
            bankPaymentOfferPeerNotice={viewModel.bankPaymentOfferPeerNotice}
            canOpenBankPaymentOfferDetails={canOpenBankPaymentOfferDetails}
            onOpenBankPaymentOfferDetails={
              viewModel.onOpenBankPaymentOfferDetails
            }
            onDeclinePaymentRequest={viewModel.onDeclinePaymentRequest}
            onPayPaymentRequest={viewModel.onPayPaymentRequest}
            canActOnPaymentRequest={viewModel.canActOnPaymentRequest}
            payPaymentRequestDisabled={viewModel.payPaymentRequestDisabled}
            payPaymentRequestBusy={cashuIsBusy}
            replyQuoteText={viewModel.replyQuoteText}
            onCopy={onCopy}
            onAddNpubContacts={onAddNpubContacts}
            onEdit={onEdit}
            onOpenNpubContact={onOpenNpubContact}
            onReact={onReact}
            onReply={onReply}
            chatPendingLabel={chatPendingLabel}
            messageElRef={messageElRef}
          />
        ))
      )}
    </div>
  );
});

interface ChatComposerProps {
  canPayThisContact: boolean;
  canRequestThisContact: boolean;
  canStartPay: boolean;
  cashuIsBusy: boolean;
  chatDraft: string;
  chatSendIsBusy: boolean;
  composeContainerRef: React.RefObject<HTMLDivElement | null>;
  composeInputRef: React.RefObject<HTMLDivElement | null>;
  editContext: EditChatContext | null;
  getCashuTokenMessageInfo: ChatPageProps["getCashuTokenMessageInfo"];
  getMintIconUrl: ChatPageProps["getMintIconUrl"];
  getNpubMessageContactInfo: ChatPageProps["getNpubMessageContactInfo"];
  hasUnknownPubkeyHex: boolean;
  isFeedbackContact: boolean;
  mentionContacts: MessageMentionContact[];
  npub: string | null;
  onCancelEdit: ChatPageProps["onCancelEdit"];
  onCancelReply: ChatPageProps["onCancelReply"];
  openContactPay: ChatPageProps["openContactPay"];
  replyContext: ReplyContext | null;
  replyPreviewText: string;
  selectedContact: Contact;
  sendChatImage: ChatPageProps["sendChatImage"];
  sendChatMessage: ChatPageProps["sendChatMessage"];
  setChatDraft: ChatPageProps["setChatDraft"];
  t: ChatPageProps["t"];
}

const ChatComposer = memo(function ChatComposer({
  canPayThisContact,
  canRequestThisContact,
  canStartPay,
  cashuIsBusy,
  chatDraft,
  chatSendIsBusy,
  composeContainerRef,
  composeInputRef,
  editContext,
  getCashuTokenMessageInfo,
  getMintIconUrl,
  getNpubMessageContactInfo,
  hasUnknownPubkeyHex,
  isFeedbackContact,
  mentionContacts,
  npub,
  onCancelEdit,
  onCancelReply,
  openContactPay,
  replyContext,
  replyPreviewText,
  selectedContact,
  sendChatImage,
  sendChatMessage,
  setChatDraft,
  t,
}: ChatComposerProps) {
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const pendingSendDraftRef = useRef<string | null>(null);
  const [draft, setDraft] = useState(chatDraft);
  const draftRef = useRef(draft);
  const [composeCaret, setComposeCaret] = useState(chatDraft.length);
  const isDesktop =
    typeof window !== "undefined" &&
    window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  const mentionQuery = useMemo(
    () => getMessageMentionQuery(draft, composeCaret),
    [composeCaret, draft],
  );
  const mentionSuggestions = useMemo(
    () =>
      mentionQuery
        ? getMessageMentionSuggestions(
            mentionContacts,
            mentionQuery.query,
            npub,
          )
        : [],
    [mentionContacts, mentionQuery, npub],
  );
  const hasDraftText = Boolean(draft.trim());
  const canSendChat = Boolean(
    !chatSendIsBusy && hasDraftText && (npub || hasUnknownPubkeyHex),
  );
  const canSendImage = Boolean(
    !chatSendIsBusy && !editContext && (npub || hasUnknownPubkeyHex),
  );

  useEffect(() => {
    setDraft(chatDraft);
    setComposeCaret(chatDraft.length);
  }, [chatDraft]);

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  useEffect(
    () => () => {
      setChatDraft(draftRef.current);
    },
    [setChatDraft],
  );

  useEffect(() => {
    if (pendingSendDraftRef.current !== chatDraft) return;
    pendingSendDraftRef.current = null;
    void sendChatMessage();
  }, [chatDraft, sendChatMessage]);

  const focusComposeInput = useCallback(() => {
    const input = composeInputRef.current;
    if (!input || input.getAttribute("aria-disabled") === "true") return false;

    try {
      input.focus({ preventScroll: true });
    } catch {
      input.focus();
    }

    setMessageEditorCaret(input, getMessageEditorValue(input).length);
    return document.activeElement === input;
  }, [composeInputRef]);

  const requestSend = useCallback(() => {
    if (!canSendChat) return;
    if (draft === chatDraft) {
      void sendChatMessage();
      return;
    }

    pendingSendDraftRef.current = draft;
    setChatDraft(draft);
  }, [canSendChat, chatDraft, draft, sendChatMessage, setChatDraft]);

  const selectMentionSuggestion = useCallback(
    (suggestion: MessageMentionSuggestion) => {
      if (!mentionQuery) return;
      const next = applyMessageMentionSuggestion(
        draft,
        mentionQuery,
        suggestion,
      );
      setDraft(next.value);
      setComposeCaret(next.caret);
      window.requestAnimationFrame(() => {
        const input = composeInputRef.current;
        if (!input) return;
        input.focus();
        setMessageEditorCaret(input, next.caret);
      });
    },
    [composeInputRef, draft, mentionQuery],
  );

  useEffect(() => {
    if (!replyContext && !editContext) return;
    if (!npub && !hasUnknownPubkeyHex) return;
    focusComposeInput();
  }, [editContext, focusComposeInput, hasUnknownPubkeyHex, npub, replyContext]);

  return (
    <div className="chat-compose" ref={composeContainerRef}>
      {replyContext && (
        <ReplyPreview
          label={t("chatReplyingTo")}
          body={replyPreviewText || t("chatReplyUnavailable")}
          onCancel={onCancelReply}
        />
      )}
      {editContext && (
        <ReplyPreview
          label={t("chatEditing")}
          body={editContext.originalContent || t("chatEmpty")}
          onCancel={onCancelEdit}
        />
      )}
      {mentionSuggestions.length > 0 ? (
        <div className="chat-mention-suggestions" role="listbox">
          {mentionSuggestions.map((suggestion) => {
            if (suggestion.kind === "group") {
              return (
                <button
                  key={`group-${suggestion.groupName}`}
                  type="button"
                  className="chat-mention-suggestion"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => selectMentionSuggestion(suggestion)}
                >
                  <span className="chat-mention-suggestion-label">
                    @{suggestion.groupName}
                  </span>
                  <span className="muted">
                    {t("chatMentionGroupCount").replace(
                      "{count}",
                      String(suggestion.contacts.length),
                    )}
                  </span>
                </button>
              );
            }

            const info = getNpubMessageContactInfo(suggestion.contact.npub);
            return (
              <button
                key={`contact-${suggestion.contact.npub}`}
                type="button"
                className="chat-mention-suggestion"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => selectMentionSuggestion(suggestion)}
              >
                <span className="chat-contact-pill-avatar" aria-hidden="true">
                  {info?.pictureUrl ? (
                    <img
                      src={info.pictureUrl}
                      alt=""
                      loading="lazy"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <span className="chat-contact-pill-avatar-fallback">
                      {suggestion.contact.name.charAt(0)}
                    </span>
                  )}
                </span>
                <span className="chat-mention-suggestion-label">
                  {suggestion.contact.name}
                </span>
                {suggestion.contact.groupName ? (
                  <span className="muted">{suggestion.contact.groupName}</span>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}
      <div className="chat-compose-input-wrap">
        <input
          ref={imageInputRef}
          className="chat-image-input"
          type="file"
          accept="image/*"
          onChange={(event) => {
            const file = event.target.files?.[0] ?? null;
            event.currentTarget.value = "";
            if (!file) return;
            void sendChatImage(file);
          }}
          tabIndex={-1}
        />
        <ChatMessageEditor
          ref={composeInputRef}
          value={draft}
          onChange={setDraft}
          onCaretChange={setComposeCaret}
          onSendShortcut={() => {
            if (isDesktop) requestSend();
          }}
          placeholder={t("chatPlaceholder")}
          removeContactLabel={t("chatRemoveContactFromDraft")}
          disabled={!npub && !hasUnknownPubkeyHex}
          getCashuTokenMessageInfo={getCashuTokenMessageInfo}
          getMintIconUrl={getMintIconUrl}
          getNpubMessageContactInfo={getNpubMessageContactInfo}
        />
        {!hasDraftText ? (
          <button
            type="button"
            className="chat-compose-image-button"
            onClick={() => imageInputRef.current?.click()}
            disabled={!canSendImage}
            aria-label={t("chatImageAttach")}
            title={t("chatImageAttach")}
          >
            <span className="chat-compose-send-icon" aria-hidden="true">
              <GalleryIcon size={18} />
            </span>
          </button>
        ) : null}
        {hasDraftText ? (
          <button
            type="button"
            className="chat-compose-send-button"
            onClick={() => {
              requestSend();
              focusComposeInput();
            }}
            disabled={!canSendChat}
            aria-label={editContext ? t("chatSaveAction") : t("send")}
            title={editContext ? t("chatSaveAction") : t("send")}
            data-guide="chat-send"
          >
            <span className="chat-compose-send-icon" aria-hidden="true">
              <SendIcon size={18} />
            </span>
          </button>
        ) : null}
      </div>
      {canPayThisContact && (
        <div className="chat-compose-payment-actions">
          {canRequestThisContact && (
            <button
              className="btn-wide secondary chat-pay-button"
              onClick={() =>
                openContactPay(selectedContact.id, true, "request")
              }
              disabled={cashuIsBusy}
              data-guide="chat-request"
            >
              <span className="btn-label-with-icon">
                <span className="btn-label-icon" aria-hidden="true">
                  <RequestIcon size={18} />
                </span>
                <span>{t("requestPayment")}</span>
              </span>
            </button>
          )}
          <button
            className="btn-wide secondary chat-pay-button"
            onClick={() => openContactPay(selectedContact.id, true)}
            disabled={cashuIsBusy || !canStartPay}
            title={!canStartPay ? t("payInsufficient") : undefined}
            data-guide="chat-pay"
          >
            <span className="btn-label-with-icon">
              <span className="btn-label-icon" aria-hidden="true">
                {isFeedbackContact ? (
                  <DonateIcon size={18} />
                ) : (
                  <PayIcon size={18} />
                )}
              </span>
              <span>{isFeedbackContact ? t("donate") : t("pay")}</span>
            </span>
          </button>
        </div>
      )}
    </div>
  );
});

const useChatViewport = (
  chatMessagesRef: React.RefObject<HTMLDivElement | null>,
  composeInputRef: React.RefObject<HTMLDivElement | null>,
  selectedContactId: string | null,
) => {
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (typeof window === "undefined") return;
    if (!selectedContactId) return;

    const root = document.documentElement;
    const body = document.body;
    const pendingRefreshTimeouts = new Set<number>();
    let pendingViewportAnchor: ChatViewportAnchor | null = null;
    let pendingViewportAnchorFrame: number | null = null;
    let appliedViewportHeight: number | null = null;
    const getWindowScrollTop = () =>
      Math.max(
        window.scrollY,
        window.pageYOffset,
        document.documentElement.scrollTop,
        document.body.scrollTop,
      );
    const previousHtmlOverflow = root.style.overflow;
    const previousBodyOverflow = body.style.overflow;
    root.style.overflow = "hidden";
    body.style.overflow = "hidden";

    const updateViewportHeight = () => {
      // iOS can pan the document after focusin has already fired, especially
      // when reopening the keyboard. The chat owns its scrolling, so keep the
      // document itself pinned before applying visual viewport measurements.
      if (getWindowScrollTop() > 1) {
        window.scrollTo(0, 0);
      }
      const viewport = window.visualViewport;
      const nextHeight = viewport?.height ?? window.innerHeight;
      const nextOffsetTop = viewport?.offsetTop ?? 0;
      const visibleHeight = Math.min(
        window.innerHeight,
        Math.max(0, nextHeight + nextOffsetTop),
      );
      const viewportKeyboardInset = Math.max(
        0,
        window.innerHeight - visibleHeight,
      );
      const nativeKeyboardInset = Number.parseFloat(
        getComputedStyle(root).getPropertyValue("--native-keyboard-inset"),
      );
      const keyboardInset = Math.max(
        viewportKeyboardInset,
        Number.isFinite(nativeKeyboardInset) ? nativeKeyboardInset : 0,
      );
      const viewportHeight = Math.round(window.innerHeight - keyboardInset);
      const viewportHeightChanged = appliedViewportHeight !== viewportHeight;

      if (viewportHeightChanged) {
        pendingViewportAnchor ??= captureChatViewportAnchor(
          chatMessagesRef.current,
        );
      }
      root.style.setProperty("--chat-viewport-height", `${viewportHeight}px`);
      root.style.setProperty(
        "--chat-keyboard-inset",
        `${Math.round(keyboardInset)}px`,
      );
      if (keyboardInset > 0) {
        root.dataset.chatKeyboardOpen = "true";
      } else {
        delete root.dataset.chatKeyboardOpen;
      }

      appliedViewportHeight = viewportHeight;
      if (!viewportHeightChanged) return;

      if (pendingViewportAnchorFrame !== null) {
        window.cancelAnimationFrame(pendingViewportAnchorFrame);
      }
      pendingViewportAnchorFrame = window.requestAnimationFrame(() => {
        pendingViewportAnchorFrame = null;
        restoreChatViewportAnchor(
          chatMessagesRef.current,
          pendingViewportAnchor,
        );
        pendingViewportAnchor = null;
      });
    };

    const scheduleViewportRefresh = () => {
      updateViewportHeight();
      requestAnimationFrame(updateViewportHeight);

      for (const delayMs of [120, 280]) {
        const timeoutId = window.setTimeout(() => {
          pendingRefreshTimeouts.delete(timeoutId);
          updateViewportHeight();
        }, delayMs);
        pendingRefreshTimeouts.add(timeoutId);
      }
    };

    const handleComposeFocusChange = (event: FocusEvent) => {
      const input = composeInputRef.current;
      if (!input || event.target !== input) return;
      scheduleViewportRefresh();
    };

    updateViewportHeight();

    const viewport = window.visualViewport;
    window.addEventListener("resize", updateViewportHeight);
    window.addEventListener("linky-native-window-insets", updateViewportHeight);
    document.addEventListener("focusin", handleComposeFocusChange);
    document.addEventListener("focusout", handleComposeFocusChange);
    viewport?.addEventListener("resize", updateViewportHeight);
    viewport?.addEventListener("scroll", updateViewportHeight);

    return () => {
      window.removeEventListener("resize", updateViewportHeight);
      window.removeEventListener(
        "linky-native-window-insets",
        updateViewportHeight,
      );
      document.removeEventListener("focusin", handleComposeFocusChange);
      document.removeEventListener("focusout", handleComposeFocusChange);
      viewport?.removeEventListener("resize", updateViewportHeight);
      viewport?.removeEventListener("scroll", updateViewportHeight);
      for (const timeoutId of pendingRefreshTimeouts) {
        window.clearTimeout(timeoutId);
      }
      if (pendingViewportAnchorFrame !== null) {
        window.cancelAnimationFrame(pendingViewportAnchorFrame);
      }
      root.style.overflow = previousHtmlOverflow;
      body.style.overflow = previousBodyOverflow;
      root.style.removeProperty("--chat-viewport-height");
      root.style.removeProperty("--chat-keyboard-inset");
      delete root.dataset.chatKeyboardOpen;
    };
  }, [chatMessagesRef, composeInputRef, selectedContactId]);
};

const useChatComposeHeight = (
  composeContainerRef: React.RefObject<HTMLDivElement | null>,
  selectedContactId: string | null,
) => {
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (typeof window === "undefined") return;

    const root = document.documentElement;
    const compose = composeContainerRef.current;
    if (!compose) return;

    const updateComposeHeight = () => {
      root.style.setProperty(
        "--chat-compose-height",
        `${Math.round(compose.getBoundingClientRect().height)}px`,
      );
    };

    updateComposeHeight();
    window.addEventListener("resize", updateComposeHeight);

    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(updateComposeHeight);
    observer?.observe(compose);

    return () => {
      window.removeEventListener("resize", updateComposeHeight);
      observer?.disconnect();
      root.style.removeProperty("--chat-compose-height");
    };
  }, [composeContainerRef, selectedContactId]);
};

interface UnknownContactWarningProps {
  onAdd: () => Promise<void>;
  onBlock: () => Promise<void>;
  t: ChatPageProps["t"];
}

const UnknownContactWarning = memo(function UnknownContactWarning({
  onAdd,
  onBlock,
  t,
}: UnknownContactWarningProps) {
  return (
    <div className="chat-unknown-warning">
      <p>{t("chatUnknownContactWarning")}</p>
      <div className="chat-unknown-warning-actions">
        <button
          className="btn-wide chat-unknown-primary"
          type="button"
          onClick={() => void onAdd()}
        >
          {t("addContact")}
        </button>
        <button
          className="btn-wide secondary"
          type="button"
          onClick={() => void onBlock()}
        >
          {t("blockContact")}
        </button>
      </div>
    </div>
  );
});

export const ChatPage: FC<ChatPageProps> = ({
  cashuBalance,
  cashuBalanceAfterMelt,
  cashuIsBusy,
  chatDraft,
  chatMessageElByIdRef,
  chatMessages,
  bankPaymentOfferMessages,
  chatMessagesRef,
  chatOwnPubkeyHex,
  chatSendIsBusy,
  editContext,
  feedbackContactNpub,
  getCashuTokenMessageInfo,
  getMintIconUrl,
  getNpubMessageContactInfo,
  lang,
  mentionContacts,
  onCancelEdit,
  onCancelReply,
  onAddUnknownContact,
  onAddNpubContacts,
  onBlockUnknownContact,
  onCopy,
  onDeclinePaymentRequest,
  onEdit,
  onOpenNpubContact,
  onPayPaymentRequest,
  onReact,
  onReply,
  openContactPay,
  payWithCashuEnabled,
  reactionsByMessageId,
  replyContext,
  selectedContact,
  sendChatImage,
  sendChatMessage,
  setChatDraft,
  setMintIconUrlByMint,
  t,
}) => {
  const { formatDisplayedAmountText } = useAppShellCore();
  const composeInputRef = useRef<HTMLDivElement | null>(null);
  const composeContainerRef = useRef<HTMLDivElement | null>(null);
  const npub = selectedContact
    ? normalizeNpubIdentifier(selectedContact.npub)
    : null;
  const selectedContactId = selectedContact?.id ?? null;
  const hasUnknownPubkeyHex = Boolean(
    String(selectedContact?.unknownPubkeyHex ?? "").trim(),
  );

  useChatViewport(chatMessagesRef, composeInputRef, selectedContactId);
  useChatComposeHeight(composeContainerRef, selectedContactId);

  useEffect(() => {
    if (selectedContact?.isUnknownContact) return;

    const chatId = String(selectedContact?.id ?? "").trim();
    if (!chatId) return;

    const nowSec = Math.floor(Date.now() / 1_000);
    let newestOffer: { offerId: string; updatedAtSec: number } | null = null;

    for (const message of bankPaymentOfferMessages) {
      if (String(message.contactId ?? "").trim() !== chatId) continue;
      if (String(message.direction ?? "") !== "in") continue;

      const info = getLinkyBankPaymentOfferInfo(String(message.content ?? ""));
      if (!info || info.status !== "offered") continue;
      if (
        isLinkyBankPaymentOfferExpired(
          info,
          Number(message.createdAtSec ?? 0),
          nowSec,
        )
      ) {
        continue;
      }
      if (isLinkyBankPaymentOfferMinimized(chatId, info.offerId)) continue;

      const updatedAtSec =
        info.statusUpdatedAtSec ?? Number(message.createdAtSec ?? 0);
      if (!newestOffer || updatedAtSec > newestOffer.updatedAtSec) {
        newestOffer = { offerId: info.offerId, updatedAtSec };
      }
    }

    if (newestOffer) {
      navigateTo({
        route: "bankPaymentOffer",
        chatId,
        offerId: newestOffer.offerId,
      });
    }
  }, [
    bankPaymentOfferMessages,
    selectedContact?.id,
    selectedContact?.isUnknownContact,
  ]);

  const replyPreviewText = useMemo(() => {
    if (replyContext?.replyToContent) {
      return formatChatMessagePreviewText({
        content: replyContext.replyToContent,
        formatDisplayedAmountText,
        t,
      });
    }
    if (!replyContext?.replyToId) return "";

    const repliedMessage = chatMessages.find(
      (message) =>
        String(message.rumorId ?? "").trim() === replyContext.replyToId,
    );
    return formatChatMessagePreviewText({
      content: repliedMessage?.content ?? "",
      direction: repliedMessage?.direction ?? null,
      formatDisplayedAmountText,
      t,
    });
  }, [chatMessages, formatDisplayedAmountText, replyContext, t]);

  if (!selectedContact) {
    return (
      <section className="panel">
        <p className="muted">{t("contactNotFound")}</p>
      </section>
    );
  }

  const ln = String(selectedContact.lnAddress ?? "").trim();
  const isUnknownContact = Boolean(selectedContact.isUnknownContact);
  const canPayThisContact =
    !isUnknownContact &&
    (Boolean(ln) || (payWithCashuEnabled && Boolean(npub)));
  const canStartPay =
    (Boolean(ln) && cashuBalance > 0) || (Boolean(npub) && cashuBalance > 0);
  const canRequestThisContact =
    !isUnknownContact && Boolean(npub || hasUnknownPubkeyHex);
  const isFeedbackContact = npub === feedbackContactNpub;

  return (
    <section className="panel chat-panel">
      {isUnknownContact ? (
        <UnknownContactWarning
          onAdd={onAddUnknownContact}
          onBlock={onBlockUnknownContact}
          t={t}
        />
      ) : null}

      {!npub && !hasUnknownPubkeyHex && (
        <p className="muted">{t("chatMissingContactNpub")}</p>
      )}

      <ChatMessageList
        bankPaymentOfferMessages={bankPaymentOfferMessages}
        canOpenBankPaymentOfferDetails={!isUnknownContact}
        cashuBalanceAfterMelt={cashuBalanceAfterMelt}
        cashuIsBusy={cashuIsBusy}
        chatMessageElByIdRef={chatMessageElByIdRef}
        chatMessages={chatMessages}
        chatMessagesRef={chatMessagesRef}
        chatOwnPubkeyHex={chatOwnPubkeyHex}
        formatDisplayedAmountText={formatDisplayedAmountText}
        getCashuTokenMessageInfo={getCashuTokenMessageInfo}
        getMintIconUrl={getMintIconUrl}
        getNpubMessageContactInfo={getNpubMessageContactInfo}
        lang={lang}
        onCopy={onCopy}
        onAddNpubContacts={onAddNpubContacts}
        onDeclinePaymentRequest={onDeclinePaymentRequest}
        onEdit={onEdit}
        onOpenNpubContact={onOpenNpubContact}
        onPayPaymentRequest={onPayPaymentRequest}
        onReact={onReact}
        onReply={onReply}
        reactionsByMessageId={reactionsByMessageId}
        selectedContactId={selectedContact.id}
        setMintIconUrlByMint={setMintIconUrlByMint}
        t={t}
      />

      <ChatComposer
        canPayThisContact={canPayThisContact}
        canRequestThisContact={canRequestThisContact}
        canStartPay={canStartPay}
        cashuIsBusy={cashuIsBusy}
        chatDraft={chatDraft}
        chatSendIsBusy={chatSendIsBusy}
        composeContainerRef={composeContainerRef}
        composeInputRef={composeInputRef}
        editContext={editContext}
        getCashuTokenMessageInfo={getCashuTokenMessageInfo}
        getMintIconUrl={getMintIconUrl}
        getNpubMessageContactInfo={getNpubMessageContactInfo}
        hasUnknownPubkeyHex={hasUnknownPubkeyHex}
        isFeedbackContact={isFeedbackContact}
        mentionContacts={mentionContacts}
        npub={npub}
        onCancelEdit={onCancelEdit}
        onCancelReply={onCancelReply}
        openContactPay={openContactPay}
        replyContext={replyContext}
        replyPreviewText={replyPreviewText}
        selectedContact={selectedContact}
        sendChatImage={sendChatImage}
        sendChatMessage={sendChatMessage}
        setChatDraft={setChatDraft}
        t={t}
      />
    </section>
  );
};
