import type { FC } from "react";
import { formatInteger } from "../utils/formatting";

interface TopupInvoicePageProps {
  copyText: (text: string) => Promise<void>;
  displayUnit: string;
  t: (key: string) => string;
  topupAmount: string;
  topupDebug: string | null;
  topupInvoice: string | null;
  topupInvoiceError: string | null;
  topupInvoiceIsBusy: boolean;
  topupInvoiceQr: string | null;
}

export const TopupInvoicePage: FC<TopupInvoicePageProps> = ({
  copyText,
  displayUnit,
  t,
  topupAmount,
  topupDebug,
  topupInvoice,
  topupInvoiceError,
  topupInvoiceIsBusy,
  topupInvoiceQr,
}) => {
  const amountSat = Number.parseInt(topupAmount.trim(), 10);

  return (
    <section className="panel">
      {Number.isFinite(amountSat) && amountSat > 0 && (
        <p className="muted" style={{ margin: "0 0 10px" }}>
          {t("topupInvoiceAmount")
            .replace("{amount}", formatInteger(amountSat))
            .replace("{unit}", displayUnit)}
        </p>
      )}

      {topupDebug && (
        <p className="muted" style={{ margin: "0 0 8px" }}>
          {topupDebug}
        </p>
      )}

      {topupInvoiceQr ? (
        <button
          type="button"
          className="qr-copy-button"
          onClick={() => {
            if (!topupInvoice) return;
            void copyText(topupInvoice);
          }}
          aria-label={t("copy")}
          title={t("copy")}
        >
          <img className="qr" src={topupInvoiceQr} alt="" />
        </button>
      ) : topupInvoiceError ? (
        <p className="muted">{topupInvoiceError}</p>
      ) : topupInvoice ? (
        <div>
          <div className="mono-box" style={{ marginBottom: 12 }}>
            {topupInvoice}
          </div>
          <button
            type="button"
            className="btn-wide"
            onClick={() => void copyText(topupInvoice)}
          >
            {t("copy")}
          </button>
        </div>
      ) : topupInvoiceIsBusy ? (
        <p className="muted">{t("topupFetchingInvoice")}</p>
      ) : (
        <p className="muted">{t("topupFetchingInvoice")}</p>
      )}
    </section>
  );
};
