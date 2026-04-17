import type { Dispatch, FC, SetStateAction } from "react";
import { useAppShellCore } from "../app/context/AppShellContexts";
import { AmountDisplay } from "../components/AmountDisplay";
import { Keypad } from "../components/Keypad";

interface CashuTokenEmitPageProps {
  cashuBalance: number;
  cashuEmitAmount: string;
  cashuIsBusy: boolean;
  displayUnit: string;
  emitCashuToken: () => Promise<void>;
  setCashuEmitAmount: Dispatch<SetStateAction<string>>;
  t: (key: string) => string;
}

export const CashuTokenEmitPage: FC<CashuTokenEmitPageProps> = ({
  cashuBalance,
  cashuEmitAmount,
  cashuIsBusy,
  displayUnit,
  emitCashuToken,
  setCashuEmitAmount,
  t,
}) => {
  const { applyAmountInputKey, formatDisplayedAmountText } = useAppShellCore();
  const amountSat = Number.parseInt(cashuEmitAmount.trim(), 10);
  const invalid =
    !Number.isFinite(amountSat) ||
    amountSat <= 0 ||
    amountSat > cashuBalance ||
    cashuIsBusy;

  return (
    <section className="panel">
      <div className="contact-header">
        <div className="contact-header-text">
          <h3>{t("cashuEmit")}</h3>
          <p className="muted">
            {t("availablePrefix")} {formatDisplayedAmountText(cashuBalance)}
          </p>
        </div>
      </div>

      <AmountDisplay amount={cashuEmitAmount} />

      <Keypad
        ariaLabel={`${t("payAmount")} (${displayUnit})`}
        disabled={cashuIsBusy}
        onKeyPress={(key: string) => {
          if (cashuIsBusy) return;
          setCashuEmitAmount((value) => applyAmountInputKey(value, key));
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
            void emitCashuToken();
          }}
          disabled={invalid}
          title={amountSat > cashuBalance ? t("payInsufficient") : undefined}
        >
          {t("cashuEmit")}
        </button>
      </div>
    </section>
  );
};
