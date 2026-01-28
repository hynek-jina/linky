import React from "react";

interface AmountDisplayProps {
  amount: string;
  displayUnit: string;
  formatInteger: (value: number) => string;
}

export function AmountDisplay({
  amount,
  displayUnit,
  formatInteger,
}: AmountDisplayProps): React.ReactElement {
  const amountSat = Number.parseInt(amount.trim(), 10);
  const display = Number.isFinite(amountSat) && amountSat > 0 ? amountSat : 0;

  return (
    <div className="amount-display" aria-live="polite">
      <span className="amount-number">{formatInteger(display)}</span>
      <span className="amount-unit">{displayUnit}</span>
    </div>
  );
}
