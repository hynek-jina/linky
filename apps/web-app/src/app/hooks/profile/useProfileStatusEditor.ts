import React from "react";
import { NOSTR_RELAYS } from "../../../nostrProfile";
import {
  buildProfileExchangeStatus,
  parseProfileExchangeStatusCurrencies,
  PROFILE_STATUS_CURRENCIES,
  publishNostrGeneralStatus,
  saveCachedNostrGeneralStatus,
  type ProfileStatusCurrency,
} from "../../../nostrStatus";

interface UseProfileStatusEditorParams {
  currentNpub: string | null;
  currentNsec: string | null;
  myProfileStatus: string | null;
  nostrFetchRelays: string[];
  setMyProfileStatus: React.Dispatch<React.SetStateAction<string | null>>;
  setStatus: React.Dispatch<React.SetStateAction<string | null>>;
  t: (key: string) => string;
}

interface UseProfileStatusEditorResult {
  profileStatusCurrencies: readonly ProfileStatusCurrency[];
  profileStatusIsSaving: boolean;
  selectedProfileStatusCurrencies: readonly ProfileStatusCurrency[];
  toggleProfileStatusCurrency: (
    currency: ProfileStatusCurrency,
  ) => Promise<void>;
}

export const useProfileStatusEditor = ({
  currentNpub,
  currentNsec,
  myProfileStatus,
  nostrFetchRelays,
  setMyProfileStatus,
  setStatus,
  t,
}: UseProfileStatusEditorParams): UseProfileStatusEditorResult => {
  const [profileStatusIsSaving, setProfileStatusIsSaving] =
    React.useState(false);

  const selectedProfileStatusCurrencies = React.useMemo(
    () => parseProfileExchangeStatusCurrencies(myProfileStatus),
    [myProfileStatus],
  );

  const toggleProfileStatusCurrency = React.useCallback(
    async (currency: ProfileStatusCurrency) => {
      if (profileStatusIsSaving) return;
      if (!currentNpub || !currentNsec) {
        setStatus(t("profileMissingNpub"));
        return;
      }

      const currentSelection =
        parseProfileExchangeStatusCurrencies(myProfileStatus);
      const nextSelection = currentSelection.includes(currency)
        ? currentSelection.filter((value) => value !== currency)
        : [...currentSelection, currency];
      const nextStatus = buildProfileExchangeStatus(nextSelection);
      const previousStatus = myProfileStatus;

      setMyProfileStatus(nextStatus);
      setProfileStatusIsSaving(true);

      try {
        const { nip19 } = await import("nostr-tools");
        const decoded = nip19.decode(currentNsec);
        if (decoded.type !== "nsec") throw new Error("Invalid nsec");
        if (!(decoded.data instanceof Uint8Array)) {
          throw new Error("Invalid nsec payload");
        }

        const relaysToUse =
          nostrFetchRelays.length > 0 ? nostrFetchRelays : NOSTR_RELAYS;
        const publish = await publishNostrGeneralStatus({
          privBytes: decoded.data,
          relays: relaysToUse,
          status: nextStatus,
        });

        if (!publish.anySuccess) throw new Error("publish failed");
        saveCachedNostrGeneralStatus(currentNpub, nextStatus);
      } catch (error) {
        setMyProfileStatus(previousStatus);
        setStatus(`${t("errorPrefix")}: ${String(error ?? "unknown")}`);
      } finally {
        setProfileStatusIsSaving(false);
      }
    },
    [
      currentNpub,
      currentNsec,
      myProfileStatus,
      nostrFetchRelays,
      profileStatusIsSaving,
      setMyProfileStatus,
      setStatus,
      t,
    ],
  );

  return {
    profileStatusCurrencies: PROFILE_STATUS_CURRENCIES,
    profileStatusIsSaving,
    selectedProfileStatusCurrencies,
    toggleProfileStatusCurrency,
  };
};
