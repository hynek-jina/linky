import React from "react";
import type { Route } from "../../../types/route";

interface UseContactPayMethodParams {
  allowPromisesEnabled: boolean;
  payWithCashuEnabled: boolean;
  routeKind: Route["kind"];
  selectedContactLnAddress: string;
  selectedContactNpub: string;
  setContactPayMethod: React.Dispatch<
    React.SetStateAction<null | "cashu" | "lightning">
  >;
}

export const useContactPayMethod = ({
  allowPromisesEnabled,
  payWithCashuEnabled,
  routeKind,
  selectedContactLnAddress,
  selectedContactNpub,
  setContactPayMethod,
}: UseContactPayMethodParams): void => {
  React.useEffect(() => {
    if (routeKind !== "contactPay") {
      setContactPayMethod(null);
      return;
    }

    const npub = String(selectedContactNpub ?? "").trim();
    const ln = String(selectedContactLnAddress ?? "").trim();
    const canUseCashu =
      (payWithCashuEnabled || allowPromisesEnabled) && Boolean(npub);
    const canUseLightning = Boolean(ln);

    // Default: prefer Cashu when possible.
    if (canUseCashu) {
      setContactPayMethod("cashu");
      return;
    }

    if (canUseLightning) {
      setContactPayMethod("lightning");
      return;
    }

    // No usable method; keep a stable default for UI.
    setContactPayMethod("lightning");
  }, [
    allowPromisesEnabled,
    payWithCashuEnabled,
    routeKind,
    selectedContactLnAddress,
    selectedContactNpub,
    setContactPayMethod,
  ]);
};
