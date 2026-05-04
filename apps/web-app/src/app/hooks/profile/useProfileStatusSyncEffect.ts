import React from "react";
import {
  fetchNostrGeneralStatus,
  loadCachedNostrGeneralStatus,
  saveCachedNostrGeneralStatus,
} from "../../../nostrStatus";

interface UseProfileStatusSyncEffectParams {
  currentNpub: string | null;
  nostrFetchRelays: string[];
  setMyProfileStatus: React.Dispatch<React.SetStateAction<string | null>>;
}

export const useProfileStatusSyncEffect = ({
  currentNpub,
  nostrFetchRelays,
  setMyProfileStatus,
}: UseProfileStatusSyncEffectParams) => {
  React.useEffect(() => {
    if (!currentNpub) return;

    const cached = loadCachedNostrGeneralStatus(currentNpub);
    if (cached) {
      setMyProfileStatus(cached.status);
    }

    const controller = new AbortController();
    let cancelled = false;

    const run = async () => {
      try {
        const status = await fetchNostrGeneralStatus(currentNpub, {
          signal: controller.signal,
          relays: nostrFetchRelays,
        });
        saveCachedNostrGeneralStatus(currentNpub, status);
        if (cancelled) return;
        setMyProfileStatus(status);
      } catch {
        // ignore
      }
    };

    void run();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [currentNpub, nostrFetchRelays, setMyProfileStatus]);
};
