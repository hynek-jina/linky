import type { FC } from "react";
import { AmountDisplay } from "../components/AmountDisplay";
import { Keypad } from "../components/Keypad";

interface TopupPageProps {
  effectiveProfilePicture: string | null;
  effectiveProfileName: string | null;
  currentNpub: string | null;
  npubCashLightningAddress: string | null;
  topupAmount: string;
  setTopupAmount: (value: string | ((prev: string) => string)) => void;
  topupInvoiceIsBusy: boolean;
  displayUnit: string;
  navigateToTopupInvoice: () => void;
  formatShortNpub: (npub: string) => string;
  formatMiddleDots: (str: string, maxLen: number) => string;
  formatInteger: (val: number) => string;
  getInitials: (name: string) => string;
  t: (key: string) => string;
}

const TopupPage: FC<TopupPageProps> = ({
  effectiveProfilePicture,
  effectiveProfileName,
  currentNpub,
  npubCashLightningAddress,
  topupAmount,
  setTopupAmount,
  topupInvoiceIsBusy,
  displayUnit,
  navigateToTopupInvoice,
  formatShortNpub,
  formatMiddleDots,
  formatInteger,
  getInitials,
  t,
}) => {
  const ln = String(npubCashLightningAddress ?? "").trim();
  const amountSat = Number.parseInt(topupAmount.trim(), 10);
  const invalid =
    !ln || !Number.isFinite(amountSat) || amountSat <= 0 || topupInvoiceIsBusy;

  return (
    <section className="panel">
      <div className="contact-header">
        <div className="contact-avatar is-large" aria-hidden="true">
          {effectiveProfilePicture ? (
            <img
              src={effectiveProfilePicture}
              alt=""
              loading="lazy"
              referrerPolicy="no-referrer"
            />
          ) : (
            <span className="contact-avatar-fallback">
              {getInitials(
                effectiveProfileName ??
                  (currentNpub ? formatShortNpub(currentNpub) : ""),
              )}
            </span>
          )}
        </div>
        <div className="contact-header-text">
          <h3>
            {effectiveProfileName ??
              (currentNpub ? formatShortNpub(currentNpub) : t("appTitle"))}
          </h3>
          <p className="muted" style={{ maxWidth: "100%", overflow: "hidden" }}>
            {formatMiddleDots(String(npubCashLightningAddress ?? ""), 28)}
          </p>
        </div>
      </div>

      <AmountDisplay
        amount={topupAmount}
        displayUnit={displayUnit}
        formatInteger={formatInteger}
      />

      <Keypad
        ariaLabel={`${t("payAmount")} (${displayUnit})`}
        disabled={topupInvoiceIsBusy}
        onKeyPress={(key: string) => {
          if (topupInvoiceIsBusy) return;
          if (key === "C") {
            setTopupAmount("");
            return;
          }
          if (key === "⌫") {
            setTopupAmount((v) => v.slice(0, -1));
            return;
          }
          setTopupAmount((v) => {
            const next = (v + key).replace(/^0+(\d)/, "$1");
            return next;
          });
        }}
        translations={{
          clearForm: t("clearForm"),
          delete: t("delete"),
        }}
      />

      <div className="actions">
        <button
          className="btn-wide"
          onClick={() => {
            if (invalid) return;
            navigateToTopupInvoice();
          }}
          disabled={invalid}
          data-guide="topup-show-invoice"
        >
          {t("topupShowInvoice")}
        </button>
      </div>
    </section>
  );
};

export default TopupPage;
