import React from "react";
import { Check, Copy, Landmark, Share2 } from "lucide-react";
import { useAppShellCore } from "../app/context/AppShellContexts";
import {
  LINKY_BANK_PAYMENT_OFFER_PHASE_TTL_SEC,
  getLinkyBankPaymentOfferInfo,
  getLinkyBankPaymentOfferStatusRank,
  type LinkyBankPaymentOfferInfo,
  type LinkyBankPaymentOfferStatus,
} from "../app/lib/bankPaymentOffer";
import type { LocalNostrMessage } from "../app/types/appTypes";
import { navigateTo } from "../hooks/useRouting";
import {
  openSpdPaymentInBank,
  shareSpdPaymentQrJpeg,
  tryParseSpdPayment,
  type SpdPayment,
} from "../utils/spdPayment";

interface BankPaymentOfferDetailPageProps {
  bankPaymentOfferMessages: LocalNostrMessage[];
  chatId: string;
  offerId: string;
  onCopyText: (text: string) => void;
  onRespondBankPaymentOffer: (
    message: LocalNostrMessage,
    nextStatus: Exclude<LinkyBankPaymentOfferStatus, "offered">,
  ) => Promise<boolean>;
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
  offerId,
  onCopyText,
  onRespondBankPaymentOffer,
  t,
}) => {
  const { formatDisplayedAmountText } = useAppShellCore();
  const [qrDataUrl, setQrDataUrl] = React.useState<string | null>(null);
  const [isOpening, setIsOpening] = React.useState(false);
  const [isSharingJpeg, setIsSharingJpeg] = React.useState(false);
  const [isConfirmingPaid, setIsConfirmingPaid] = React.useState(false);
  const [errorText, setErrorText] = React.useState<string | null>(null);
  const [nowMs, setNowMs] = React.useState(() => Date.now());
  const entry = React.useMemo(
    () => findOfferEntry(bankPaymentOfferMessages, chatId, offerId),
    [bankPaymentOfferMessages, chatId, offerId],
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

  if (!entry || !payment) {
    return (
      <section className="panel panel-plain bank-payment-page">
        <p className="muted bank-payment-hint">{t("spdPaymentInvalid")}</p>
      </section>
    );
  }

  const amountText = entry.info.amountSat
    ? formatDisplayedAmountText(entry.info.amountSat)
    : entry.info.amountText;
  const remainingSec = hasTimedPhase(entry.info.status)
    ? getEntryTime(entry) +
      LINKY_BANK_PAYMENT_OFFER_PHASE_TTL_SEC -
      Math.floor(nowMs / 1000)
    : null;
  const remainingTimeText =
    remainingSec === null ? null : formatRemainingTime(remainingSec, t);
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
      if (sent) {
        navigateTo({ route: "chat", id: chatId });
        return;
      }
      setErrorText(t("spdPaymentOfferFailed"));
    } finally {
      setIsConfirmingPaid(false);
    }
  };

  return (
    <section className="panel panel-plain bank-payment-page bank-payment-offer-detail-page">
      <div className="bank-payment-summary">
        <div className="bank-payment-amount">{amountText}</div>
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
