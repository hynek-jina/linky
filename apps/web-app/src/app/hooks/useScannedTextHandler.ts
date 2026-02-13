import type { OwnerId } from "@evolu/common";
import * as Evolu from "@evolu/common";
import React from "react";
import type { ContactId } from "../../evolu";
import { navigateTo } from "../../hooks/useRouting";

type EvoluMutations = ReturnType<typeof import("../../evolu").useEvolu>;

interface UseScannedTextHandlerParams<
  TContact extends { id?: unknown; lnAddress?: unknown; npub?: unknown },
> {
  appOwnerId: OwnerId | null;
  closeScan: () => void;
  contacts: readonly TContact[];
  extractCashuTokenFromText: (text: string) => string | null;
  insert: EvoluMutations["insert"];
  openScannedContactPendingNpubRef: React.MutableRefObject<string | null>;
  payLightningInvoiceWithCashu: (invoice: string) => Promise<void>;
  refreshContactFromNostr: (
    id: ContactId,
    npubOverride: string,
  ) => Promise<void>;
  saveCashuFromText: (
    text: string,
    options?: { navigateToWallet?: boolean },
  ) => Promise<void>;
  setStatus: React.Dispatch<React.SetStateAction<string | null>>;
  t: (key: string) => string;
}

export const useScannedTextHandler = <
  TContact extends { id?: unknown; lnAddress?: unknown; npub?: unknown },
>({
  appOwnerId,
  closeScan,
  contacts,
  extractCashuTokenFromText,
  insert,
  openScannedContactPendingNpubRef,
  payLightningInvoiceWithCashu,
  refreshContactFromNostr,
  saveCashuFromText,
  setStatus,
  t,
}: UseScannedTextHandlerParams<TContact>) => {
  return React.useCallback(
    async (rawValue: string) => {
      const raw = String(rawValue ?? "").trim();
      if (!raw) return;

      const normalized = raw
        .replace(/^nostr:/i, "")
        .replace(/^lightning:/i, "")
        .replace(/^cashu:/i, "")
        .trim();

      const cashu =
        extractCashuTokenFromText(normalized) ?? extractCashuTokenFromText(raw);
      if (cashu) {
        closeScan();
        await saveCashuFromText(cashu, { navigateToWallet: true });
        return;
      }

      try {
        const { nip19 } = await import("nostr-tools");
        const decoded = nip19.decode(normalized);
        if (decoded.type === "npub") {
          const already = contacts.some(
            (contact) => String(contact.npub ?? "").trim() === normalized,
          );
          if (already) {
            setStatus(t("contactExists"));
            const existing = contacts.find(
              (contact) => String(contact.npub ?? "").trim() === normalized,
            );
            closeScan();
            if (existing?.id) {
              navigateTo({ route: "contact", id: existing.id as ContactId });
              void refreshContactFromNostr(
                existing.id as ContactId,
                normalized,
              );
            }
            return;
          }

          const result = appOwnerId
            ? insert(
                "contact",
                {
                  name: null,
                  npub: normalized as typeof Evolu.NonEmptyString1000.Type,
                  lnAddress: null,
                  groupName: null,
                },
                { ownerId: appOwnerId },
              )
            : insert("contact", {
                name: null,
                npub: normalized as typeof Evolu.NonEmptyString1000.Type,
                lnAddress: null,
                groupName: null,
              });

          if (result.ok) {
            setStatus(t("contactSaved"));
            openScannedContactPendingNpubRef.current = normalized;
          } else setStatus(`${t("errorPrefix")}: ${String(result.error)}`);

          closeScan();
          return;
        }
      } catch {
        // ignore
      }

      const maybeLnAddress = String(normalized ?? "").trim();
      const isLnAddress = /^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$/.test(maybeLnAddress);
      if (isLnAddress) {
        const needle = maybeLnAddress.toLowerCase();
        const existing = contacts.find(
          (contact) =>
            String(contact.lnAddress ?? "")
              .trim()
              .toLowerCase() === needle,
        );

        closeScan();
        if (existing?.id) {
          navigateTo({ route: "contactPay", id: existing.id as ContactId });
          return;
        }

        // New address: open pay screen and offer to save contact after success.
        navigateTo({ route: "lnAddressPay", lnAddress: maybeLnAddress });
        return;
      }

      if (/^(lnbc|lntb|lnbcrt)/i.test(normalized)) {
        closeScan();
        await payLightningInvoiceWithCashu(normalized);
        return;
      }

      setStatus(`${t("errorPrefix")}: ${t("scanUnsupported")}`);
      closeScan();
    },
    [
      appOwnerId,
      closeScan,
      contacts,
      extractCashuTokenFromText,
      insert,
      payLightningInvoiceWithCashu,
      refreshContactFromNostr,
      saveCashuFromText,
      setStatus,
      t,
      openScannedContactPendingNpubRef,
    ],
  );
};
