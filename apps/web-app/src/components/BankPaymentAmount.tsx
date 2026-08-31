import React from "react";
import {
  useAppShellActions,
  useAppShellCore,
} from "../app/context/AppShellContexts";

interface BankPaymentAmountProps {
  canCycle?: boolean;
  text: string;
}

// The bank payment amount; tapping it switches the display unit like the
// wallet balance does. `canCycle: false` keeps a static amount (no sat value
// to convert) as plain text.
export const BankPaymentAmount: React.FC<BankPaymentAmountProps> = ({
  canCycle = true,
  text,
}) => {
  const { allowedDisplayCurrencies, t } = useAppShellCore();
  const { cycleDisplayCurrency } = useAppShellActions();

  if (!canCycle || allowedDisplayCurrencies.length <= 1) {
    return <div className="bank-payment-amount">{text}</div>;
  }

  return (
    <button
      type="button"
      className="bank-payment-amount bank-payment-amount-button"
      title={t("unitCycleAction")}
      onClick={cycleDisplayCurrency}
    >
      {text}
    </button>
  );
};
