import React from "react";
import {
  openSpdPaymentInBank,
  tryParseSpdPayment,
  type SpdPayment,
} from "../utils/spdPayment";

interface SpdPaymentPageProps {
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

const getSpdAmountText = (payment: SpdPayment): string => {
  const amount = getSpdField(payment, "AM");
  const currency = getSpdField(payment, "CC");
  return [amount, currency].filter(Boolean).join(" ");
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
  addRow("AM", t("spdPaymentAmount"));
  addRow("CC", t("spdPaymentCurrency"));
  addRow("X-VS", t("spdPaymentVariableSymbol"));
  addRow("X-SS", t("spdPaymentSpecificSymbol"));
  addRow("X-KS", t("spdPaymentConstantSymbol"));
  addRow("MSG", t("spdPaymentMessage"));
  addRow("DT", t("spdPaymentDueDate"));

  return rows;
};

export const SpdPaymentPage: React.FC<SpdPaymentPageProps> = ({
  spdPayload,
  t,
}) => {
  const [isOpening, setIsOpening] = React.useState(false);
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

  const amountText = getSpdAmountText(payment);
  const recipient = getSpdField(payment, "RN");
  const rows = buildSpdRows(payment, t);

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
        className="btn-wide bank-payment-open"
        disabled={isOpening}
        onClick={() => {
          void openInBank();
        }}
      >
        {isOpening ? t("spdPaymentOpening") : t("spdPaymentOpenInBank")}
      </button>

      <p className="muted bank-payment-hint">{t("spdPaymentOpenHint")}</p>
      {openError ? <p className="bank-payment-error">{openError}</p> : null}
    </section>
  );
};
