import React from "react";
import { Check, Copy, ImagePlus, Landmark, Share2, X } from "lucide-react";
import { useAppShellCore } from "../app/context/AppShellContexts";
import {
  LINKY_BANK_PAYMENT_OFFER_PHASE_TTL_SEC,
  getLinkyBankPaymentOfferInfo,
  getLinkyBankPaymentOfferStatusRank,
  isLinkyBankPaymentOfferExpired,
  isLinkyBankPaymentOfferTerminalStatus,
  setLinkyBankPaymentOfferMinimized,
  type LinkyBankPaymentOfferInfo,
  type LinkyBankPaymentOfferStatus,
} from "../app/lib/bankPaymentOffer";
import type { ContactRowLike, LocalNostrMessage } from "../app/types/appTypes";
import { navigateTo, returnFromBankPaymentOffer } from "../hooks/useRouting";
import { getInitials } from "../utils/formatting";
import { normalizeNpubIdentifier } from "../utils/nostrNpub";
import {
  openSpdPaymentInBank,
  shareSpdPaymentQrJpeg,
  tryParseSpdPayment,
  type SpdPayment,
} from "../utils/spdPayment";

interface BankPaymentOfferDetailPageProps {
  bankPaymentOfferMessages: LocalNostrMessage[];
  chatId: string;
  chatOwnPubkeyHex: string | null;
  contacts: readonly ContactRowLike[];
  offerId: string;
  onCopyText: (text: string) => void;
  onRespondBankPaymentOffer: (
    message: LocalNostrMessage,
    nextStatus: Exclude<LinkyBankPaymentOfferStatus, "offered">,
  ) => Promise<boolean>;
  onSendChatImage: (file: File) => Promise<void>;
  onSettleBankPaymentOffer: (message: LocalNostrMessage) => Promise<void>;
  t: (key: string) => string;
}

interface BankPaymentOfferEntry {
  info: LinkyBankPaymentOfferInfo;
  message: LocalNostrMessage;
}

interface BankPaymentFieldRow {
  key: string;
  label: string;
  value: string;
}

const getSpdField = (payment: SpdPayment, key: string): string =>
  String(payment.fields[key] ?? "").trim();

const getEntryTime = (entry: BankPaymentOfferEntry): number =>
  entry.info.statusUpdatedAtSec || Number(entry.message.createdAtSec ?? 0) || 0;

const compareEntries = (
  left: BankPaymentOfferEntry,
  right: BankPaymentOfferEntry,
): number => {
  const rankDelta =
    getLinkyBankPaymentOfferStatusRank(left.info.status) -
    getLinkyBankPaymentOfferStatusRank(right.info.status);
  if (rankDelta !== 0) return rankDelta;

  return getEntryTime(left) - getEntryTime(right);
};

const findOfferEntry = (
  messages: readonly LocalNostrMessage[],
  chatId: string,
  offerId: string,
): BankPaymentOfferEntry | null => {
  const normalizedChatId = String(chatId ?? "").trim();
  const normalizedOfferId = String(offerId ?? "").trim();
  if (!normalizedChatId || !normalizedOfferId) return null;

  let best: BankPaymentOfferEntry | null = null;
  for (const message of messages) {
    if (String(message.contactId ?? "").trim() !== normalizedChatId) continue;

    const info = getLinkyBankPaymentOfferInfo(String(message.content ?? ""));
    if (!info || info.offerId !== normalizedOfferId) continue;

    const entry = { info, message };
    if (!best || compareEntries(entry, best) > 0) {
      best = entry;
    }
  }

  return best;
};

const findOfferEntries = (
  messages: readonly LocalNostrMessage[],
  offerId: string,
): BankPaymentOfferEntry[] => {
  const normalizedOfferId = String(offerId ?? "").trim();
  const latestByContact = new Map<string, BankPaymentOfferEntry>();
  if (!normalizedOfferId) return [];

  for (const message of messages) {
    const info = getLinkyBankPaymentOfferInfo(String(message.content ?? ""));
    if (!info || info.offerId !== normalizedOfferId) continue;
    const contactId = String(message.contactId ?? "").trim();
    if (!contactId) continue;

    const entry = { info, message };
    const current = latestByContact.get(contactId);
    if (!current || compareEntries(entry, current) > 0) {
      latestByContact.set(contactId, entry);
    }
  }

  return [...latestByContact.values()];
};

const getStatusLabel = (
  status: LinkyBankPaymentOfferStatus,
  isIncoming: boolean,
  t: (key: string) => string,
): string => {
  switch (status) {
    case "accepted":
      return t("bankPaymentOfferStatusAccepted");
    case "bank_details_sent":
      return isIncoming
        ? t("bankPaymentOfferStatusBankDetailsReceived")
        : t("bankPaymentOfferStatusBankDetailsSent");
    case "bank_paid":
      return t("bankPaymentOfferStatusBankPaid");
    case "canceled":
      return t("bankPaymentOfferStatusCanceled");
    case "declined":
      return t("bankPaymentOfferStatusDeclined");
    case "settled":
      return t("bankPaymentOfferStatusSettled");
    case "offered":
      return t("bankPaymentOfferStatusOffered");
  }
};

const RecipientProgress = ({
  status,
  t,
}: {
  status: LinkyBankPaymentOfferStatus;
  t: (key: string) => string;
}) => {
  const hasAccepted =
    status === "accepted" ||
    status === "bank_details_sent" ||
    status === "bank_paid" ||
    status === "settled";
  const hasPaidFiat = status === "bank_paid" || status === "settled";
  const steps = [
    {
      isComplete: hasAccepted,
      key: "accepted",
      label: t("bankPaymentOfferProgressAccept"),
    },
    {
      isComplete: hasPaidFiat,
      key: "fiat",
      label: t("bankPaymentOfferProgressBankPayment"),
    },
    {
      isComplete: status === "settled",
      key: "bitcoin",
      label: t("bankPaymentOfferProgressSats"),
    },
  ];

  return (
    <div
      className="bank-payment-offer-progress"
      aria-label={t("bankPaymentOfferProgressTitle")}
    >
      {steps.map((step) => (
        <div
          className={`bank-payment-offer-progress-step${step.isComplete ? " is-complete" : ""}`}
          key={step.key}
        >
          <span className="bank-payment-offer-progress-dot" aria-hidden="true">
            {step.isComplete ? <Check size={13} /> : null}
          </span>
          <span>{step.label}</span>
        </div>
      ))}
    </div>
  );
};

const RequesterIntro = ({
  amountText,
  requesterName,
  status,
  t,
}: {
  amountText: string;
  requesterName: string;
  status: LinkyBankPaymentOfferStatus;
  t: (key: string) => string;
}) => (
  <div className="bank-payment-offer-requester-intro">
    <strong>
      {t("bankPaymentOfferRequestedBy").replace("{name}", requesterName)}
    </strong>
    <div className="bank-payment-amount">{amountText}</div>
    <RecipientProgress status={status} t={t} />
  </div>
);

const buildPaymentRows = (
  payment: SpdPayment,
  t: (key: string) => string,
): BankPaymentFieldRow[] => {
  const rows: BankPaymentFieldRow[] = [];
  const amount = getSpdField(payment, "AM");
  const currency = getSpdField(payment, "CC");
  const amountText = [amount, currency].filter(Boolean).join(" ");
  if (amountText) {
    rows.push({
      key: "AM",
      label: t("spdPaymentAmount"),
      value: amountText,
    });
  }

  const addRow = (key: string, label: string) => {
    const value = getSpdField(payment, key);
    if (!value) return;
    rows.push({ key, label, value });
  };

  addRow("RN", t("spdPaymentRecipient"));
  addRow("ACC", t("spdPaymentAccount"));
  addRow("X-VS", t("spdPaymentVariableSymbol"));
  addRow("X-SS", t("spdPaymentSpecificSymbol"));
  addRow("X-KS", t("spdPaymentConstantSymbol"));
  addRow("MSG", t("spdPaymentMessage"));
  addRow("DT", t("spdPaymentDueDate"));

  return rows;
};

const getOpenErrorText = (error: unknown, t: (key: string) => string) => {
  if (error instanceof Error && error.name === "AbortError") {
    return null;
  }

  const message = error instanceof Error ? error.message : "";
  if (message === "spd-share-unavailable") {
    return t("spdPaymentShareUnavailable");
  }
  if (message === "spd-service-worker-unavailable") {
    return t("spdPaymentServiceWorkerUnavailable");
  }
  return t("spdPaymentOpenFailed");
};

const hasTimedPhase = (status: LinkyBankPaymentOfferStatus): boolean =>
  status === "accepted" ||
  status === "bank_details_sent" ||
  status === "bank_paid" ||
  status === "offered";

const formatRemainingTime = (
  remainingSec: number,
  t: (key: string) => string,
): string => {
  if (remainingSec <= 0) return t("bankPaymentOfferExpired");

  const minutes = Math.floor(remainingSec / 60);
  const seconds = Math.max(0, remainingSec % 60);
  return t("bankPaymentOfferTimeRemainingClock")
    .replace("{minutes}", String(minutes))
    .replace("{seconds}", String(seconds).padStart(2, "0"));
};

export const BankPaymentOfferDetailPage: React.FC<
  BankPaymentOfferDetailPageProps
> = ({
  bankPaymentOfferMessages,
  chatId,
  chatOwnPubkeyHex,
  contacts,
  offerId,
  onCopyText,
  onRespondBankPaymentOffer,
  onSendChatImage,
  onSettleBankPaymentOffer,
  t,
}) => {
  const { formatDisplayedAmountText, nostrPictureByNpub } = useAppShellCore();
  const confirmationInputRef = React.useRef<HTMLInputElement | null>(null);
  const [qrDataUrl, setQrDataUrl] = React.useState<string | null>(null);
  const [isAttachingConfirmation, setIsAttachingConfirmation] =
    React.useState(false);
  const [isOpening, setIsOpening] = React.useState(false);
  const [isSharingJpeg, setIsSharingJpeg] = React.useState(false);
  const [isConfirmingPaid, setIsConfirmingPaid] = React.useState(false);
  const [isSettling, setIsSettling] = React.useState(false);
  const [responseStatus, setResponseStatus] = React.useState<
    "accepted" | "canceled" | "declined" | null
  >(null);
  const [errorText, setErrorText] = React.useState<string | null>(null);
  const [nowMs, setNowMs] = React.useState(() => Date.now());
  const entry = React.useMemo(
    () => findOfferEntry(bankPaymentOfferMessages, chatId, offerId),
    [bankPaymentOfferMessages, chatId, offerId],
  );
  const offerEntries = React.useMemo(
    () => findOfferEntries(bankPaymentOfferMessages, offerId),
    [bankPaymentOfferMessages, offerId],
  );
  const payment = React.useMemo(
    () =>
      entry?.info.spdPayload ? tryParseSpdPayment(entry.info.spdPayload) : null,
    [entry],
  );

  React.useEffect(() => {
    let cancelled = false;
    setQrDataUrl(null);

    const payload = String(entry?.info.spdPayload ?? "").trim();
    if (!payload) return;

    void (async () => {
      try {
        const QRCode = await import("qrcode");
        const qr = await QRCode.toDataURL(payload, {
          errorCorrectionLevel: "M",
          margin: 2,
          width: 512,
        });
        if (!cancelled) setQrDataUrl(qr);
      } catch {
        if (!cancelled) setQrDataUrl(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [entry]);

  React.useEffect(() => {
    if (!entry || !hasTimedPhase(entry.info.status)) return;

    const intervalId = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1_000);

    return () => window.clearInterval(intervalId);
  }, [entry]);

  const isCreatedByMe =
    entry !== null &&
    (String(entry.info.offererPublicKey ?? "").trim() ===
      String(chatOwnPubkeyHex ?? "").trim() ||
      entry.message.direction === "out");

  React.useEffect(() => {
    if (!entry || entry.info.status !== "settled" || isCreatedByMe) return;

    setLinkyBankPaymentOfferMinimized(chatId, offerId, true);
    returnFromBankPaymentOffer(chatId);
  }, [chatId, entry, isCreatedByMe, offerId]);

  const closeOffer = () => {
    setLinkyBankPaymentOfferMinimized(chatId, offerId, true);
    returnFromBankPaymentOffer(chatId);
  };

  const isExpired = entry
    ? isLinkyBankPaymentOfferExpired(
        entry.info,
        Number(entry.message.createdAtSec ?? 0),
        Math.floor(nowMs / 1_000),
      )
    : true;

  if (!entry || isExpired) {
    return (
      <section className="panel panel-plain bank-payment-offer-state-page">
        <div className="bank-payment-offer-state-copy">
          <h2>{t("bankPaymentOfferExpiredTitle")}</h2>
          <p className="muted">{t("bankPaymentOfferExpiredDescription")}</p>
        </div>
        <button type="button" className="btn-wide" onClick={closeOffer}>
          {t("close")}
        </button>
      </section>
    );
  }

  const amountText = entry.info.amountSat
    ? formatDisplayedAmountText(entry.info.amountSat)
    : entry.info.amountText;
  const requesterContact = contacts.find(
    (contact) =>
      String(contact.id ?? "").trim() ===
      String(entry.message.contactId ?? "").trim(),
  );
  const requesterName =
    String(requesterContact?.name ?? "").trim() || t("unknownContactTitle");

  if (isCreatedByMe) {
    const activeEntry =
      offerEntries
        .filter(
          ({ info }) => !isLinkyBankPaymentOfferTerminalStatus(info.status),
        )
        .sort(compareEntries)
        .at(-1) ??
      [...offerEntries].sort(compareEntries).at(-1) ??
      entry;
    const activeAmountText = activeEntry.info.amountSat
      ? formatDisplayedAmountText(activeEntry.info.amountSat)
      : activeEntry.info.amountText;
    const remainingSec = hasTimedPhase(activeEntry.info.status)
      ? getEntryTime(activeEntry) +
        LINKY_BANK_PAYMENT_OFFER_PHASE_TTL_SEC -
        Math.floor(nowMs / 1_000)
      : null;
    const canSettle = activeEntry.info.status === "bank_paid";
    const canCancel =
      activeEntry.info.status !== "settled" &&
      activeEntry.info.status !== "canceled";

    const cancelOffer = async () => {
      if (responseStatus) return;
      setResponseStatus("canceled");
      try {
        await onRespondBankPaymentOffer(activeEntry.message, "canceled");
      } finally {
        setResponseStatus(null);
      }
    };
    const settleOffer = async () => {
      if (!canSettle || isSettling) return;
      setIsSettling(true);
      try {
        await onSettleBankPaymentOffer(activeEntry.message);
      } finally {
        setIsSettling(false);
      }
    };

    return (
      <section className="panel panel-plain bank-payment-offer-owner-page">
        <div className="bank-payment-offer-owner-summary">
          <div className="bank-payment-amount">{activeAmountText}</div>
          <RecipientProgress status={activeEntry.info.status} t={t} />
          {remainingSec !== null ? (
            <div className="bank-payment-offer-timer">
              {formatRemainingTime(remainingSec, t)}
            </div>
          ) : null}
          {offerEntries.some(
            ({ info }) =>
              info.status === "accepted" ||
              info.status === "bank_details_sent" ||
              info.status === "bank_paid",
          ) ? (
            <p className="muted">{t("bankPaymentOfferProgressAcceptedInfo")}</p>
          ) : null}
        </div>

        <div className="bank-payment-offer-recipient-list">
          {offerEntries.map((offerEntry) => {
            const contactId = String(offerEntry.message.contactId ?? "").trim();
            const contact = contacts.find(
              (candidate) => String(candidate.id ?? "").trim() === contactId,
            );
            const name =
              String(contact?.name ?? "").trim() || t("unknownContactTitle");
            const npub = normalizeNpubIdentifier(contact?.npub);
            const pictureUrl = npub ? (nostrPictureByNpub[npub] ?? null) : null;
            return (
              <div className="bank-payment-offer-recipient" key={contactId}>
                <span className="bank-payment-offer-recipient-identity">
                  <span
                    className="bank-payment-offer-recipient-avatar"
                    aria-hidden="true"
                  >
                    {pictureUrl ? (
                      <img
                        src={pictureUrl}
                        alt=""
                        loading="lazy"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <span>{getInitials(name)}</span>
                    )}
                  </span>
                  <span>{name}</span>
                </span>
                <span
                  className={`chat-payment-request-status is-${offerEntry.info.status}`}
                >
                  {getStatusLabel(offerEntry.info.status, false, t)}
                </span>
              </div>
            );
          })}
        </div>

        {canSettle ? (
          <button
            type="button"
            className="btn-wide"
            disabled={isSettling}
            onClick={() => void settleOffer()}
          >
            <span className="btn-label-with-icon">
              <span className="btn-label-icon" aria-hidden="true">
                {isSettling ? <span className="btn-spinner" /> : <Check />}
              </span>
              <span>
                {isSettling
                  ? t("chatPendingShort")
                  : t("bankPaymentOfferSettle")}
              </span>
            </span>
          </button>
        ) : null}
        {canCancel ? (
          <button
            type="button"
            className="btn-wide secondary"
            disabled={responseStatus !== null}
            onClick={() => void cancelOffer()}
          >
            <span className="btn-label-with-icon">
              <X size={18} />
              <span>
                {t(
                  canSettle
                    ? "bankPaymentOfferNotPaid"
                    : "bankPaymentOfferCancel",
                )}
              </span>
            </span>
          </button>
        ) : null}
      </section>
    );
  }

  if (
    entry.info.status === "offered" &&
    String(entry.message.direction ?? "") === "in"
  ) {
    const respond = async (nextStatus: "accepted" | "declined") => {
      if (responseStatus) return;

      setResponseStatus(nextStatus);
      setErrorText(null);
      try {
        const sent = await onRespondBankPaymentOffer(entry.message, nextStatus);
        if (sent) {
          if (nextStatus === "declined") {
            navigateTo({ route: "chat", id: chatId });
          }
          return;
        }
        setErrorText(t("spdPaymentOfferFailed"));
      } finally {
        setResponseStatus(null);
      }
    };

    const remainingSec =
      getEntryTime(entry) +
      LINKY_BANK_PAYMENT_OFFER_PHASE_TTL_SEC -
      Math.floor(nowMs / 1_000);

    return (
      <section className="panel panel-plain bank-payment-offer-state-page">
        <div className="bank-payment-offer-state-copy">
          <RequesterIntro
            amountText={amountText}
            requesterName={requesterName}
            status={entry.info.status}
            t={t}
          />
          <div className="bank-payment-offer-timer">
            {formatRemainingTime(remainingSec, t)}
          </div>
        </div>

        {errorText ? <p className="error-text">{errorText}</p> : null}

        <div className="bank-payment-offer-decision-actions">
          <button
            type="button"
            className="btn-wide"
            disabled={responseStatus !== null}
            onClick={() => {
              void respond("accepted");
            }}
          >
            {responseStatus === "accepted"
              ? t("chatPendingShort")
              : t("bankPaymentOfferAccept")}
          </button>
          <button
            type="button"
            className="btn-wide secondary"
            disabled={responseStatus !== null}
            onClick={() => {
              void respond("declined");
            }}
          >
            {responseStatus === "declined"
              ? t("chatPendingShort")
              : t("decline")}
          </button>
        </div>
      </section>
    );
  }

  if (
    !payment &&
    entry.info.status !== "accepted" &&
    entry.info.status !== "bank_paid"
  ) {
    return (
      <section className="panel panel-plain bank-payment-page">
        <p className="muted bank-payment-hint">{t("spdPaymentInvalid")}</p>
      </section>
    );
  }

  const remainingSec = hasTimedPhase(entry.info.status)
    ? getEntryTime(entry) +
      LINKY_BANK_PAYMENT_OFFER_PHASE_TTL_SEC -
      Math.floor(nowMs / 1000)
    : null;
  const remainingTimeText =
    remainingSec === null ? null : formatRemainingTime(remainingSec, t);

  if (entry.info.status === "bank_paid") {
    const attachConfirmation = async (file: File) => {
      if (isAttachingConfirmation) return;

      setIsAttachingConfirmation(true);
      try {
        await onSendChatImage(file);
        navigateTo({ route: "chat", id: chatId });
      } finally {
        setIsAttachingConfirmation(false);
      }
    };

    return (
      <section className="panel panel-plain bank-payment-offer-state-page">
        <div className="bank-payment-offer-state-copy">
          <h2>{t("bankPaymentOfferWaitingForSatsTitle")}</h2>
          <div className="bank-payment-amount">{amountText}</div>
          <RecipientProgress status={entry.info.status} t={t} />
          <p className="muted">
            {t("bankPaymentOfferWaitingForSatsDescription").replace(
              "{name}",
              requesterName,
            )}
          </p>
          {remainingTimeText ? (
            <div className="bank-payment-offer-timer">{remainingTimeText}</div>
          ) : null}
        </div>

        <input
          ref={confirmationInputRef}
          className="chat-image-input"
          type="file"
          accept="image/*"
          onChange={(event) => {
            const file = event.target.files?.[0] ?? null;
            event.currentTarget.value = "";
            if (!file) return;
            void attachConfirmation(file);
          }}
          tabIndex={-1}
        />
        <button
          type="button"
          className="btn-wide"
          disabled={isAttachingConfirmation}
          onClick={() => confirmationInputRef.current?.click()}
        >
          <span className="btn-label-with-icon">
            <span className="btn-label-icon" aria-hidden="true">
              {isAttachingConfirmation ? (
                <span className="btn-spinner" />
              ) : (
                <ImagePlus />
              )}
            </span>
            <span>
              {isAttachingConfirmation
                ? t("chatPendingShort")
                : t("bankPaymentOfferAttachConfirmation")}
            </span>
          </span>
        </button>
      </section>
    );
  }

  if (!payment) {
    return (
      <section className="panel panel-plain bank-payment-offer-state-page">
        <div className="bank-payment-offer-state-copy">
          <RequesterIntro
            amountText={amountText}
            requesterName={requesterName}
            status={entry.info.status}
            t={t}
          />
          <p className="muted">
            {t("bankPaymentOfferDescriptionAcceptedIncoming").replace(
              "{amount}",
              amountText,
            )}
          </p>
          {remainingTimeText ? (
            <div className="bank-payment-offer-timer">{remainingTimeText}</div>
          ) : null}
        </div>
      </section>
    );
  }

  const rows = buildPaymentRows(payment, t);
  const canConfirmPaid =
    entry.info.status === "bank_details_sent" &&
    String(entry.message.direction ?? "") === "in";

  const openInBank = async () => {
    if (isOpening) return;

    setIsOpening(true);
    setErrorText(null);
    try {
      await openSpdPaymentInBank(payment.payload);
    } catch (error) {
      setErrorText(getOpenErrorText(error, t));
    } finally {
      setIsOpening(false);
    }
  };

  const openWithJpeg = async () => {
    if (isSharingJpeg) return;

    setIsSharingJpeg(true);
    setErrorText(null);
    try {
      await shareSpdPaymentQrJpeg(payment.payload);
    } catch (error) {
      setErrorText(getOpenErrorText(error, t));
    } finally {
      setIsSharingJpeg(false);
    }
  };

  const confirmPaid = async () => {
    if (!canConfirmPaid || isConfirmingPaid) return;

    setIsConfirmingPaid(true);
    setErrorText(null);
    try {
      const sent = await onRespondBankPaymentOffer(entry.message, "bank_paid");
      if (sent) return;
      setErrorText(t("spdPaymentOfferFailed"));
    } finally {
      setIsConfirmingPaid(false);
    }
  };

  return (
    <section className="panel panel-plain bank-payment-page bank-payment-offer-detail-page">
      <div className="bank-payment-summary bank-payment-offer-requester-summary">
        <RequesterIntro
          amountText={amountText}
          requesterName={requesterName}
          status={entry.info.status}
          t={t}
        />
        {remainingTimeText ? (
          <div className="bank-payment-offer-timer">{remainingTimeText}</div>
        ) : null}
      </div>

      <div className="bank-payment-offer-qr-wrap">
        {qrDataUrl ? (
          <img className="qr bank-payment-offer-qr" src={qrDataUrl} alt="" />
        ) : (
          <div className="bank-payment-offer-qr-placeholder" aria-hidden="true">
            QR
          </div>
        )}
      </div>

      <div className="bank-payment-fields">
        {rows.map((row) => (
          <div className="settings-row bank-payment-row" key={row.key}>
            <div>
              <strong>{row.label}</strong>
              <button
                type="button"
                className="copyable transaction-detail-copy bank-payment-copy"
                onClick={() => onCopyText(row.value)}
                aria-label={t("copy")}
                title={t("copy")}
              >
                <span className="transaction-detail-copyText">{row.value}</span>
                <span
                  className="transaction-detail-copyIcon"
                  aria-hidden="true"
                >
                  <Copy size={14} />
                </span>
              </button>
            </div>
          </div>
        ))}
      </div>

      <button
        type="button"
        className="btn-wide bank-payment-request"
        disabled={!canConfirmPaid || isConfirmingPaid}
        onClick={() => {
          void confirmPaid();
        }}
      >
        <span className="btn-label-with-icon">
          <span className="btn-label-icon" aria-hidden="true">
            {isConfirmingPaid ? <span className="btn-spinner" /> : <Check />}
          </span>
          <span>
            {isConfirmingPaid
              ? t("chatPendingShort")
              : t("bankPaymentOfferMarkPaid")}
          </span>
        </span>
      </button>

      <div className="bank-payment-open-actions">
        <button
          type="button"
          className="btn-wide secondary bank-payment-open"
          disabled={isOpening}
          onClick={() => {
            void openInBank();
          }}
        >
          <span className="btn-label-with-icon">
            <span className="btn-label-icon" aria-hidden="true">
              {isOpening ? <span className="btn-spinner" /> : <Landmark />}
            </span>
            <span>
              {isOpening ? t("spdPaymentOpening") : t("spdPaymentOpenInBank")}
            </span>
          </span>
        </button>

        <button
          type="button"
          className="btn-wide secondary bank-payment-open"
          disabled={isSharingJpeg}
          onClick={() => {
            void openWithJpeg();
          }}
        >
          <span className="btn-label-with-icon">
            <span className="btn-label-icon" aria-hidden="true">
              {isSharingJpeg ? <span className="btn-spinner" /> : <Share2 />}
            </span>
            <span>
              {isSharingJpeg
                ? t("spdPaymentOpening")
                : t("spdPaymentOpenWithJpg")}
            </span>
          </span>
        </button>
      </div>

      {errorText ? <p className="bank-payment-error">{errorText}</p> : null}
    </section>
  );
};
