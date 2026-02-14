import React from "react";
import type { ContactId } from "../../../evolu";
import type { Route } from "../../../types/route";

interface UseRouteAmountResetEffectsParams {
  contactPayBackToChatRef: React.MutableRefObject<ContactId | null>;
  contactsHeaderVisible: boolean;
  routeKind: Route["kind"];
  setLnAddressPayAmount: React.Dispatch<React.SetStateAction<string>>;
  setPayAmount: React.Dispatch<React.SetStateAction<string>>;
}

export const useRouteAmountResetEffects = ({
  contactPayBackToChatRef,
  contactsHeaderVisible,
  routeKind,
  setLnAddressPayAmount,
  setPayAmount,
}: UseRouteAmountResetEffectsParams): void => {
  React.useEffect(() => {
    // Reset pay amount when leaving the pay page.
    if (routeKind !== "contactPay") {
      contactPayBackToChatRef.current = null;
      setPayAmount("");
    }
  }, [contactPayBackToChatRef, contactsHeaderVisible, routeKind, setPayAmount]);

  React.useEffect(() => {
    if (routeKind !== "lnAddressPay") {
      setLnAddressPayAmount("");
    }
  }, [routeKind, setLnAddressPayAmount]);
};
