import { useState, useEffect } from "react";
import { parseRouteFromHash, type Route } from "../types/route";
import type { CashuTokenId, ContactId } from "../evolu";

export const useRouting = () => {
  const [route, setRoute] = useState<Route>(() => parseRouteFromHash());

  useEffect(() => {
    const onHashChange = () => setRoute(parseRouteFromHash());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  return route;
};

// Navigation functions
export const navigateToContacts = () => {
  window.location.assign("#");
};

export const navigateToSettings = () => {
  window.location.assign("#settings");
};

export const navigateToAdvanced = () => {
  window.location.assign("#advanced");
};

export const navigateToContact = (id: ContactId) => {
  window.location.assign(`#contact/${encodeURIComponent(String(id))}`);
};

export const navigateToContactEdit = (id: ContactId) => {
  window.location.assign(`#contact/${encodeURIComponent(String(id))}/edit`);
};

export const navigateToContactPay = (id: ContactId) => {
  window.location.assign(`#contact/${encodeURIComponent(String(id))}/pay`);
};

export const navigateToChat = (id: ContactId) => {
  window.location.assign(`#chat/${encodeURIComponent(String(id))}`);
};

export const navigateToNewContact = () => {
  window.location.assign("#contact/new");
};

export const navigateToWallet = () => {
  window.location.assign("#wallet");
};

export const navigateToCashuTokenNew = () => {
  window.location.assign("#wallet/token/new");
};

export const navigateToCashuToken = (id: CashuTokenId) => {
  window.location.assign(
    `#wallet/token/${encodeURIComponent(String(id as unknown as string))}`
  );
};

export const navigateToProfile = () => {
  window.location.assign("#profile");
};

export const navigateToNostrRelays = () => {
  window.location.assign("#nostr-relays");
};

export const navigateToNostrRelay = (id: string) => {
  window.location.assign(`#nostr-relay/${encodeURIComponent(id)}`);
};

export const navigateToNewRelay = () => {
  window.location.assign("#nostr-relay/new");
};
