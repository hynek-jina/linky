import type { FC } from "react";
import { ChatMessage } from "../components/ChatMessage";
import type { ContactId } from "../evolu";
import { formatChatDayLabel } from "../utils/formatting";

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
  chatMessages: any[];
  chatMessagesRef: React.RefObject<HTMLDivElement | null>;
  chatSendIsBusy: boolean;
  feedbackContactNpub: string;
  formatInteger: (val: number) => string;
  getCashuTokenMessageInfo: (id: string) => any;
  getCredoAvailableForContact: (npub: string) => number;
  getCredoTokenMessageInfo: (id: string) => any;
  getMintIconUrl: (mint: unknown) => {
    origin: string | null;
    url: string | null;
    host: string | null;
    failed: boolean;
  };
  lang: string;
  nostrPictureByNpub: Record<string, string | null>;
  openContactPay: (id: ContactId, returnToChat?: boolean) => void;
  payWithCashuEnabled: boolean;
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
  chatSendIsBusy,
  feedbackContactNpub,
  formatInteger,
  getCashuTokenMessageInfo,
  getCredoAvailableForContact,
  getCredoTokenMessageInfo,
  getMintIconUrl,
  lang,
  nostrPictureByNpub,
  openContactPay,
  payWithCashuEnabled,
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

  const npub = String(selectedContact.npub ?? "").trim();
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

  return (
    <section className="panel">
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
          chatMessages.map((m, idx) => {
            const prev = idx > 0 ? chatMessages[idx - 1] : null;
            const next =
              idx + 1 < chatMessages.length ? chatMessages[idx + 1] : null;
            const avatar = npub ? nostrPictureByNpub[npub] : null;

            const formatChatDayLabelForLang = (timestamp: number) =>
              formatChatDayLabel(timestamp, lang, t);

            return (
              <ChatMessage
                key={String(m.id)}
                message={m}
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
                  setMintIconUrlByMint((prev) => ({
                    ...prev,
                    [origin]: url,
                  }));
                }}
                onMintIconError={(origin, nextUrl) => {
                  setMintIconUrlByMint((prev) => ({
                    ...prev,
                    [origin]: nextUrl,
                  }));
                }}
                chatPendingLabel={t("chatPendingShort")}
                messageElRef={(el, messageId) => {
                  const map = chatMessageElByIdRef.current;
                  if (el) map.set(messageId, el as HTMLDivElement);
                  else map.delete(messageId);
                }}
              />
            );
          })
        )}
      </div>

      <div className="chat-compose">
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
          {chatSendIsBusy ? `${t("send")}…` : t("send")}
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
