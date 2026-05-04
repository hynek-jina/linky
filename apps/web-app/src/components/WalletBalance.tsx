import React from "react";
import {
  useAppShellActions,
  useAppShellCore,
} from "../app/context/AppShellContexts";

interface WalletBalanceProps {
  ariaLabel: string;
  balance: number;
}

export const WalletBalance: React.FC<WalletBalanceProps> = ({
  ariaLabel,
  balance,
}) => {
  const { allowedDisplayCurrencies, formatDisplayedAmountParts, t } =
    useAppShellCore();
  const { cycleDisplayCurrency } = useAppShellActions();
  const displayAmount = formatDisplayedAmountParts(balance);
  const canCycleCurrency = allowedDisplayCurrencies.length > 1;

  if (!canCycleCurrency) {
    return (
      <div className="balance-hero" aria-label={ariaLabel}>
        <span className="balance-number">
          {displayAmount.approxPrefix}
          {displayAmount.amountText}
        </span>
        <span className="balance-unit">{displayAmount.unitLabel}</span>
      </div>
    );
  }

  return (
    <button
      type="button"
      className="balance-hero balance-hero-button"
      aria-label={ariaLabel}
      title={t("unitCycleAction")}
      onClick={cycleDisplayCurrency}
    >
      <span className="balance-number">
        {displayAmount.approxPrefix}
        {displayAmount.amountText}
      </span>
      <span className="balance-unit">{displayAmount.unitLabel}</span>
    </button>
  );
};
