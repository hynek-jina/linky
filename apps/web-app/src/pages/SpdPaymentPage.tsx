import React from "react";
import { useAppShellCore } from "../app/context/AppShellContexts";
import { useFiatRates } from "../app/hooks/useFiatRates";
import {
  LINKY_BANK_PAYMENT_OFFER_MAX_STAGGER_DELAY_SEC,
  LINKY_BANK_PAYMENT_OFFER_MIN_STAGGER_DELAY_SEC,
  LINKY_BANK_PAYMENT_OFFER_STAGGER_DELAY_STEP_SEC,
} from "../app/lib/bankPaymentOffer";
import { BankPaymentAmount } from "../components/BankPaymentAmount";
import { SettingsStepper } from "../components/SettingsStepper";
import { navigateTo } from "../hooks/useRouting";
import type { FiatRates } from "../utils/displayAmounts";
import { formatInteger, getInitials } from "../utils/formatting";
import { tryParseBankPayment, type BankPayment } from "../utils/spdPayment";

interface SpdPaymentPageProps {
  cashuBalanceAfterMelt: number;
  initialOfferContactCount: number;
  initialOfferDelaySec: number;
  offerContacts: {
    id?: unknown;
    lastBankPaymentResponseSec?: unknown;
    name?: unknown;
    npub?: unknown;
    pictureUrl?: unknown;
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
    staggerDelaySec: number;
  }) => Promise<{ chatId: string; offerId: string } | null>;
  spdPayload: string;
  t: (key: string) => string;
}

interface SpdPaymentFieldRow {
  key: string;
  label: string;
  value: string;
}

const getSpdField = (payment: BankPayment, key: string): string =>
  String(payment.fields[key] ?? "").trim();

const SATS_PER_BTC = 100_000_000;

const getOfferContactKey = (contact: {
  id?: unknown;
  npub?: unknown;
}): string => {
  const id = String(contact.id ?? "").trim();
  if (id) return `id:${id}`;
  return `npub:${String(contact.npub ?? "").trim()}`;
};

// Selection keeps insertion order: the offer is extended to recipients in
// this order when a stagger delay is set.
const getInitialOfferContactKeys = (
  contacts: SpdPaymentPageProps["offerContacts"],
  count: number,
): string[] =>
  contacts.slice(0, Math.max(0, count)).map(getOfferContactKey).filter(Boolean);

const clampOfferDelaySec = (value: number): number => {
  if (!Number.isFinite(value))
    return LINKY_BANK_PAYMENT_OFFER_MIN_STAGGER_DELAY_SEC;
  return Math.min(
    LINKY_BANK_PAYMENT_OFFER_MAX_STAGGER_DELAY_SEC,
    Math.max(LINKY_BANK_PAYMENT_OFFER_MIN_STAGGER_DELAY_SEC, Math.trunc(value)),
  );
};

const formatResponseDuration = (durationSec: number): string => {
  const safeDurationSec = Math.max(0, Math.trunc(durationSec));
  const minutes = Math.floor(safeDurationSec / 60);
  const seconds = safeDurationSec % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
};

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
  payment: BankPayment,
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

const buildSpdRows = (
  payment: BankPayment,
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
  addRow("BIC", t("spdPaymentBic"));
  addRow("RF", t("spdPaymentReference"));
  addRow("X-VS", t("spdPaymentVariableSymbol"));
  addRow("X-SS", t("spdPaymentSpecificSymbol"));
  addRow("X-KS", t("spdPaymentConstantSymbol"));
  addRow("MSG", t("spdPaymentMessage"));
  addRow("DT", t("spdPaymentDueDate"));

  return rows;
};

export const SpdPaymentPage: React.FC<SpdPaymentPageProps> = ({
  cashuBalanceAfterMelt,
  initialOfferContactCount,
  initialOfferDelaySec,
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
  const [hasEditedOfferContacts, setHasEditedOfferContacts] =
    React.useState(false);
  const previousSpdPayloadRef = React.useRef(spdPayload);
  const [selectedOfferContactKeys, setSelectedOfferContactKeys] =
    React.useState<string[]>(() =>
      getInitialOfferContactKeys(offerContacts, initialOfferContactCount),
    );
  const [offerDelaySec, setOfferDelaySec] = React.useState<number>(() =>
    clampOfferDelaySec(initialOfferDelaySec),
  );
  const payment = React.useMemo(
    () => tryParseBankPayment(spdPayload),
    [spdPayload],
  );
  const selectedOfferContacts = React.useMemo(
    () =>
      selectedOfferContactKeys.flatMap((key) => {
        const contact = offerContacts.find(
          (candidate) => getOfferContactKey(candidate) === key,
        );
        return contact ? [contact] : [];
      }),
    [offerContacts, selectedOfferContactKeys],
  );

  React.useEffect(() => {
    const paymentChanged = previousSpdPayloadRef.current !== spdPayload;
    if (!paymentChanged && hasEditedOfferContacts) return;
    previousSpdPayloadRef.current = spdPayload;
    if (paymentChanged) setHasEditedOfferContacts(false);
    setSelectedOfferContactKeys(
      getInitialOfferContactKeys(offerContacts, initialOfferContactCount),
    );
  }, [
    hasEditedOfferContacts,
    initialOfferContactCount,
    offerContacts,
    spdPayload,
  ]);

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
  const offerContactsCount = selectedOfferContacts.length;
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

  const requestReimbursement = async () => {
    if (
      selectedOfferContacts.length === 0 ||
      !amountText ||
      !hasEnoughCashuForProxy ||
      isRequestingOffer
    ) {
      return;
    }

    setIsRequestingOffer(true);
    setOfferStatus(null);
    try {
      const offer = await onRequestReimbursement({
        amountSat,
        amountText,
        contacts: selectedOfferContacts,
        spdPayload: payment.payload,
        staggerDelaySec: offerDelaySec,
      });
      if (offer) {
        navigateTo({
          route: "bankPaymentOffer",
          chatId: offer.chatId,
          offerId: offer.offerId,
        });
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
        <BankPaymentAmount
          canCycle={Boolean(amountText)}
          text={amountText || t("spdPaymentAmountUnknown")}
        />
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
          selectedOfferContacts.length === 0 ||
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

      <div className="bank-payment-offer-delay">
        <span className="bank-payment-offer-delay-label">
          {t("bankPaymentOfferStaggerDelay")}
        </span>
        <SettingsStepper
          ariaLabel={t("bankPaymentOfferStaggerDelay")}
          decreaseLabel={t("bankPaymentOfferStaggerDelayDecrease")}
          increaseLabel={t("bankPaymentOfferStaggerDelayIncrease")}
          max={LINKY_BANK_PAYMENT_OFFER_MAX_STAGGER_DELAY_SEC}
          min={LINKY_BANK_PAYMENT_OFFER_MIN_STAGGER_DELAY_SEC}
          onChange={(value) => setOfferDelaySec(clampOfferDelaySec(value))}
          step={LINKY_BANK_PAYMENT_OFFER_STAGGER_DELAY_STEP_SEC}
          value={offerDelaySec}
          valueText={`${offerDelaySec} s`}
        />
      </div>

      {offerContacts.length > 0 ? (
        <div className="bank-payment-offer-contact-list">
          {offerContacts.map((contact) => {
            const key = getOfferContactKey(contact);
            const lastBankPaymentResponseSec =
              typeof contact.lastBankPaymentResponseSec === "number" &&
              Number.isFinite(contact.lastBankPaymentResponseSec) &&
              contact.lastBankPaymentResponseSec >= 0
                ? contact.lastBankPaymentResponseSec
                : null;
            const name = String(contact.name ?? "").trim();
            const npub = String(contact.npub ?? "").trim();
            const pictureUrl = String(contact.pictureUrl ?? "").trim();
            const orderIndex = selectedOfferContactKeys.indexOf(key);
            const isSelected = orderIndex !== -1;

            return (
              <button
                type="button"
                className={
                  isSelected
                    ? "bank-payment-offer-contact is-selected"
                    : "bank-payment-offer-contact"
                }
                key={key}
                aria-label={name || npub || t("contact")}
                aria-pressed={isSelected}
                onClick={() => {
                  setHasEditedOfferContacts(true);
                  setSelectedOfferContactKeys((current) =>
                    // A re-added contact joins the end of the queue.
                    current.includes(key)
                      ? current.filter((candidate) => candidate !== key)
                      : [...current, key],
                  );
                }}
              >
                {/* The badge lives outside .contact-avatar, whose
                    overflow:hidden would clip it. */}
                <span
                  className="bank-payment-offer-contact-avatar"
                  aria-hidden="true"
                >
                  <span className="contact-avatar">
                    {pictureUrl ? (
                      <img
                        src={pictureUrl}
                        alt=""
                        loading="lazy"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <span className="contact-avatar-fallback">
                        {getInitials(name)}
                      </span>
                    )}
                  </span>
                  {isSelected ? (
                    <span className="bank-payment-offer-contact-order">
                      {orderIndex + 1}
                    </span>
                  ) : null}
                </span>
                <span className="contact-name">{name || t("contact")}</span>
                {lastBankPaymentResponseSec !== null ? (
                  <span className="bank-payment-offer-contact-response">
                    {t("spdPaymentLastResponseTime").replace(
                      "{time}",
                      formatResponseDuration(lastBankPaymentResponseSec),
                    )}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}

      {offerStatus ? (
        <p className="muted bank-payment-offer-status">{offerStatus}</p>
      ) : null}
    </section>
  );
};
