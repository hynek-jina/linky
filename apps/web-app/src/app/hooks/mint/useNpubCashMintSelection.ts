import React from "react";
import {
  CASHU_DEFAULT_MINT_OVERRIDE_STORAGE_KEY,
  normalizeMintUrl,
} from "../../../utils/mint";
import { safeLocalStorageSet } from "../../../utils/storage";

interface UseNpubCashMintSelectionParams {
  currentNpub: string | null;
  currentNsec: string | null;
  defaultMintUrl: string | null;
  defaultMintUrlDraft: string;
  hasMintOverrideRef: React.RefObject<boolean>;
  makeLocalStorageKey: (prefix: string) => string;
  npubCashMintSyncRef: React.RefObject<string | null>;
  pushToast: (message: string) => void;
  setDefaultMintUrl: React.Dispatch<React.SetStateAction<string | null>>;
  setDefaultMintUrlDraft: React.Dispatch<React.SetStateAction<string>>;
  setStatus: React.Dispatch<React.SetStateAction<string | null>>;
  t: (key: string) => string;
}

export const useNpubCashMintSelection = ({
  currentNpub,
  currentNsec,
  defaultMintUrl,
  defaultMintUrlDraft,
  hasMintOverrideRef,
  makeLocalStorageKey,
  npubCashMintSyncRef,
  pushToast,
  setDefaultMintUrl,
  setDefaultMintUrlDraft,
  setStatus,
  t,
}: UseNpubCashMintSelectionParams) => {
  React.useEffect(() => {
    if (!defaultMintUrl) return;
    const draft = String(defaultMintUrlDraft ?? "").trim();
    if (draft) return;
    setDefaultMintUrlDraft(normalizeMintUrl(defaultMintUrl));
  }, [defaultMintUrl, defaultMintUrlDraft, setDefaultMintUrlDraft]);

  const makeNip98AuthHeader = React.useCallback(
    async (url: string, method: string, payload?: Record<string, string>) => {
      if (!currentNsec) throw new Error("Missing nsec");
      const { nip19, nip98, finalizeEvent } = await import("nostr-tools");
      const decoded = nip19.decode(currentNsec);
      if (decoded.type !== "nsec") throw new Error("Invalid nsec");
      const privBytes = decoded.data as Uint8Array;

      const token = await nip98.getToken(
        url,
        method,
        async (event) => finalizeEvent(event, privBytes),
        true,
        payload,
      );
      return token;
    },
    [currentNsec],
  );

  const updateNpubCashMint = React.useCallback(
    async (mintUrl: string): Promise<void> => {
      if (!currentNpub) throw new Error("Missing npub");
      if (!currentNsec) throw new Error("Missing nsec");
      const cleaned = normalizeMintUrl(mintUrl);
      if (!cleaned) return;

      const baseUrl = "https://npub.cash";
      const url = `${baseUrl}/api/v1/info/mint`;

      const payload = { mintUrl: cleaned };
      const auth = await makeNip98AuthHeader(url, "PUT", payload);
      const res = await fetch(url, {
        method: "PUT",
        headers: {
          Authorization: auth,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        throw new Error("npub.cash mint update failed");
      }
    },
    [currentNpub, currentNsec, makeNip98AuthHeader],
  );

  const applyDefaultMintSelection = React.useCallback(
    async (mintUrl: string): Promise<void> => {
      const cleaned = normalizeMintUrl(mintUrl);
      if (!cleaned) {
        pushToast(t("mintUrlInvalid"));
        return;
      }
      try {
        new URL(cleaned);
      } catch {
        pushToast(t("mintUrlInvalid"));
        return;
      }

      try {
        setStatus(t("mintUpdating"));
        await updateNpubCashMint(cleaned);
      } catch (error) {
        const message = String(error ?? "");
        if (message.includes("Missing nsec")) {
          pushToast(t("profileMissingNpub"));
        } else {
          pushToast(t("mintUpdateFailed"));
        }
      }

      const key = makeLocalStorageKey(CASHU_DEFAULT_MINT_OVERRIDE_STORAGE_KEY);
      safeLocalStorageSet(key, cleaned);
      hasMintOverrideRef.current = true;
      setDefaultMintUrl(cleaned);
      setDefaultMintUrlDraft(cleaned);
      npubCashMintSyncRef.current = cleaned;
      setStatus(t("mintSaved"));
    },
    [
      hasMintOverrideRef,
      makeLocalStorageKey,
      npubCashMintSyncRef,
      pushToast,
      setDefaultMintUrl,
      setDefaultMintUrlDraft,
      setStatus,
      t,
      updateNpubCashMint,
    ],
  );

  React.useEffect(() => {
    const cleaned = normalizeMintUrl(defaultMintUrl ?? "");
    if (!cleaned) return;
    if (!hasMintOverrideRef.current) return;
    if (npubCashMintSyncRef.current === cleaned) return;

    npubCashMintSyncRef.current = cleaned;
    void updateNpubCashMint(cleaned).catch(() => {
      npubCashMintSyncRef.current = null;
    });
  }, [
    defaultMintUrl,
    hasMintOverrideRef,
    npubCashMintSyncRef,
    updateNpubCashMint,
  ]);

  return {
    applyDefaultMintSelection,
    makeNip98AuthHeader,
  };
};
