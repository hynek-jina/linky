import type { FC } from "react";
import { AmountDisplay } from "../components/AmountDisplay";
import { Keypad } from "../components/Keypad";

interface LnAddressPayPageProps {
  canPayWithCashu: boolean;
  cashuBalance: number;
  cashuIsBusy: boolean;
  displayUnit: string;
  formatInteger: (val: number) => string;
  formatMiddleDots: (str: string, maxLen: number) => string;
  lnAddress: string;
  lnAddressPayAmount: string;
  payLightningAddressWithCashu: (
    lnAddress: string,
    amountSat: number,
  ) => Promise<void>;
  setLnAddressPayAmount: (value: string | ((prev: string) => string)) => void;
  t: (key: string) => string;
}

export const LnAddressPayPage: FC<LnAddressPayPageProps> = ({
  canPayWithCashu,
  cashuBalance,
  cashuIsBusy,
  displayUnit,
  formatInteger,
  formatMiddleDots,
  lnAddress,
  lnAddressPayAmount,
  payLightningAddressWithCashu,
  setLnAddressPayAmount,
  t,
}) => {
  const amountSat = Number.parseInt(lnAddressPayAmount.trim(), 10);
  const invalid =
    !canPayWithCashu ||
    !Number.isFinite(amountSat) ||
    amountSat <= 0 ||
    amountSat > cashuBalance;

  return (
    <section className="panel">
      <div className="contact-header">
        <div className="contact-avatar is-large" aria-hidden="true">
          <span className="contact-avatar-fallback">⚡</span>
        </div>
        <div className="contact-header-text">
          <h3>{t("payTo")}</h3>
          <p className="muted">{formatMiddleDots(lnAddress, 36)}</p>
          <p className="muted">
            {t("availablePrefix")} {formatInteger(cashuBalance)} {displayUnit}
          </p>
        </div>
      </div>

      {!canPayWithCashu && <p className="muted">{t("payInsufficient")}</p>}

      <AmountDisplay
        amount={lnAddressPayAmount}
        displayUnit={displayUnit}
        formatInteger={formatInteger}
      />

      <Keypad
        ariaLabel={`${t("payAmount")} (${displayUnit})`}
        disabled={cashuIsBusy}
        onKeyPress={(key: string) => {
          if (cashuIsBusy) return;
          if (key === "C") {
            setLnAddressPayAmount("");
            return;
          }
          if (key === "⌫") {
            setLnAddressPayAmount((v) => v.slice(0, -1));
            return;
          }
          setLnAddressPayAmount((v) => {
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
            void payLightningAddressWithCashu(lnAddress, amountSat);
          }}
          disabled={cashuIsBusy || invalid}
          title={amountSat > cashuBalance ? t("payInsufficient") : undefined}
        >
          {t("paySend")}
        </button>
      </div>
    </section>
  );
};
