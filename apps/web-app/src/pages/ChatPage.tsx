import { type FC, useEffect, useRef } from "react";
import { aggregateReactions } from "../app/hooks/messages/chatNostrProtocol";
import type { EditChatContext } from "../app/hooks/messages/useEditChatMessage";
import type { ReplyContext } from "../app/hooks/messages/useSendChatMessage";
import type { CashuTokenMessageInfo } from "../app/lib/tokenMessageInfo";
import type {
  LocalNostrMessage,
  LocalNostrReaction,
  MintUrlInput,
} from "../app/types/appTypes";
import { ChatMessage } from "../components/ChatMessage";
import { ReplyPreview } from "../components/ReplyPreview";
import { formatChatDayLabel, formatInteger } from "../utils/formatting";
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
  cashuIsBusy: boolean;
  chatDraft: string;
  chatMessageElByIdRef: React.MutableRefObject<Map<string, HTMLDivElement>>;
  chatMessages: LocalNostrMessage[];
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
  lang: string;
  onCancelEdit: () => void;
  onCancelReply: () => void;
  onAddUnknownContact: () => Promise<void>;
  onBlockUnknownContact: () => Promise<void>;
  onCopy: (message: LocalNostrMessage) => void;
  onEdit: (message: LocalNostrMessage) => void;
  onReact: (message: LocalNostrMessage, emoji: string) => void;
  onReply: (message: LocalNostrMessage) => void;
  openContactPay: (id: string, returnToChat?: boolean) => void;
  payWithCashuEnabled: boolean;
  reactionsByMessageId: Map<string, LocalNostrReaction[]>;
  replyContext: ReplyContext | null;
  selectedContact: Contact | null;
  sendChatMessage: () => Promise<void>;
  setChatDraft: (value: string) => void;
  setMintIconUrlByMint: React.Dispatch<
    React.SetStateAction<Record<string, string | null>>
  >;
  t: (key: string) => string;
}

export const ChatPage: FC<ChatPageProps> = ({
  cashuBalance,
  cashuIsBusy,
  chatDraft,
  chatMessageElByIdRef,
  chatMessages,
  chatMessagesRef,
  chatOwnPubkeyHex,
  chatSendIsBusy,
  editContext,
  feedbackContactNpub,
  getCashuTokenMessageInfo,
  getMintIconUrl,
  lang,
  onCancelEdit,
  onCancelReply,
  onAddUnknownContact,
  onBlockUnknownContact,
  onCopy,
  onEdit,
  onReact,
  onReply,
  openContactPay,
  payWithCashuEnabled,
  reactionsByMessageId,
  replyContext,
  selectedContact,
  sendChatMessage,
  setChatDraft,
  setMintIconUrlByMint,
  t,
}) => {
  const composeInputRef = useRef<HTMLTextAreaElement | null>(null);
  const npub = selectedContact
    ? normalizeNpubIdentifier(selectedContact.npub)
    : null;
  const hasUnknownPubkeyHex = Boolean(
    String(selectedContact?.unknownPubkeyHex ?? "").trim(),
  );
  const isDesktop =
    typeof window !== "undefined" &&
    window.matchMedia("(hover: hover) and (pointer: fine)").matches;

  useEffect(() => {
    if (!replyContext && !editContext) return;
    if (chatSendIsBusy || (!npub && !hasUnknownPubkeyHex)) return;
    const input = composeInputRef.current;
    if (!input) return;
    input.focus();
    const length = input.value.length;
    input.setSelectionRange(length, length);
  }, [replyContext, editContext, chatSendIsBusy, hasUnknownPubkeyHex, npub]);

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
  const isFeedbackContact = npub === feedbackContactNpub;

  const byRumorId = new Map<string, LocalNostrMessage>();
  for (const message of chatMessages) {
    const rumorId = String(message.rumorId ?? "").trim();
    if (!rumorId) continue;
    byRumorId.set(rumorId, message);
  }

  const replyPreviewText = replyContext?.replyToContent
    ? replyContext.replyToContent
    : replyContext?.replyToId
      ? (byRumorId.get(replyContext.replyToId)?.content ?? "")
      : "";
  const hasDraftText = Boolean(chatDraft.trim());

  const canSendChat = Boolean(
    !chatSendIsBusy && hasDraftText && (npub || hasUnknownPubkeyHex),
  );

  return (
    <section className="panel chat-panel">
      {isUnknownContact ? (
        <div className="chat-unknown-warning">
          <p>{t("chatUnknownContactWarning")}</p>
          <div className="chat-unknown-warning-actions">
            <button
              className="btn-wide secondary"
              type="button"
              onClick={() => {
                void onAddUnknownContact();
              }}
            >
              {t("addContact")}
            </button>
            <button
              className="btn-wide secondary danger"
              type="button"
              onClick={() => {
                void onBlockUnknownContact();
              }}
            >
              {t("blockContact")}
            </button>
          </div>
        </div>
      ) : null}

      {!npub && !hasUnknownPubkeyHex && (
        <p className="muted">{t("chatMissingContactNpub")}</p>
      )}

      <div
        className="chat-messages"
        role="log"
        aria-live="polite"
        ref={chatMessagesRef}
      >
        {chatMessages.length === 0 ? (
          <p className="muted">{t("chatEmpty")}</p>
        ) : (
          chatMessages.map((message, idx) => {
            const prev = idx > 0 ? chatMessages[idx - 1] : null;
            const next =
              idx + 1 < chatMessages.length ? chatMessages[idx + 1] : null;
            const formatChatDayLabelForLang = (timestamp: number) =>
              formatChatDayLabel(timestamp, lang, t);

            const rumorId = String(message.rumorId ?? "").trim();
            const reactions = rumorId
              ? aggregateReactions(
                  reactionsByMessageId.get(rumorId) ?? [],
                  chatOwnPubkeyHex,
                )
              : [];
            const replyToId = String(message.replyToId ?? "").trim();
            const fallbackReplyContent =
              String(message.replyToContent ?? "").trim() || null;
            const replyQuoteText = replyToId
              ? (byRumorId.get(replyToId)?.content ?? fallbackReplyContent)
              : fallbackReplyContent;
            const isOwnTextMessage =
              String(message.direction ?? "") === "out" &&
              Boolean(String(message.rumorId ?? "").trim()) &&
              !getCashuTokenMessageInfo(String(message.content ?? ""));

            return (
              <ChatMessage
                key={String(message.id)}
                message={message}
                previousMessage={prev}
                nextMessage={next}
                locale={lang === "cs" ? "cs-CZ" : "en-US"}
                formatInteger={formatInteger}
                formatChatDayLabel={formatChatDayLabelForLang}
                getCashuTokenMessageInfo={getCashuTokenMessageInfo}
                getMintIconUrl={getMintIconUrl}
                onMintIconLoad={(origin, url) => {
                  setMintIconUrlByMint((prevByMint) => ({
                    ...prevByMint,
                    [origin]: url,
                  }));
                }}
                onMintIconError={(origin, nextUrl) => {
                  setMintIconUrlByMint((prevByMint) => ({
                    ...prevByMint,
                    [origin]: nextUrl,
                  }));
                }}
                actionLabels={{
                  copy: t("copy"),
                  edit: t("chatEditAction"),
                  edited: t("chatEdited"),
                  react: t("chatReactAction"),
                  reply: t("chatReplyAction"),
                }}
                canEdit={isOwnTextMessage}
                canReplyOrReact={Boolean(rumorId)}
                reactions={reactions}
                replyQuoteText={replyQuoteText}
                onCopy={onCopy}
                onEdit={onEdit}
                onReact={onReact}
                onReply={onReply}
                chatPendingLabel={t("chatPendingShort")}
                messageElRef={(el, messageId) => {
                  const map = chatMessageElByIdRef.current;
                  if (el) map.set(messageId, el);
                  else map.delete(messageId);
                }}
              />
            );
          })
        )}
      </div>

      <div className="chat-compose">
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
        <div className="chat-compose-input-wrap">
          <textarea
            ref={composeInputRef}
            value={chatDraft}
            onChange={(e) => setChatDraft(e.target.value)}
            onKeyDown={(e) => {
              if (!isDesktop) return;
              if (e.key !== "Enter" || !e.metaKey) return;
              if (!canSendChat) return;
              e.preventDefault();
              void sendChatMessage();
            }}
            placeholder={t("chatPlaceholder")}
            disabled={chatSendIsBusy || (!npub && !hasUnknownPubkeyHex)}
            data-guide="chat-input"
          />
          {hasDraftText ? (
            <button
              type="button"
              className="chat-compose-send-button"
              onClick={() => void sendChatMessage()}
              disabled={!canSendChat}
              aria-label={editContext ? t("chatSaveAction") : t("send")}
              title={editContext ? t("chatSaveAction") : t("send")}
              data-guide="chat-send"
            >
              <span className="chat-compose-send-icon" aria-hidden="true">
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M21 3L10 14"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M21 3L14 21L10 14L3 10L21 3Z"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
            </button>
          ) : null}
        </div>
        {canPayThisContact && (
          <button
            className="btn-wide secondary"
            onClick={() => openContactPay(selectedContact.id, true)}
            disabled={cashuIsBusy || !canStartPay}
            title={!canStartPay ? t("payInsufficient") : undefined}
            data-guide="chat-pay"
          >
            <span className="btn-label-with-icon">
              <span className="btn-label-icon" aria-hidden="true">
                ₿
              </span>
              <span>{isFeedbackContact ? "Donate" : t("pay")}</span>
            </span>
          </button>
        )}
      </div>
    </section>
  );
};
