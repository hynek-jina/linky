import type { FC } from "react";
import type { ContactId } from "../evolu";
import { useNavigation } from "../hooks/useRouting";
import { formatShortLightningAddress, getInitials } from "../utils/formatting";
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
  copyText: (text: string) => Promise<void>;
  feedbackContactNpub: string;
  nostrPictureByNpub: Record<string, string | null>;
  openContactPay: (id: ContactId) => void;
  payWithCashuEnabled: boolean;
  selectedContact: Contact | null;
  t: (key: string) => string;
}

interface ContactActionButtonProps {
  children: string;
  className?: string;
  dataGuide?: string;
  disabled?: boolean;
  icon: React.ReactNode;
  onClick: () => void;
  title?: string | undefined;
}

const MessageIcon = (): React.ReactElement => {
  return (
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
  );
};

const ContactActionButton = ({
  children,
  className = "btn-wide",
  dataGuide,
  disabled = false,
  icon,
  onClick,
  title,
}: ContactActionButtonProps): React.ReactElement => {
  return (
    <button
      className={className}
      onClick={onClick}
      disabled={disabled}
      title={title}
      data-guide={dataGuide}
    >
      <span className="btn-label-with-icon">
        <span className="btn-label-icon" aria-hidden="true">
          {icon}
        </span>
        <span>{children}</span>
      </span>
    </button>
  );
};

export const ContactPage: FC<ContactPageProps> = ({
  cashuBalance,
  cashuIsBusy,
  copyText,
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

  const contactId = selectedContact.id;
  const name = String(selectedContact.name ?? "").trim();
  const group = String(selectedContact.groupName ?? "").trim();
  const ln = String(selectedContact.lnAddress ?? "").trim();
  const npub = normalizeNpubIdentifier(selectedContact.npub);
  const url = npub ? nostrPictureByNpub[npub] : null;
  const hasLightningAddress = ln.length > 0;
  const canMessage = Boolean(npub);
  const contactName = name || t("contact");
  const canPayThisContact =
    hasLightningAddress || (payWithCashuEnabled && canMessage);
  const canStartPay = cashuBalance > 0 && canPayThisContact;
  const isFeedbackContact = npub === feedbackContactNpub;
  const payLabel = isFeedbackContact ? "Donate" : t("pay");
  const messageLabel = isFeedbackContact ? "Feedback" : t("sendMessage");

  return (
    <section className="panel contact-detail-card">
      <div className="contact-detail">
        <div className="contact-detail-header">
          <div className="contact-avatar is-xl" aria-hidden="true">
            {url ? (
              <img
                src={url}
                alt=""
                loading="lazy"
                referrerPolicy="no-referrer"
              />
            ) : (
              <span className="contact-avatar-fallback">
                {getInitials(String(selectedContact.name ?? ""))}
              </span>
            )}
          </div>

          <button
            type="button"
            className="secondary contact-detail-edit"
            onClick={() => navigateTo({ route: "contactEdit", id: contactId })}
            aria-label={t("editContact")}
            title={t("editContact")}
          >
            ✎
          </button>
        </div>

        <div className="contact-detail-copy-block">
          <h2 className="contact-detail-name">{contactName}</h2>
          {group ? <p className="contact-detail-group">{group}</p> : null}
        </div>

        {hasLightningAddress ? (
          <button
            type="button"
            className="copyable contact-detail-ln contact-detail-copy"
            onClick={() => void copyText(ln)}
            title={ln}
            aria-label={t("lightningAddress")}
          >
            {formatShortLightningAddress(ln)}
          </button>
        ) : null}

        {canPayThisContact && (
          <ContactActionButton
            icon="₿"
            onClick={() => openContactPay(contactId)}
            disabled={cashuIsBusy || !canStartPay}
            title={!canStartPay ? t("payInsufficient") : undefined}
            dataGuide="contact-pay"
          >
            {payLabel}
          </ContactActionButton>
        )}

        {canMessage && (
          <ContactActionButton
            className="btn-wide secondary"
            icon={<MessageIcon />}
            onClick={() => navigateTo({ route: "chat", id: contactId })}
            dataGuide="contact-message"
          >
            {messageLabel}
          </ContactActionButton>
        )}
      </div>
    </section>
  );
};
