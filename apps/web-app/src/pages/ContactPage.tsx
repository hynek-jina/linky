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
              <span className="btn-label-with-icon">
                <span className="btn-label-icon" aria-hidden="true">
                  ₿
                </span>
                <span>{isFeedbackContact ? "Donate" : t("pay")}</span>
              </span>
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
              <span className="btn-label-with-icon">
                <span className="btn-label-icon" aria-hidden="true">
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M7 18.5H6C4.343 18.5 3 17.157 3 15.5V7.5C3 5.843 4.343 4.5 6 4.5H18C19.657 4.5 21 5.843 21 7.5V15.5C21 17.157 19.657 18.5 18 18.5H12L8 21V18.5H7Z"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
                <span>{isFeedbackContact ? "Feedback" : t("sendMessage")}</span>
              </span>
            </button>
          )}
        </div>
      </div>
    </section>
  );
};
