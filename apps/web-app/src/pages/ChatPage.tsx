import type { FC } from "react";
import type { EditChatContext } from "../app/hooks/messages/useEditChatMessage";
import { aggregateReactions } from "../app/hooks/messages/chatNostrProtocol";
import type { ReplyContext } from "../app/hooks/messages/useSendChatMessage";
import type {
  CashuTokenMessageInfo,
  CredoTokenMessageInfo,
} from "../app/lib/tokenMessageInfo";
import type {
  LocalNostrMessage,
  LocalNostrReaction,
  MintUrlInput,
} from "../app/types/appTypes";
import { ChatMessage } from "../components/ChatMessage";
import { ReplyPreview } from "../components/ReplyPreview";
import type { ContactId } from "../evolu";
import { formatChatDayLabel, formatInteger } from "../utils/formatting";
import { normalizeNpubIdentifier } from "../utils/nostrNpub";

interface Contact {
  id: ContactId;
  npub?: string | null;
  lnAddress?: string | null;
}

interface ChatPageProps {
  allowPromisesEnabled: boolean;
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
  getCredoAvailableForContact: (npub: string) => number;
  getCredoTokenMessageInfo: (id: string) => CredoTokenMessageInfo | null;
  getMintIconUrl: (mint: MintUrlInput) => {
    origin: string | null;
    url: string | null;
    host: string | null;
    failed: boolean;
  };
  lang: string;
  nostrPictureByNpub: Record<string, string | null>;
  onCancelEdit: () => void;
  onCancelReply: () => void;
  onCopy: (message: LocalNostrMessage) => void;
  onEdit: (message: LocalNostrMessage) => void;
  onReact: (message: LocalNostrMessage, emoji: string) => void;
  onReply: (message: LocalNostrMessage) => void;
  openContactPay: (id: ContactId, returnToChat?: boolean) => void;
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
  allowPromisesEnabled,
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
  getCredoAvailableForContact,
  getCredoTokenMessageInfo,
  getMintIconUrl,
  lang,
  nostrPictureByNpub,
  onCancelEdit,
  onCancelReply,
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
  if (!selectedContact) {
    return (
      <section className="panel">
        <p className="muted">{t("contactNotFound")}</p>
      </section>
    );
  }

  const npub = normalizeNpubIdentifier(selectedContact.npub);
  const ln = String(selectedContact.lnAddress ?? "").trim();
  const canPayThisContact =
    Boolean(ln) ||
    ((payWithCashuEnabled || allowPromisesEnabled) && Boolean(npub));
  const availableCredo = npub ? getCredoAvailableForContact(npub) : 0;
  const canStartPay =
    (Boolean(ln) && cashuBalance > 0) ||
    (Boolean(npub) &&
      (cashuBalance > 0 || availableCredo > 0 || allowPromisesEnabled));
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

  return (
    <section className="panel chat-panel">
      {!npub && <p className="muted">{t("chatMissingContactNpub")}</p>}

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
            const avatar = npub ? nostrPictureByNpub[npub] : null;
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
              !getCashuTokenMessageInfo(String(message.content ?? "")) &&
              !getCredoTokenMessageInfo(String(message.content ?? ""));

            return (
              <ChatMessage
                key={String(message.id)}
                message={message}
                previousMessage={prev}
                nextMessage={next}
                locale={lang === "cs" ? "cs-CZ" : "en-US"}
                contactAvatar={avatar}
                formatInteger={formatInteger}
                formatChatDayLabel={formatChatDayLabelForLang}
                getCashuTokenMessageInfo={getCashuTokenMessageInfo}
                getCredoTokenMessageInfo={getCredoTokenMessageInfo}
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
        <textarea
          value={chatDraft}
          onChange={(e) => setChatDraft(e.target.value)}
          placeholder={t("chatPlaceholder")}
          disabled={chatSendIsBusy || !npub}
          data-guide="chat-input"
        />
        <button
          className="btn-wide"
          onClick={() => void sendChatMessage()}
          disabled={chatSendIsBusy || !chatDraft.trim() || !npub}
          data-guide="chat-send"
        >
          {chatSendIsBusy
            ? `${editContext ? t("chatSaveAction") : t("send")}…`
            : editContext
              ? t("chatSaveAction")
              : t("send")}
        </button>
        {canPayThisContact && (
          <button
            className="btn-wide secondary"
            onClick={() => openContactPay(selectedContact.id, true)}
            disabled={cashuIsBusy || !canStartPay}
            title={!canStartPay ? t("payInsufficient") : undefined}
            data-guide="chat-pay"
          >
            {isFeedbackContact ? "Donate" : t("pay")}
          </button>
        )}
      </div>
    </section>
  );
};
