import React from "react";
import {
  useAppShellActions,
  useAppShellCore,
} from "../app/context/AppShellContexts";

interface AmountDisplayProps {
  amount: string;
  cycleOnClick?: boolean;
  inputDisplayValue?: string | null;
}

export function AmountDisplay({
  amount,
  cycleOnClick = false,
  inputDisplayValue = null,
}: AmountDisplayProps): React.ReactElement {
  const { allowedDisplayCurrencies, formatDisplayedAmountParts, lang, t } =
    useAppShellCore();
  const { cycleDisplayCurrency } = useAppShellActions();
  const amountSat = Number.parseInt(amount.trim(), 10);
  const display = Number.isFinite(amountSat) && amountSat > 0 ? amountSat : 0;
  const displayAmount = formatDisplayedAmountParts(display);
  const displayedInputValue =
    inputDisplayValue === null
      ? null
      : lang === "en"
        ? inputDisplayValue
        : inputDisplayValue.replace(".", ",");
  const amountText = displayedInputValue ?? displayAmount.amountText;
  const approxPrefix =
    displayedInputValue === null ||
    Number(displayedInputValue.replace(",", ".")) > 0
      ? displayAmount.approxPrefix
      : "";
  const canCycleCurrency = cycleOnClick && allowedDisplayCurrencies.length > 1;

  if (!canCycleCurrency) {
    return (
      <div className="amount-display" aria-live="polite">
        <span className="amount-number">
          {approxPrefix}
          {amountText}
        </span>
        <span className="amount-unit">{displayAmount.unitLabel}</span>
      </div>
    );
  }

  return (
    <button
      type="button"
      className="amount-display amount-display-button"
      aria-live="polite"
      title={t("unitCycleAction")}
      onClick={cycleDisplayCurrency}
    >
      <span className="amount-number">
        {approxPrefix}
        {amountText}
      </span>
      <span className="amount-unit">{displayAmount.unitLabel}</span>
    </button>
  );
}
