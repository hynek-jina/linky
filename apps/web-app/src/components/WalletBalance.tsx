import React from "react";

interface WalletBalanceProps {
  ariaLabel: string;
  balance: number;
  displayUnit: string;
  formatInteger: (num: number) => string;
}

export const WalletBalance: React.FC<WalletBalanceProps> = ({
  ariaLabel,
  balance,
  displayUnit,
  formatInteger,
}) => {
  return (
    <div className="balance-hero" aria-label={ariaLabel}>
      <span className="balance-number">{formatInteger(balance)}</span>
      <span className="balance-unit">{displayUnit}</span>
    </div>
  );
};
