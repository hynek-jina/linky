import React from "react";
import {
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  FileText,
  ImagePlus,
  Landmark,
  Share2,
  X,
} from "lucide-react";
import { useAppShellCore } from "../app/context/AppShellContexts";
import {
  formatRemainingTime,
  getLinkyBankPaymentOfferExpiresAtSec,
  getLinkyBankPaymentOfferInfo,
  getLinkyBankPaymentOfferStatusRank,
  isLinkyBankPaymentOfferExpired,
  isLinkyBankPaymentOfferTerminalStatus,
  readLinkyBankPaymentOfferStaggerRecords,
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
  tryParseBankPayment,
  type BankPayment,
} from "../utils/spdPayment";
import {
  getChatAttachmentRejection,
  isPrivatePdfPayload,
  parsePrivateImageMessage,
  type PrivateImageMessagePayload,
} from "../app/lib/privateImageMessage";
import { BankPaymentAmount } from "../components/BankPaymentAmount";
import { PrivateFileBubble } from "../components/PrivateFileBubble";
import { PrivateImageBubble } from "../components/PrivateImageBubble";
import { nowSeconds } from "../utils/time";
import type { Translate } from "../i18n";

interface BankPaymentOfferDetailPageProps {
  bankPaymentOfferMessages: LocalNostrMessage[];
  chatId: string;
  chatMessages: LocalNostrMessage[];
  chatOwnPubkeyHex: string | null;
  contacts: readonly ContactRowLike[];
  offerId: string;
  onCopyText: (text: string) => void;
  onRespondBankPaymentOffer: (
    message: LocalNostrMessage,
    nextStatus: LinkyBankPaymentOfferStatus,
    options?: {
      expiresAtSec?: number | null;
      extensionSec?: number | null;
      withPush?: boolean;
    },
  ) => Promise<boolean>;
  onSendChatImage: (
    file: File,
    replyToMessage?: LocalNostrMessage,
  ) => Promise<void>;
  onSettleBankPaymentOffer: (message: LocalNostrMessage) => Promise<void>;
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

interface BankPaymentConfirmation {
  message: LocalNostrMessage;
  payload: PrivateImageMessagePayload;
}

const getSpdField = (payment: BankPayment, key: string): string =>
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

const findPaymentConfirmation = (
  offerMessages: readonly LocalNostrMessage[],
  chatMessages: readonly LocalNostrMessage[],
  chatId: string,
  offerId: string,
): BankPaymentConfirmation | null => {
  const paymentMessageIds = new Set<string>();
  for (const message of offerMessages) {
    if (String(message.contactId ?? "").trim() !== chatId.trim()) continue;
    const info = getLinkyBankPaymentOfferInfo(String(message.content ?? ""));
    if (
      !info ||
      info.offerId !== offerId.trim() ||
      (info.status !== "bank_paid" && info.status !== "settled")
    ) {
      continue;
    }
    const rumorId = String(message.rumorId ?? "").trim();
    if (rumorId) paymentMessageIds.add(rumorId);
  }

  let confirmation: BankPaymentConfirmation | null = null;
  for (const message of chatMessages) {
    if (String(message.contactId ?? "").trim() !== chatId.trim()) continue;
    const replyToId = String(message.replyToId ?? "").trim();
    const rootMessageId = String(message.rootMessageId ?? "").trim();
    if (
      !paymentMessageIds.has(replyToId) &&
      !paymentMessageIds.has(rootMessageId)
    ) {
      continue;
    }
    const payload = parsePrivateImageMessage(message.content);
    if (!payload) continue;
    if (
      !confirmation ||
      message.createdAtSec >= confirmation.message.createdAtSec
    ) {
      confirmation = { message, payload };
    }
  }
  return confirmation;
};

const PaymentConfirmation = ({
  confirmation,
  t,
}: {
  confirmation: BankPaymentConfirmation;
  t: Translate;
}) => {
  const rumorId = String(confirmation.message.rumorId ?? "").trim() || null;
  return (
    <div className="bank-payment-offer-confirmation">
      <strong>{t("bankPaymentOfferConfirmation")}</strong>
      {isPrivatePdfPayload(confirmation.payload) ? (
        <PrivateFileBubble
          onBlobChange={() => undefined}
          payload={confirmation.payload}
          rumorId={rumorId}
          t={t}
        />
      ) : (
        <PrivateImageBubble
          onBlobChange={() => undefined}
          payload={confirmation.payload}
          rumorId={rumorId}
          t={t}
        />
      )}
    </div>
  );
};

interface PendingConfirmation {
  fileName: string;
  imageUrl: string | null;
}

const PendingPaymentConfirmation = ({
  pending,
  t,
}: {
  pending: PendingConfirmation;
  t: Translate;
}) => (
  <div className="bank-payment-offer-confirmation">
    <strong>{t("bankPaymentOfferConfirmation")}</strong>
    {pending.imageUrl ? (
      <img
        className="chat-private-image"
        src={pending.imageUrl}
        alt={t("bankPaymentOfferConfirmation")}
      />
    ) : (
      <span className="chat-private-file">
        <span className="chat-private-file-icon" aria-hidden="true">
          <FileText size={28} />
        </span>
        <span className="chat-private-file-name">{pending.fileName}</span>
      </span>
    )}
  </div>
);

const getStatusLabel = (
  status: LinkyBankPaymentOfferStatus,
  isIncoming: boolean,
  t: Translate,
): string => {
  switch (status) {
    case "accepted":
      return t("bankPaymentOfferStatusAccepted");
    case "accepted_by_other":
      return t("bankPaymentOfferStatusAcceptedByOther");
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
  t: Translate;
}) => {
  const hasAccepted =
    status === "accepted" ||
    status === "bank_details_sent" ||
    status === "bank_paid" ||
    status === "settled";
  const hasPaidFiat = status === "bank_paid" || status === "settled";
  const steps = [
    {
      // The offer exists, so the first phase is always done — this makes the
      // bar read as progress instead of an empty checklist.
      isComplete: true,
      key: "offered",
      label: t("bankPaymentOfferProgressOffered"),
    },
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
  const completedCount = steps.filter((step) => step.isComplete).length;

  return (
    <div
      className="bank-payment-offer-progress"
      aria-label={t("bankPaymentOfferProgressTitle")}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={steps.length}
      aria-valuenow={completedCount}
    >
      {steps.map((step) => (
        <div
          className={`bank-payment-offer-progress-step${step.isComplete ? " is-complete" : ""}`}
          key={step.key}
        >
          <span
            className="bank-payment-offer-progress-segment"
            aria-hidden="true"
          />
          <span>{step.label}</span>
        </div>
      ))}
    </div>
  );
};

const RequesterIntro = ({
  amountText,
  canCycleAmount,
  requesterName,
  status,
  t,
}: {
  amountText: string;
  canCycleAmount: boolean;
  requesterName: string;
  status: LinkyBankPaymentOfferStatus;
  t: Translate;
}) => (
  <div className="bank-payment-offer-requester-intro">
    <strong>
      {t("bankPaymentOfferRequestedBy").replace("{name}", requesterName)}
    </strong>
    <BankPaymentAmount canCycle={canCycleAmount} text={amountText} />
    <RecipientProgress status={status} t={t} />
  </div>
);

const buildPaymentRows = (
  payment: BankPayment,
  t: Translate,
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
  addRow("BIC", t("spdPaymentBic"));
  addRow("RF", t("spdPaymentReference"));
  addRow("X-VS", t("spdPaymentVariableSymbol"));
  addRow("X-SS", t("spdPaymentSpecificSymbol"));
  addRow("X-KS", t("spdPaymentConstantSymbol"));
  addRow("MSG", t("spdPaymentMessage"));
  addRow("DT", t("spdPaymentDueDate"));

  return rows;
};

const getOpenErrorText = (error: unknown, t: Translate) => {
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

const BANK_PAYMENT_OFFER_EXTENSION_SEC = 60;

export const BankPaymentOfferDetailPage: React.FC<
  BankPaymentOfferDetailPageProps
> = ({
  bankPaymentOfferMessages,
  chatId,
  chatMessages,
  chatOwnPubkeyHex,
  contacts,
  offerId,
  onCopyText,
  onRespondBankPaymentOffer,
  onSendChatImage,
  onSettleBankPaymentOffer,
}) => {
  const { formatDisplayedAmountText, nostrPictureByNpub, t } =
    useAppShellCore();
  const confirmationInputRef = React.useRef<HTMLInputElement | null>(null);
  const [qrDataUrl, setQrDataUrl] = React.useState<string | null>(null);
  const [isAttachingConfirmation, setIsAttachingConfirmation] =
    React.useState(false);
  const [isOpening, setIsOpening] = React.useState(false);
  const [isSharingJpeg, setIsSharingJpeg] = React.useState(false);
  const [isConfirmingPaid, setIsConfirmingPaid] = React.useState(false);
  const [isSettling, setIsSettling] = React.useState(false);
  const [pendingConfirmation, setPendingConfirmation] =
    React.useState<PendingConfirmation | null>(null);
  const [isExtending, setIsExtending] = React.useState(false);
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
  const [showPaymentRows, setShowPaymentRows] = React.useState(false);
  // Recipients still waiting for their staggered send; the queue drains via
  // message upserts, so offerEntries changing keeps this list current.
  const queuedRecipients = React.useMemo(() => {
    const ownerPubkey = String(chatOwnPubkeyHex ?? "").trim();
    if (!ownerPubkey) return [];

    const record = readLinkyBankPaymentOfferStaggerRecords(ownerPubkey).find(
      (candidate) => candidate.offerId === String(offerId ?? "").trim(),
    );
    if (!record) return [];

    const offeredContactIds = new Set(
      offerEntries.map((offerEntry) =>
        String(offerEntry.message.contactId ?? "").trim(),
      ),
    );
    return record.pending.filter(
      (recipient) => !offeredContactIds.has(recipient.contactId),
    );
  }, [chatOwnPubkeyHex, offerEntries, offerId]);
  const confirmation = React.useMemo(
    () =>
      findPaymentConfirmation(
        bankPaymentOfferMessages,
        chatMessages,
        chatId,
        offerId,
      ),
    [bankPaymentOfferMessages, chatId, chatMessages, offerId],
  );
  React.useEffect(() => {
    if (confirmation) setPendingConfirmation(null);
  }, [confirmation]);
  React.useEffect(
    () => () => {
      if (pendingConfirmation?.imageUrl) {
        URL.revokeObjectURL(pendingConfirmation.imageUrl);
      }
    },
    [pendingConfirmation],
  );
  const payment = React.useMemo(
    () =>
      entry?.info.spdPayload
        ? tryParseBankPayment(entry.info.spdPayload)
        : null,
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

  // The displayed countdown may belong to another recipient's entry (the
  // offerer sees the accepting contact's phase), so tick unless the offer as
  // a whole has ended.
  const offerHasEnded =
    entry === null ||
    entry.info.status === "settled" ||
    entry.info.status === "canceled";
  React.useEffect(() => {
    if (offerHasEnded) return;
    const intervalId = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1_000);

    return () => window.clearInterval(intervalId);
  }, [offerHasEnded]);

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

  const extendTime = async (offerEntry: BankPaymentOfferEntry) => {
    if (isExtending || !hasTimedPhase(offerEntry.info.status)) return;
    const currentExpiresAtSec = getLinkyBankPaymentOfferExpiresAtSec(
      offerEntry.info,
      Number(offerEntry.message.createdAtSec ?? 0),
    );
    if (currentExpiresAtSec === null) return;

    setIsExtending(true);
    setErrorText(null);
    try {
      const sent = await onRespondBankPaymentOffer(
        offerEntry.message,
        offerEntry.info.status,
        {
          expiresAtSec:
            Math.max(currentExpiresAtSec, nowSeconds()) +
            BANK_PAYMENT_OFFER_EXTENSION_SEC,
          extensionSec: BANK_PAYMENT_OFFER_EXTENSION_SEC,
          withPush: true,
        },
      );
      if (!sent) setErrorText(t("spdPaymentOfferFailed"));
    } finally {
      setIsExtending(false);
    }
  };

  const timerWithExtension = (
    offerEntry: BankPaymentOfferEntry,
    remainingSec: number,
  ) => (
    <div className="bank-payment-offer-timer-row">
      <span className="bank-payment-offer-timer">
        {formatRemainingTime(remainingSec, t)}
      </span>
      <button
        type="button"
        className="bank-payment-offer-extend"
        disabled={isExtending || remainingSec <= 0}
        onClick={() => void extendTime(offerEntry)}
        aria-label={t("bankPaymentOfferNeedMoreTime")}
        title={t("bankPaymentOfferNeedMoreTime")}
      >
        {isExtending ? (
          <span className="btn-spinner" aria-hidden="true" />
        ) : (
          t("bankPaymentOfferExtendOneMinute")
        )}
      </button>
    </div>
  );

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
    const activeExpiresAtSec = getLinkyBankPaymentOfferExpiresAtSec(
      activeEntry.info,
      Number(activeEntry.message.createdAtSec ?? 0),
    );
    const remainingSec = activeExpiresAtSec
      ? activeExpiresAtSec - Math.floor(nowMs / 1_000)
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

    const acceptingEntry = offerEntries.find(
      ({ info }) =>
        info.status === "accepted" ||
        info.status === "bank_details_sent" ||
        info.status === "bank_paid",
    );
    const acceptingContactName = acceptingEntry
      ? String(
          contacts.find(
            (candidate) =>
              String(candidate.id ?? "").trim() ===
              String(acceptingEntry.message.contactId ?? "").trim(),
          )?.name ?? "",
        ).trim()
      : "";
    const acceptedInfoText = acceptingEntry
      ? acceptingContactName
        ? t("bankPaymentOfferProgressAcceptedByName").replace(
            "{name}",
            acceptingContactName,
          )
        : t("bankPaymentOfferProgressAcceptedInfo")
      : null;

    return (
      <section className="panel panel-plain bank-payment-offer-owner-page">
        <div className="bank-payment-offer-owner-summary">
          <BankPaymentAmount
            canCycle={Boolean(activeEntry.info.amountSat)}
            text={activeAmountText}
          />
          <RecipientProgress status={activeEntry.info.status} t={t} />
          {remainingSec !== null
            ? timerWithExtension(activeEntry, remainingSec)
            : null}
          {acceptedInfoText ? (
            <p className="muted">{acceptedInfoText}</p>
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
          {queuedRecipients.map((recipient) => {
            const contact = contacts.find(
              (candidate) =>
                String(candidate.id ?? "").trim() === recipient.contactId,
            );
            const name =
              String(contact?.name ?? "").trim() || t("unknownContactTitle");
            const npub = normalizeNpubIdentifier(contact?.npub);
            const pictureUrl = npub ? (nostrPictureByNpub[npub] ?? null) : null;
            return (
              <div
                className="bank-payment-offer-recipient"
                key={recipient.contactId}
              >
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
                <span className="chat-payment-request-status is-queued">
                  {t("bankPaymentOfferStatusQueued")}
                </span>
              </div>
            );
          })}
        </div>

        {confirmation ? (
          <PaymentConfirmation confirmation={confirmation} t={t} />
        ) : null}

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

  const wasRejectedAfterPaying =
    !isCreatedByMe &&
    entry.info.status === "canceled" &&
    (entry.info.bankPaidAtSec ?? 0) > 0;
  if (wasRejectedAfterPaying) {
    return (
      <section className="panel panel-plain bank-payment-offer-state-page">
        <div className="bank-payment-offer-state-copy">
          <h2>{t("bankPaymentOfferRejectedTitle")}</h2>
          <BankPaymentAmount
            canCycle={Boolean(entry.info.amountSat)}
            text={amountText}
          />
          <p className="muted">
            {t("bankPaymentOfferRejectedDescription").replace(
              "{name}",
              requesterName,
            )}
          </p>
        </div>
        <button type="button" className="btn-wide" onClick={closeOffer}>
          {t("chatImageBackToChat")}
        </button>
      </section>
    );
  }

  if (entry.info.status === "accepted_by_other") {
    return (
      <section className="panel panel-plain bank-payment-offer-state-page">
        <div className="bank-payment-offer-state-copy">
          <h2>{t("bankPaymentOfferStatusAcceptedByOther")}</h2>
          <p className="muted">{t("bankPaymentOfferAcceptedByOther")}</p>
        </div>
        <button type="button" className="btn-wide" onClick={closeOffer}>
          {t("close")}
        </button>
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
      (getLinkyBankPaymentOfferExpiresAtSec(
        entry.info,
        Number(entry.message.createdAtSec ?? 0),
      ) ?? Math.floor(nowMs / 1_000)) - Math.floor(nowMs / 1_000);

    return (
      <section className="panel panel-plain bank-payment-offer-state-page">
        <div className="bank-payment-offer-state-copy">
          <RequesterIntro
            amountText={amountText}
            canCycleAmount={Boolean(entry.info.amountSat)}
            requesterName={requesterName}
            status={entry.info.status}
            t={t}
          />
          {timerWithExtension(entry, remainingSec)}
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

  const expiresAtSec = getLinkyBankPaymentOfferExpiresAtSec(
    entry.info,
    Number(entry.message.createdAtSec ?? 0),
  );
  const remainingSec = expiresAtSec
    ? expiresAtSec - Math.floor(nowMs / 1_000)
    : null;

  if (entry.info.status === "bank_paid") {
    const attachConfirmation = async (file: File) => {
      if (isAttachingConfirmation) return;

      const rejectionKey = getChatAttachmentRejection(file);
      if (rejectionKey) {
        setErrorText(t(rejectionKey));
        return;
      }
      setErrorText(null);
      setPendingConfirmation({
        fileName: file.name,
        imageUrl: file.type.startsWith("image/")
          ? URL.createObjectURL(file)
          : null,
      });
      setIsAttachingConfirmation(true);
      try {
        await onSendChatImage(file, entry.message);
      } finally {
        setIsAttachingConfirmation(false);
      }
    };

    return (
      <section className="panel panel-plain bank-payment-offer-state-page">
        <div className="bank-payment-offer-state-copy">
          <h2>{t("bankPaymentOfferWaitingForSatsTitle")}</h2>
          <BankPaymentAmount
            canCycle={Boolean(entry.info.amountSat)}
            text={amountText}
          />
          <RecipientProgress status={entry.info.status} t={t} />
        </div>

        {confirmation ? (
          <PaymentConfirmation confirmation={confirmation} t={t} />
        ) : pendingConfirmation ? (
          <PendingPaymentConfirmation pending={pendingConfirmation} t={t} />
        ) : (
          <>
            <input
              ref={confirmationInputRef}
              className="chat-image-input"
              type="file"
              accept="image/*,application/pdf,.pdf"
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
          </>
        )}

        <div className="bank-payment-offer-state-copy">
          <p className="muted">
            {t("bankPaymentOfferWaitingForSatsDescription").replace(
              "{name}",
              requesterName,
            )}
          </p>
          {remainingSec !== null
            ? timerWithExtension(entry, remainingSec)
            : null}
        </div>
        {errorText ? <p className="bank-payment-error">{errorText}</p> : null}
      </section>
    );
  }

  if (!payment) {
    return (
      <section className="panel panel-plain bank-payment-offer-state-page">
        <div className="bank-payment-offer-state-copy">
          <RequesterIntro
            amountText={amountText}
            canCycleAmount={Boolean(entry.info.amountSat)}
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
          {remainingSec !== null
            ? timerWithExtension(entry, remainingSec)
            : null}
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
          canCycleAmount={Boolean(entry.info.amountSat)}
          requesterName={requesterName}
          status={entry.info.status}
          t={t}
        />
        {remainingSec !== null ? timerWithExtension(entry, remainingSec) : null}
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

      {/* Confirming the payment must stay reachable without scrolling past
          the QR, so the field rows hide behind a toggle below. */}
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

      <button
        type="button"
        className="btn-wide secondary bank-payment-offer-details-toggle"
        aria-expanded={showPaymentRows}
        onClick={() => setShowPaymentRows((current) => !current)}
      >
        <span className="btn-label-with-icon">
          <span className="btn-label-icon" aria-hidden="true">
            {showPaymentRows ? <ChevronUp /> : <ChevronDown />}
          </span>
          <span>{t("bankPaymentOfferDetails")}</span>
        </span>
      </button>

      {showPaymentRows ? (
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
                  <span className="transaction-detail-copyText">
                    {row.value}
                  </span>
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
      ) : null}

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
