import React from "react";
import { useAppShellCore } from "../app/context/AppShellContexts";

interface AmountDisplayProps {
  amount: string;
}

export function AmountDisplay({
  amount,
}: AmountDisplayProps): React.ReactElement {
  const { formatDisplayedAmountParts } = useAppShellCore();
  const amountSat = Number.parseInt(amount.trim(), 10);
  const display = Number.isFinite(amountSat) && amountSat > 0 ? amountSat : 0;
  const displayAmount = formatDisplayedAmountParts(display);

  return (
    <div className="amount-display" aria-live="polite">
      <span className="amount-number">
        {displayAmount.approxPrefix}
        {displayAmount.amountText}
      </span>
      <span className="amount-unit">{displayAmount.unitLabel}</span>
    </div>
  );
}
