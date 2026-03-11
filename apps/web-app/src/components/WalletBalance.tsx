import React from "react";
import { useAppShellCore } from "../app/context/AppShellContexts";

interface WalletBalanceProps {
  ariaLabel: string;
  balance: number;
}

export const WalletBalance: React.FC<WalletBalanceProps> = ({
  ariaLabel,
  balance,
}) => {
  const { formatDisplayedAmountParts } = useAppShellCore();
  const displayAmount = formatDisplayedAmountParts(balance);

  return (
    <div className="balance-hero" aria-label={ariaLabel}>
      <span className="balance-number">
        {displayAmount.approxPrefix}
        {displayAmount.amountText}
      </span>
      <span className="balance-unit">{displayAmount.unitLabel}</span>
    </div>
  );
};
