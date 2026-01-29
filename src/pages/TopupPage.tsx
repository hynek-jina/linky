import type { FC } from "react";
import { useNavigation } from "../hooks/useRouting";
import { AmountDisplay } from "../components/AmountDisplay";
import { Keypad } from "../components/Keypad";

interface TopupPageProps {
  currentNpub: string | null;
  displayUnit: string;
  effectiveProfileName: string | null;
  effectiveProfilePicture: string | null;
  formatInteger: (val: number) => string;
  formatMiddleDots: (str: string, maxLen: number) => string;
  formatShortNpub: (npub: string) => string;
  getInitials: (name: string) => string;
  npubCashLightningAddress: string | null;
  setTopupAmount: (value: string | ((prev: string) => string)) => void;
  t: (key: string) => string;
  topupAmount: string;
  topupInvoiceIsBusy: boolean;
}

export const TopupPage: FC<TopupPageProps> = ({
  currentNpub,
  displayUnit,
  effectiveProfileName,
  effectiveProfilePicture,
  formatInteger,
  formatMiddleDots,
  formatShortNpub,
  getInitials,
  npubCashLightningAddress,
  setTopupAmount,
  t,
  topupAmount,
  topupInvoiceIsBusy,
}) => {
  const navigateTo = useNavigation();
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
            navigateTo({ route: "topupInvoice" });
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
