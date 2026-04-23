import React from "react";
import type { ContactId } from "../../../evolu";
import type { Route } from "../../../types/route";

interface UseRouteAmountResetEffectsParams {
  contactPayBackToChatRef: React.MutableRefObject<ContactId | null>;
  contactsHeaderVisible: boolean;
  routeKind: Route["kind"];
  setContactPaymentIntent: React.Dispatch<
    React.SetStateAction<"pay" | "request">
  >;
  setLnAddressPayAmount: React.Dispatch<React.SetStateAction<string>>;
  setPayAmount: React.Dispatch<React.SetStateAction<string>>;
}

export const useRouteAmountResetEffects = ({
  contactPayBackToChatRef,
  contactsHeaderVisible,
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
    contactsHeaderVisible,
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
