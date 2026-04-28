import type { OwnerId } from "@evolu/common";
import * as Evolu from "@evolu/common";
import React from "react";
import type { ContactId } from "../../evolu";
import { navigateTo } from "../../hooks/useRouting";
import {
  fetchLnurlWithdrawPreview,
  inferLightningAddressFromLnurlTarget,
  isLightningAddress,
  isLnurlPayTarget,
  isLnurlWithdrawTarget,
  LnurlTagMismatchError,
} from "../../lnurlPay";
import { parseNativeDeepLinkUrl } from "../../utils/deepLinks";
import {
  getLightningInvoicePreview,
  type LightningInvoicePreview,
} from "../../utils/lightningInvoice";
import type { ContactRowLike } from "../types/appTypes";

type EvoluMutations = ReturnType<typeof import("../../evolu").useEvolu>;

interface UseScannedTextHandlerParams<TContact extends ContactRowLike> {
  appOwnerId: OwnerId | null;
  closeScan: () => void;
  contacts: readonly TContact[];
  currentNpub: string | null;
  extractCashuTokenFromText: (text: string) => string | null;
  insert: EvoluMutations["insert"];
  lightningInvoiceAutoPayLimit: number;
  openScannedContactPendingNpubRef: React.MutableRefObject<string | null>;
  payLightningInvoiceWithCashu: (invoice: string) => Promise<boolean>;
  refreshContactFromNostr: (
    id: ContactId,
    npubOverride: string,
  ) => Promise<void>;
  requestLightningInvoiceConfirmation: (
    preview: LightningInvoicePreview,
  ) => void;
  requestLnurlWithdrawConfirmation: (
    preview: import("../../lnurlPay").LnurlWithdrawPreview,
  ) => void;
  saveCashuFromText: (
    text: string,
    options?: { navigateToTokens?: boolean; navigateToWallet?: boolean },
  ) => Promise<void>;
  setStatus: React.Dispatch<React.SetStateAction<string | null>>;
  t: (key: string) => string;
}

export const useScannedTextHandler = <TContact extends ContactRowLike>({
  appOwnerId,
  closeScan,
  contacts,
  currentNpub,
  extractCashuTokenFromText,
  insert,
  lightningInvoiceAutoPayLimit,
  openScannedContactPendingNpubRef,
  payLightningInvoiceWithCashu,
  refreshContactFromNostr,
  requestLightningInvoiceConfirmation,
  requestLnurlWithdrawConfirmation,
  saveCashuFromText,
  setStatus,
  t,
}: UseScannedTextHandlerParams<TContact>) => {
  return React.useCallback(
    async (rawValue: string) => {
      const raw = String(rawValue ?? "").trim();
      if (!raw) return;

      const parsedDeepLink = parseNativeDeepLinkUrl(raw);
      const scanText = String(parsedDeepLink?.text ?? raw).trim();

      const normalized = scanText
        .replace(/^nostr:/i, "")
        .replace(/^lightning:/i, "")
        .replace(/^cashu:/i, "")
        .trim();

      const cashu =
        extractCashuTokenFromText(normalized) ??
        extractCashuTokenFromText(scanText) ??
        extractCashuTokenFromText(raw);
      if (cashu) {
        closeScan();
        await saveCashuFromText(cashu, { navigateToWallet: true });
        return;
      }

      try {
        const { nip19 } = await import("nostr-tools");
        const decoded = nip19.decode(normalized);
        if (decoded.type === "npub") {
          const ownNpub = String(currentNpub ?? "").trim();
          if (ownNpub && ownNpub === normalized) {
            setStatus(t("contactIsYou"));
            closeScan();
            navigateTo({ route: "profile" });
            return;
          }

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
      const isLnAddress = isLightningAddress(maybeLnAddress);
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

      if (isLnurlWithdrawTarget(maybeLnAddress)) {
        try {
          const withdrawPreview =
            await fetchLnurlWithdrawPreview(maybeLnAddress);
          closeScan();
          requestLnurlWithdrawConfirmation(withdrawPreview);
          return;
        } catch (error) {
          if (!(error instanceof LnurlTagMismatchError)) {
            const message =
              error instanceof Error ? error.message : String(error);
            setStatus(`${t("errorPrefix")}: ${message}`);
            closeScan();
            return;
          }
        }
      }

      if (isLnurlPayTarget(maybeLnAddress)) {
        const inferredLnAddress =
          inferLightningAddressFromLnurlTarget(maybeLnAddress);
        const existing = inferredLnAddress
          ? contacts.find(
              (contact) =>
                String(contact.lnAddress ?? "")
                  .trim()
                  .toLowerCase() === inferredLnAddress.toLowerCase(),
            )
          : null;

        closeScan();
        if (existing?.id) {
          navigateTo({ route: "contactPay", id: existing.id as ContactId });
          return;
        }
        navigateTo({ route: "lnAddressPay", lnAddress: maybeLnAddress });
        return;
      }

      if (/^(lnbc|lntb|lnbcrt)/i.test(normalized)) {
        const preview = getLightningInvoicePreview(normalized);
        closeScan();

        if (
          preview !== null &&
          preview.amountSat !== null &&
          preview.amountSat <= lightningInvoiceAutoPayLimit
        ) {
          await payLightningInvoiceWithCashu(normalized);
          return;
        }

        requestLightningInvoiceConfirmation(
          preview ?? {
            invoice: normalized,
            amountSat: null,
            description: null,
            expiresAtSec: null,
          },
        );
        return;
      }

      setStatus(`${t("errorPrefix")}: ${t("scanUnsupported")}`);
      closeScan();
    },
    [
      appOwnerId,
      closeScan,
      contacts,
      currentNpub,
      extractCashuTokenFromText,
      insert,
      lightningInvoiceAutoPayLimit,
      payLightningInvoiceWithCashu,
      refreshContactFromNostr,
      requestLightningInvoiceConfirmation,
      requestLnurlWithdrawConfirmation,
      saveCashuFromText,
      setStatus,
      t,
      openScannedContactPendingNpubRef,
    ],
  );
};
