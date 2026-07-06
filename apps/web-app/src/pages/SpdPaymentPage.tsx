import React from "react";
import { Landmark, Share2 } from "lucide-react";
import { useAppShellCore } from "../app/context/AppShellContexts";
import { useFiatRates } from "../app/hooks/useFiatRates";
import { navigateTo } from "../hooks/useRouting";
import type { FiatRates } from "../utils/displayAmounts";
import { formatInteger } from "../utils/formatting";
import {
  openSpdPaymentInBank,
  shareSpdPaymentQrJpeg,
  tryParseSpdPayment,
  type SpdPayment,
} from "../utils/spdPayment";

interface SpdPaymentPageProps {
  cashuBalanceAfterMelt: number;
  offerContacts: {
    id?: unknown;
    name?: unknown;
    npub?: unknown;
  }[];
  onRequestReimbursement: (args: {
    amountSat: number | null;
    amountText: string;
    contacts: {
      id?: unknown;
      name?: unknown;
      npub?: unknown;
    }[];
    spdPayload: string;
  }) => Promise<boolean>;
  spdPayload: string;
  t: (key: string) => string;
}

interface SpdPaymentFieldRow {
  key: string;
  label: string;
  value: string;
}

const getSpdField = (payment: SpdPayment, key: string): string =>
  String(payment.fields[key] ?? "").trim();

const SATS_PER_BTC = 100_000_000;

const getRateForCurrency = (
  currency: string,
  fiatRates: FiatRates,
): number | null => {
  switch (currency.toUpperCase()) {
    case "CHF":
      return fiatRates.chfPerBtc;
    case "CZK":
      return fiatRates.czkPerBtc;
    case "EUR":
      return fiatRates.eurPerBtc;
    case "USD":
      return fiatRates.usdPerBtc;
    default:
      return null;
  }
};

const parseSpdAmount = (value: string): number | null => {
  const normalized = value.trim().replace(/\s/g, "").replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(normalized)) return null;

  const amount = Number.parseFloat(normalized);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return amount;
};

const getSpdAmountSat = (
  payment: SpdPayment,
  fiatRates: FiatRates | null,
): number | null => {
  const amount = parseSpdAmount(getSpdField(payment, "AM"));
  if (amount === null) return null;

  const currency = getSpdField(payment, "CC").toUpperCase();
  if (currency === "SAT" || currency === "SATS") {
    return Math.round(amount);
  }

  if (!fiatRates) return null;

  const rate = getRateForCurrency(currency, fiatRates);
  if (rate === null || rate <= 0) return null;

  const amountSat = Math.round((amount / rate) * SATS_PER_BTC);
  return Number.isFinite(amountSat) && amountSat > 0 ? amountSat : null;
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

const buildSpdRows = (
  payment: SpdPayment,
  t: (key: string) => string,
): SpdPaymentFieldRow[] => {
  const rows: SpdPaymentFieldRow[] = [];
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

export const SpdPaymentPage: React.FC<SpdPaymentPageProps> = ({
  cashuBalanceAfterMelt,
  offerContacts,
  onRequestReimbursement,
  spdPayload,
  t,
}) => {
  const { displayCurrency, displayUnit, formatDisplayedAmountText, lang } =
    useAppShellCore();
  const fiatRates = useFiatRates();
  const [isRequestingOffer, setIsRequestingOffer] = React.useState(false);
  const [offerStatus, setOfferStatus] = React.useState<string | null>(null);
  const [isOpening, setIsOpening] = React.useState(false);
  const [isSharingJpeg, setIsSharingJpeg] = React.useState(false);
  const [openError, setOpenError] = React.useState<string | null>(null);
  const payment = React.useMemo(
    () => tryParseSpdPayment(spdPayload),
    [spdPayload],
  );

  if (!payment) {
    return (
      <section className="panel panel-plain bank-payment-page">
        <p className="muted bank-payment-hint">{t("spdPaymentInvalid")}</p>
      </section>
    );
  }

  const amount = parseSpdAmount(getSpdField(payment, "AM"));
  const currency = getSpdField(payment, "CC").toLowerCase();
  const amountSat = getSpdAmountSat(payment, fiatRates);
  const amountText =
    displayCurrency === "hidden" && amount !== null
      ? "*****"
      : amount !== null && currency === displayCurrency
        ? `~${formatInteger(Math.round(amount), lang)} ${displayUnit}`
        : amountSat === null
          ? ""
          : formatDisplayedAmountText(amountSat);
  const recipient = getSpdField(payment, "RN");
  const rows = buildSpdRows(payment, t);
  const offerContactsCount = offerContacts.length;
  const hasEnoughCashuForProxy =
    amountSat !== null && amountSat <= cashuBalanceAfterMelt;
  const requestReimbursementLabel = !hasEnoughCashuForProxy
    ? t("payInsufficient")
    : offerContactsCount === 0
      ? t("spdPaymentNoOfferContact")
      : offerContactsCount === 1
        ? t("spdPaymentRequestReimbursementCountOne")
        : t("spdPaymentRequestReimbursementCountOther").replace(
            "{count}",
            String(offerContactsCount),
          );

  const openInBank = async () => {
    if (isOpening) return;

    setIsOpening(true);
    setOpenError(null);
    try {
      await openSpdPaymentInBank(payment.payload);
    } catch (error) {
      setOpenError(getOpenErrorText(error, t));
    } finally {
      setIsOpening(false);
    }
  };

  const openWithJpeg = async () => {
    if (isSharingJpeg) return;

    setIsSharingJpeg(true);
    setOpenError(null);
    try {
      await shareSpdPaymentQrJpeg(payment.payload);
    } catch (error) {
      setOpenError(getOpenErrorText(error, t));
    } finally {
      setIsSharingJpeg(false);
    }
  };

  const requestReimbursement = async () => {
    if (
      offerContacts.length === 0 ||
      !amountText ||
      !hasEnoughCashuForProxy ||
      isRequestingOffer
    ) {
      return;
    }

    setIsRequestingOffer(true);
    setOfferStatus(null);
    try {
      const sent = await onRequestReimbursement({
        amountSat,
        amountText,
        contacts: offerContacts,
        spdPayload: payment.payload,
      });
      if (sent) {
        navigateTo({ route: "wallet" });
        return;
      }
      setOfferStatus(t("spdPaymentOfferFailed"));
    } finally {
      setIsRequestingOffer(false);
    }
  };

  return (
    <section className="panel panel-plain bank-payment-page">
      <div className="bank-payment-summary">
        <div className="bank-payment-amount">
          {amountText || t("spdPaymentAmountUnknown")}
        </div>
        <div className="muted bank-payment-recipient">
          {recipient || t("spdPaymentRecipientUnknown")}
        </div>
      </div>

      <div className="bank-payment-fields">
        {rows.map((row) => (
          <div className="settings-row bank-payment-row" key={row.key}>
            <div>
              <strong>{row.label}</strong>
              <span className="bank-payment-value">{row.value}</span>
            </div>
          </div>
        ))}
      </div>

      <button
        type="button"
        className="btn-wide bank-payment-request"
        disabled={
          offerContacts.length === 0 ||
          !amountText ||
          !hasEnoughCashuForProxy ||
          isRequestingOffer
        }
        title={!hasEnoughCashuForProxy ? t("payInsufficient") : undefined}
        onClick={() => {
          void requestReimbursement();
        }}
      >
        {isRequestingOffer
          ? t("spdPaymentOfferSending")
          : requestReimbursementLabel}
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

      {offerStatus ? (
        <p className="muted bank-payment-offer-status">{offerStatus}</p>
      ) : null}
      {openError ? <p className="bank-payment-error">{openError}</p> : null}
    </section>
  );
};
