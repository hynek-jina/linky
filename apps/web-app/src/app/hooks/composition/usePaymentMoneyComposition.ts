import type { MoneyRoutesProps } from "../../routes/AppRouteContent";
import { buildMoneyRouteProps } from "../../routes/props/buildMoneyRouteProps";
import { useMemoizedRouteBuilder } from "./useMemoizedRouteBundle";

interface UsePaymentMoneyCompositionParams {
  moneyRouteBuilderInput: Parameters<typeof buildMoneyRouteProps>[0];
}

export interface PaymentMoneyCompositionResult {
  moneyRouteProps: MoneyRoutesProps;
}

export const usePaymentMoneyComposition = ({
  moneyRouteBuilderInput,
}: UsePaymentMoneyCompositionParams): PaymentMoneyCompositionResult => {
  return {
    moneyRouteProps: useMemoizedRouteBuilder(
      moneyRouteBuilderInput,
      buildMoneyRouteProps,
    ),
  };
};
