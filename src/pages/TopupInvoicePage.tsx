import type { FC } from "react";

interface TopupInvoicePageProps {
  topupAmount: string;
  topupDebug: string | null;
  topupInvoiceQr: string | null;
  topupInvoice: string | null;
  topupInvoiceError: string | null;
  topupInvoiceIsBusy: boolean;
  displayUnit: string;
  copyText: (text: string) => Promise<void>;
  formatInteger: (val: number) => string;
  t: (key: string) => string;
}

const TopupInvoicePage: FC<TopupInvoicePageProps> = ({
  topupAmount,
  topupDebug,
  topupInvoiceQr,
  topupInvoice,
  topupInvoiceError,
  topupInvoiceIsBusy,
  displayUnit,
  copyText,
  formatInteger,
  t,
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
        <img
          className="qr"
          src={topupInvoiceQr}
          alt=""
          onClick={() => {
            if (!topupInvoice) return;
            void copyText(topupInvoice);
          }}
        />
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

export default TopupInvoicePage;
