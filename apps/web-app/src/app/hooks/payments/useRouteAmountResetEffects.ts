import React from "react";
import type { ContactId } from "../../../evolu";
import type { Route } from "../../../types/route";

interface UseRouteAmountResetEffectsParams {
  contactPayBackToChatRef: React.MutableRefObject<ContactId | null>;
  routeKind: Route["kind"];
  setContactPaymentIntent: React.Dispatch<
    React.SetStateAction<"pay" | "request">
  >;
  setLnAddressPayAmount: React.Dispatch<React.SetStateAction<string>>;
  setPayAmount: React.Dispatch<React.SetStateAction<string>>;
}

export const useRouteAmountResetEffects = ({
  contactPayBackToChatRef,
  routeKind,
  setContactPaymentIntent,
  setLnAddressPayAmount,
  setPayAmount,
}: UseRouteAmountResetEffectsParams): void => {
  React.useEffect(() => {
    // Reset pay amount when leaving the pay page.
    if (routeKind !== "contactPay") {
      contactPayBackToChatRef.current = null;
      setContactPaymentIntent("pay");
      setPayAmount("");
    }
  }, [
    contactPayBackToChatRef,
    routeKind,
    setContactPaymentIntent,
    setPayAmount,
  ]);

  React.useEffect(() => {
    if (routeKind !== "lnAddressPay") {
      setLnAddressPayAmount("");
    }
  }, [routeKind, setLnAddressPayAmount]);
};
