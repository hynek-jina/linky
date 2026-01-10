import type { CashuTokenId, ContactId } from "../evolu";

export type Route =
  | { kind: "contacts" }
  | { kind: "settings" }
  | { kind: "advanced" }
  | { kind: "paymentsHistory" }
  | { kind: "profile" }
  | { kind: "wallet" }
  | { kind: "topup" }
  | { kind: "topupInvoice" }
  | { kind: "cashuTokenNew" }
  | { kind: "cashuToken"; id: CashuTokenId }
  | { kind: "nostrRelays" }
  | { kind: "nostrRelay"; id: string }
  | { kind: "nostrRelayNew" }
  | { kind: "contactNew" }
  | { kind: "contact"; id: ContactId }
  | { kind: "contactEdit"; id: ContactId }
  | { kind: "contactPay"; id: ContactId }
  | { kind: "chat"; id: ContactId };

export const parseRouteFromHash = (): Route => {
  const hash = globalThis.location?.hash ?? "";
  if (hash === "#") return { kind: "contacts" };
  if (hash === "#settings") return { kind: "settings" };
  if (hash === "#advanced") return { kind: "advanced" };
  if (hash === "#advanced/payments") return { kind: "paymentsHistory" };
  if (hash === "#profile") return { kind: "profile" };
  if (hash === "#wallet") return { kind: "wallet" };
  if (hash === "#wallet/topup") return { kind: "topup" };
  if (hash === "#wallet/topup/invoice") return { kind: "topupInvoice" };
  if (hash === "#wallet/token/new") return { kind: "cashuTokenNew" };

  const walletTokenPrefix = "#wallet/token/";
  if (hash.startsWith(walletTokenPrefix)) {
    const rest = hash.slice(walletTokenPrefix.length);
    const id = decodeURIComponent(String(rest ?? "")).trim();
    if (id) return { kind: "cashuToken", id: id as CashuTokenId };
  }
  if (hash === "#nostr-relays") return { kind: "nostrRelays" };
  if (hash === "#nostr-relay/new") return { kind: "nostrRelayNew" };

  const relayPrefix = "#nostr-relay/";
  if (hash.startsWith(relayPrefix)) {
    const rest = hash.slice(relayPrefix.length);
    const id = decodeURIComponent(String(rest ?? "")).trim();
    if (id) return { kind: "nostrRelay", id };
  }

  const chatPrefix = "#chat/";
  if (hash.startsWith(chatPrefix)) {
    const rest = hash.slice(chatPrefix.length);
    const id = decodeURIComponent(String(rest ?? "")).trim();
    if (id) return { kind: "chat", id: id as ContactId };
  }

  if (hash === "#contact/new") return { kind: "contactNew" };

  const contactPrefix = "#contact/";
  if (hash.startsWith(contactPrefix)) {
    const rest = hash.slice(contactPrefix.length);
    const [rawId, rawSub] = rest.split("/");
    const id = decodeURIComponent(String(rawId ?? "")).trim();
    const sub = String(rawSub ?? "").trim();

    if (id) {
      if (sub === "edit") return { kind: "contactEdit", id: id as ContactId };
      if (sub === "pay") return { kind: "contactPay", id: id as ContactId };
      return { kind: "contact", id: id as ContactId };
    }
  }

  return { kind: "contacts" };
};
