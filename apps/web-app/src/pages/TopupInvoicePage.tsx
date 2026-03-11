import type { FC } from "react";
import { WalletBalance } from "../components/WalletBalance";

interface TopupInvoicePageProps {
  copyText: (text: string) => Promise<void>;
  t: (key: string) => string;
  topupAmount: string;
  topupInvoice: string | null;
  topupInvoiceError: string | null;
  topupInvoiceIsBusy: boolean;
  topupMintUrl: string | null;
  topupInvoiceQr: string | null;
}

export const TopupInvoicePage: FC<TopupInvoicePageProps> = ({
  copyText,
  t,
  topupAmount,
  topupInvoice,
  topupInvoiceError,
  topupInvoiceIsBusy,
  topupMintUrl,
  topupInvoiceQr,
}) => {
  const amountSat = Number.parseInt(topupAmount.trim(), 10);
  const mintDisplay = String(topupMintUrl ?? "")
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/\/+$/, "");
  const handleCopyInvoice = () => {
    if (!topupInvoice) return;
    void copyText(topupInvoice);
  };

  const copyButton = (
    <button
      type="button"
      className="btn-wide secondary topup-invoice-copy"
      onClick={handleCopyInvoice}
    >
      <span className="btn-label-with-icon">
        <span className="btn-label-icon" aria-hidden="true">
          ⧉
        </span>
        <span>{t("copy")}</span>
      </span>
    </button>
  );

  const loadingMessage = (
    <p className="muted topup-invoice-loading">{t("topupFetchingInvoice")}</p>
  );

  return (
    <section className="panel topup-invoice-panel">
      <div className="topup-invoice-head">
        <div className="topup-invoice-balance">
          <WalletBalance
            ariaLabel={t("topupInvoiceTitle")}
            balance={
              Number.isFinite(amountSat) && amountSat > 0 ? amountSat : 0
            }
          />
        </div>

        {mintDisplay ? (
          <p className="topup-invoice-mint-note">
            Mint:{" "}
            <span className="relay-url topup-invoice-mint-value">
              {mintDisplay}
            </span>
          </p>
        ) : null}
      </div>

      {topupInvoiceQr ? (
        <div className="topup-invoice-qr-shell">
          <button
            type="button"
            className="topup-invoice-qr-button"
            onClick={handleCopyInvoice}
            title={t("copy")}
          >
            <img className="qr topup-invoice-qr" src={topupInvoiceQr} alt="" />
          </button>

          {copyButton}
        </div>
      ) : topupInvoiceError ? (
        <p className="muted">{topupInvoiceError}</p>
      ) : topupInvoice ? (
        <div className="topup-invoice-qr-shell">
          <div className="mono-box" style={{ marginBottom: 12 }}>
            {topupInvoice}
          </div>
          {copyButton}
        </div>
      ) : topupInvoiceIsBusy ? (
        loadingMessage
      ) : (
        loadingMessage
      )}
    </section>
  );
};
