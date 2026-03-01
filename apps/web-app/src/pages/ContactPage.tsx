import type { FC } from "react";
import type { ContactId } from "../evolu";
import { useNavigation } from "../hooks/useRouting";
import { getInitials } from "../utils/formatting";
import { normalizeNpubIdentifier } from "../utils/nostrNpub";

interface Contact {
  id: ContactId;
  name?: string | null;
  groupName?: string | null;
  lnAddress?: string | null;
  npub?: string | null;
}

interface ContactPageProps {
  cashuBalance: number;
  cashuIsBusy: boolean;
  feedbackContactNpub: string;
  nostrPictureByNpub: Record<string, string | null>;
  openContactPay: (id: ContactId) => void;
  payWithCashuEnabled: boolean;
  selectedContact: Contact | null;
  t: (key: string) => string;
}

export const ContactPage: FC<ContactPageProps> = ({
  cashuBalance,
  cashuIsBusy,
  feedbackContactNpub,
  nostrPictureByNpub,
  openContactPay,
  payWithCashuEnabled,
  selectedContact,
  t,
}) => {
  const navigateTo = useNavigation();
  if (!selectedContact) {
    return (
      <section className="panel">
        <p className="muted">{t("contactNotFound")}</p>
      </section>
    );
  }

  const npub = normalizeNpubIdentifier(selectedContact.npub);
  const url = npub ? nostrPictureByNpub[npub] : null;
  const ln = String(selectedContact.lnAddress ?? "").trim();
  const group = String(selectedContact.groupName ?? "").trim();
  const canPayThisContact =
    Boolean(ln) || (payWithCashuEnabled && Boolean(npub));
  const canStartPay =
    (Boolean(ln) && cashuBalance > 0) || (Boolean(npub) && cashuBalance > 0);
  const isFeedbackContact = npub === feedbackContactNpub;

  return (
    <section className="panel">
      <div className="contact-detail">
        <div className="contact-avatar is-xl" aria-hidden="true">
          {url ? (
            <img src={url} alt="" loading="lazy" referrerPolicy="no-referrer" />
          ) : (
            <span className="contact-avatar-fallback">
              {getInitials(String(selectedContact.name ?? ""))}
            </span>
          )}
        </div>

        {selectedContact.name && (
          <h2 className="contact-detail-name">{selectedContact.name}</h2>
        )}

        {group && <p className="contact-detail-group">{group}</p>}

        {ln && <p className="contact-detail-ln">{ln}</p>}

        <div className="contact-detail-actions">
          {canPayThisContact && (
            <button
              className="btn-wide"
              onClick={() => openContactPay(selectedContact.id)}
              disabled={cashuIsBusy || !canStartPay}
              title={!canStartPay ? t("payInsufficient") : undefined}
              data-guide="contact-pay"
            >
              {isFeedbackContact ? "Donate" : t("pay")}
            </button>
          )}

          {npub && (
            <button
              className="btn-wide secondary"
              onClick={() =>
                navigateTo({ route: "chat", id: selectedContact.id })
              }
              data-guide="contact-message"
            >
              {isFeedbackContact ? "Feedback" : t("sendMessage")}
            </button>
          )}
        </div>
      </div>
    </section>
  );
};
