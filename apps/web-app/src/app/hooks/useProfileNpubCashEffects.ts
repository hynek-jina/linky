import React from "react";
import type { JsonValue } from "../../types/json";
import { normalizeMintUrl } from "../../utils/mint";
import { asRecord } from "../../utils/validation";

interface UseProfileNpubCashEffectsParams {
  claimNpubCashOnce: () => Promise<void>;
  claimNpubCashOnceLatestRef: React.MutableRefObject<() => Promise<void>>;
  currentNpub: string | null;
  currentNsec: string | null;
  hasMintOverrideRef: React.MutableRefObject<boolean>;
  makeNip98AuthHeader: (url: string, method: "GET" | "POST") => Promise<string>;
  npubCashInfoInFlightRef: React.MutableRefObject<boolean>;
  npubCashInfoLoadedAtMsRef: React.MutableRefObject<number>;
  npubCashInfoLoadedForNpubRef: React.MutableRefObject<string | null>;
  profileQrIsOpen: boolean;
  routeKind: string;
  setDefaultMintUrl: React.Dispatch<React.SetStateAction<string | null>>;
  setDefaultMintUrlDraft: React.Dispatch<React.SetStateAction<string>>;
  setIsProfileEditing: React.Dispatch<React.SetStateAction<boolean>>;
  setMyProfileQr: React.Dispatch<React.SetStateAction<string | null>>;
}

export const useProfileNpubCashEffects = ({
  claimNpubCashOnce,
  claimNpubCashOnceLatestRef,
  currentNpub,
  currentNsec,
  hasMintOverrideRef,
  makeNip98AuthHeader,
  npubCashInfoInFlightRef,
  npubCashInfoLoadedAtMsRef,
  npubCashInfoLoadedForNpubRef,
  profileQrIsOpen,
  routeKind,
  setDefaultMintUrl,
  setDefaultMintUrlDraft,
  setIsProfileEditing,
  setMyProfileQr,
}: UseProfileNpubCashEffectsParams) => {
  React.useEffect(() => {
    // Leave edit mode when leaving the profile screen.
    if (routeKind !== "profile" && !profileQrIsOpen) {
      setIsProfileEditing(false);
    }
  }, [routeKind, profileQrIsOpen, setIsProfileEditing]);

  const showProfileQr = profileQrIsOpen || routeKind === "profile";

  React.useEffect(() => {
    // Generate QR code for the current npub when profile QR is visible.
    if (!showProfileQr) {
      setMyProfileQr(null);
      return;
    }
    if (!currentNpub) {
      setMyProfileQr(null);
      return;
    }

    let cancelled = false;

    const run = async () => {
      try {
        const QRCode = await import("qrcode");
        const url = await QRCode.toDataURL(currentNpub, {
          margin: 1,
          width: 240,
        });
        if (cancelled) return;
        setMyProfileQr(url);
      } catch {
        if (cancelled) return;
        setMyProfileQr(null);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [showProfileQr, currentNpub, setMyProfileQr]);

  React.useEffect(() => {
    // npub.cash integration:
    // - read default mint (preferred mint) for the user
    // - auto-claim pending payments and store them as Cashu tokens
    // Always active when we have Nostr keys so payments to the derived
    // `${npub}@npub.cash` keep working even if the user sets a custom address.
    if (!currentNpub) return;
    if (!currentNsec) return;

    let cancelled = false;
    const baseUrl = "https://npub.cash";
    const infoController = new AbortController();

    const loadInfo = async () => {
      if (npubCashInfoInFlightRef.current) return;
      const nowMs = Date.now();
      if (
        npubCashInfoLoadedForNpubRef.current === currentNpub &&
        nowMs - npubCashInfoLoadedAtMsRef.current < 10 * 60_000
      ) {
        return;
      }

      npubCashInfoInFlightRef.current = true;
      try {
        const url = `${baseUrl}/api/v1/info`;
        const auth = await makeNip98AuthHeader(url, "GET");
        const res = await fetch(url, {
          method: "GET",
          headers: { Authorization: auth },
          signal: infoController.signal,
        });
        if (!res.ok) return;
        const data = (await res.json()) as JsonValue;
        const mintUrl = (() => {
          const root = asRecord(data);
          if (!root) return "";

          const direct = String(root.mintUrl ?? "").trim();
          if (direct) return direct;

          const wrapped = asRecord(root.data);
          if (!wrapped) return "";
          return String(wrapped.mintUrl ?? wrapped.mintURL ?? "").trim();
        })();
        if (cancelled) return;
        if (mintUrl && !hasMintOverrideRef.current) {
          const cleaned = normalizeMintUrl(mintUrl);
          if (cleaned) {
            setDefaultMintUrl(cleaned);
            setDefaultMintUrlDraft(cleaned);
          }
        }

        npubCashInfoLoadedForNpubRef.current = currentNpub;
        npubCashInfoLoadedAtMsRef.current = Date.now();
      } catch {
        // ignore
      } finally {
        npubCashInfoInFlightRef.current = false;
      }
    };

    const claimOnce = async () => {
      if (cancelled) return;
      await claimNpubCashOnceLatestRef.current();
    };

    void loadInfo();
    void claimOnce();

    const intervalId = window.setInterval(() => {
      void claimOnce();
    }, 30_000);

    return () => {
      cancelled = true;
      infoController.abort();
      window.clearInterval(intervalId);
    };
  }, [
    claimNpubCashOnceLatestRef,
    currentNpub,
    currentNsec,
    hasMintOverrideRef,
    makeNip98AuthHeader,
    npubCashInfoInFlightRef,
    npubCashInfoLoadedAtMsRef,
    npubCashInfoLoadedForNpubRef,
    setDefaultMintUrl,
    setDefaultMintUrlDraft,
  ]);

  React.useEffect(() => {
    // While user is looking at the top-up invoice, poll more frequently so we
    // detect the paid invoice quickly.
    if (routeKind !== "topupInvoice") return;

    void claimNpubCashOnce();
    const intervalId = window.setInterval(() => {
      void claimNpubCashOnce();
    }, 5_000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [claimNpubCashOnce, routeKind]);

  return {
    showProfileQr,
  };
};
