import React from "react";
import { useAppShellCore } from "../app/context/AppShellContexts";

interface AmountInputDraft {
  amountSat: string;
  displayCurrency: string;
  displayValue: string;
}

interface UseAmountInputKeypadParams {
  amount: string;
  onAmountChange: (amount: string) => void;
}

interface UseAmountInputKeypadResult {
  decimalKeyEnabled: boolean;
  inputDisplayValue: string | null;
  onKeyPress: (key: string) => void;
}

export const useAmountInputKeypad = ({
  amount,
  onAmountChange,
}: UseAmountInputKeypadParams): UseAmountInputKeypadResult => {
  const {
    applyAmountInputKeyWithDraft,
    decimalAmountInputKeyVisible,
    displayCurrency,
  } = useAppShellCore();
  const [draft, setDraft] = React.useState<AmountInputDraft | null>(null);
  const currentDisplayValue =
    draft?.amountSat === amount && draft.displayCurrency === displayCurrency
      ? draft.displayValue
      : null;

  const onKeyPress = React.useCallback(
    (key: string) => {
      const result = applyAmountInputKeyWithDraft(
        amount,
        currentDisplayValue,
        key,
      );
      setDraft({
        amountSat: result.amountSat,
        displayCurrency,
        displayValue: result.displayValue,
      });
      onAmountChange(result.amountSat);
    },
    [
      amount,
      applyAmountInputKeyWithDraft,
      currentDisplayValue,
      displayCurrency,
      onAmountChange,
    ],
  );

  return {
    decimalKeyEnabled: decimalAmountInputKeyVisible,
    inputDisplayValue: decimalAmountInputKeyVisible
      ? currentDisplayValue
      : null,
    onKeyPress,
  };
};
