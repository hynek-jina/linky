import { useEffect, useState, type FC } from "react";
import {
  DonateIcon,
  FeedbackIcon,
  MessagesIcon,
  PayIcon,
} from "../components/icons";
import type { ContactId } from "../evolu";
import { useNavigation } from "../hooks/useRouting";
import {
  fetchNostrProfileMetadata,
  loadCachedProfileMetadata,
} from "../nostrProfile";
import { formatDisplayGeneralStatus } from "../nostrStatus";
import { formatShortLightningAddress, getInitials } from "../utils/formatting";
import { resolveVerifiedNip05Identifier } from "../utils/nostrNip05";
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
  statusText: string | null;
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

const useVerifiedNip05 = (npub: string | null): string | null => {
  const [verifiedNip05, setVerifiedNip05] = useState<{
    identifier: string;
    npub: string;
  } | null>(null);

  useEffect(() => {
    if (!npub) return;

    const controller = new AbortController();
    let cancelled = false;

    const load = async () => {
      try {
        const cachedMetadata =
          loadCachedProfileMetadata(npub)?.metadata ?? null;
        const metadata =
          cachedMetadata ??
          (await fetchNostrProfileMetadata(npub, {
            signal: controller.signal,
          }));
        if (cancelled || !metadata?.nip05) return;

        const identifier = await resolveVerifiedNip05Identifier(
          metadata.nip05,
          npub,
          { signal: controller.signal },
        );
        if (!cancelled && identifier) setVerifiedNip05({ identifier, npub });
      } catch {
        // A profile remains usable when its metadata or NIP-05 server is offline.
      }
    };

    void load();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [npub]);

  return verifiedNip05?.npub === npub ? verifiedNip05.identifier : null;
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
  statusText,
  t,
}) => {
  const navigateTo = useNavigation();
  const selectedNpub = normalizeNpubIdentifier(selectedContact?.npub);
  const verifiedNip05 = useVerifiedNip05(selectedNpub);
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
  const npub = selectedNpub;
  const url = npub ? nostrPictureByNpub[npub] : null;
  const hasLightningAddress = ln.length > 0;
  const canMessage = Boolean(npub);
  const contactName = name || t("contact");
  const isLightningAddressNip05Verified =
    Boolean(verifiedNip05) && verifiedNip05?.toLowerCase() === ln.toLowerCase();
  const canPayThisContact =
    hasLightningAddress || (payWithCashuEnabled && canMessage);
  const canStartPay = cashuBalance > 0 && canPayThisContact;
  const isFeedbackContact = npub === feedbackContactNpub;
  const payLabel = isFeedbackContact ? t("donate") : t("pay");
  const messageLabel = isFeedbackContact ? t("feedback") : t("sendMessage");
  const contactStatus = formatDisplayGeneralStatus({
    status: statusText,
    providesLabel: t("contactStatusProvides"),
  });
  const avatarContent = url ? (
    <img src={url} alt="" loading="lazy" referrerPolicy="no-referrer" />
  ) : (
    <span className="contact-avatar-fallback">
      {getInitials(String(selectedContact.name ?? ""))}
    </span>
  );

  return (
    <section className="panel contact-detail-card">
      <div className="contact-detail">
        <div className="contact-detail-header">
          {npub ? (
            <button
              type="button"
              className="contact-avatar is-xl contact-detail-avatar-button"
              onClick={() => void copyText(npub)}
              aria-label={`${t("copy")} ${t("npub")}`}
              title={npub}
            >
              {avatarContent}
            </button>
          ) : (
            <div className="contact-avatar is-xl" aria-hidden="true">
              {avatarContent}
            </div>
          )}
        </div>

        <div className="contact-detail-copy-block">
          <div className="contact-detail-title-row">
            <h2 className="contact-detail-name" title={contactName}>
              {contactName}
            </h2>
          </div>
          {contactStatus ? (
            <p className="contact-detail-status" title={contactStatus}>
              {contactStatus}
            </p>
          ) : null}
          {group ? <p className="contact-detail-group">{group}</p> : null}
        </div>

        {hasLightningAddress ? (
          <button
            type="button"
            className="copyable contact-detail-ln contact-detail-copy"
            onClick={() => void copyText(ln)}
            title={
              isLightningAddressNip05Verified
                ? `${ln} · ${t("verifiedNip05")}`
                : ln
            }
            aria-label={
              isLightningAddressNip05Verified
                ? `${t("verifiedNip05")}: ${ln}`
                : t("lightningAddress")
            }
          >
            {isLightningAddressNip05Verified ? (
              <span className="contact-detail-nip05-check" aria-hidden="true">
                ✓
              </span>
            ) : null}
            {formatShortLightningAddress(ln)}
          </button>
        ) : null}

        {canPayThisContact && (
          <ContactActionButton
            icon={
              isFeedbackContact ? (
                <DonateIcon size={18} />
              ) : (
                <PayIcon size={18} />
              )
            }
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
            icon={
              isFeedbackContact ? (
                <FeedbackIcon size={18} />
              ) : (
                <MessagesIcon size={18} />
              )
            }
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
