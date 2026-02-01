import { useEffect, useState } from "react";
import type { CashuTokenId, ContactId, CredoTokenId } from "../evolu";
import { parseRouteFromHash, type Route } from "../types/route";

export const useRouting = () => {
  const [route, setRoute] = useState<Route>(() => parseRouteFromHash());

  useEffect(() => {
    const onHashChange = () => setRoute(parseRouteFromHash());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  return route;
};

// Navigation types
type NavigationAction =
  | { route: "advanced" }
  | { route: "cashuToken"; id: CashuTokenId }
  | { route: "cashuTokenNew" }
  | { route: "chat"; id: ContactId }
  | { route: "contact"; id: ContactId }
  | { route: "contactEdit"; id: ContactId }
  | { route: "contactNew" }
  | { route: "contactPay"; id: ContactId }
  | { route: "contacts" }
  | { route: "credoToken"; id: CredoTokenId }
  | { route: "evoluCurrentData" }
  | { route: "evoluData" }
  | { route: "evoluHistoryData" }
  | { route: "evoluServer"; id: string }
  | { route: "evoluServerNew" }
  | { route: "evoluServers" }
  | { route: "lnAddressPay"; lnAddress: string }
  | { route: "mint"; mintUrl: string }
  | { route: "mints" }
  | { route: "nostrRelay"; id: string }
  | { route: "nostrRelayNew" }
  | { route: "nostrRelays" }
  | { route: "paymentsHistory" }
  | { route: "profile" }
  | { route: "settings" }
  | { route: "topup" }
  | { route: "topupInvoice" }
  | { route: "wallet" };

export const navigateTo = (action: NavigationAction): void => {
  switch (action.route) {
    case "contacts":
      window.location.assign("#");
      break;
    case "settings":
      window.location.assign("#settings");
      break;
    case "advanced":
      window.location.assign("#advanced");
      break;
    case "paymentsHistory":
      window.location.assign("#advanced/payments");
      break;
    case "mints":
      window.location.assign("#advanced/mints");
      break;
    case "mint":
      window.location.assign(
        `#advanced/mint/${encodeURIComponent(String(action.mintUrl ?? "").trim())}`,
      );
      break;
    case "contact":
      window.location.assign(
        `#contact/${encodeURIComponent(String(action.id))}`,
      );
      break;
    case "contactEdit":
      window.location.assign(
        `#contact/${encodeURIComponent(String(action.id))}/edit`,
      );
      break;
    case "contactPay":
      window.location.assign(
        `#contact/${encodeURIComponent(String(action.id))}/pay`,
      );
      break;
    case "chat":
      window.location.assign(`#chat/${encodeURIComponent(String(action.id))}`);
      break;
    case "contactNew":
      window.location.assign("#contact/new");
      break;
    case "wallet":
      window.location.assign("#wallet");
      break;
    case "topup":
      window.location.assign("#wallet/topup");
      break;
    case "topupInvoice":
      window.location.assign("#wallet/topup/invoice");
      break;
    case "lnAddressPay":
      window.location.assign(
        `#payln/${encodeURIComponent(String(action.lnAddress))}`,
      );
      break;
    case "cashuTokenNew":
      window.location.assign("#wallet/token/new");
      break;
    case "cashuToken":
      window.location.assign(
        `#wallet/token/${encodeURIComponent(String(action.id as unknown as string))}`,
      );
      break;
    case "credoToken":
      window.location.assign(
        `#wallet/credo/${encodeURIComponent(String(action.id as unknown as string))}`,
      );
      break;
    case "profile":
      window.location.assign("#profile");
      break;
    case "nostrRelays":
      window.location.assign("#nostr-relays");
      break;
    case "nostrRelay":
      window.location.assign(`#nostr-relay/${encodeURIComponent(action.id)}`);
      break;
    case "nostrRelayNew":
      window.location.assign("#nostr-relay/new");
      break;
    case "evoluServers":
      window.location.assign("#evolu-servers");
      break;
    case "evoluData":
      window.location.assign("#evolu-data");
      break;
    case "evoluCurrentData":
      window.location.assign("#evolu-current-data");
      break;
    case "evoluHistoryData":
      window.location.assign("#evolu-history-data");
      break;
    case "evoluServer":
      window.location.assign(
        `#evolu-server/${encodeURIComponent(String(action.id))}`,
      );
      break;
    case "evoluServerNew":
      window.location.assign("#evolu-server/new");
      break;
  }
};

export const useNavigation = () => navigateTo;
