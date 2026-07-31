import React from "react";
import { readStoredNostrNsec } from "../../platform/identitySecrets";
import { isNativePlatform } from "../../platform/runtime";
import {
  clearStoredPushNsec,
  setStoredPushNsec,
} from "../../utils/pushNsecStorage";
import { getInitialNostrNsec } from "../../utils/storage";

interface CurrentNsecState {
  currentNsec: string | null;
  isResolved: boolean;
}

const NSEC_RESOLUTION_TIMEOUT_MS = 5_000;

// The whole app renders blank until resolution settles, so a rejected or
// hung native bridge read must fall back to the local snapshot instead of
// leaving the auth gate closed forever.
const readStoredNostrNsecBestEffort = async (
  fallbackNsec: string | null,
): Promise<string | null> => {
  let timeoutId: ReturnType<typeof globalThis.setTimeout> | null = null;
  try {
    return await Promise.race([
      readStoredNostrNsec().catch(() => fallbackNsec),
      new Promise<string | null>((resolve) => {
        timeoutId = globalThis.setTimeout(
          () => resolve(fallbackNsec),
          NSEC_RESOLUTION_TIMEOUT_MS,
        );
      }),
    ]);
  } finally {
    if (timeoutId !== null) globalThis.clearTimeout(timeoutId);
  }
};

export const useCurrentNsec = () => {
  const [state, setState] = React.useState<CurrentNsecState>(() => {
    const currentNsec = getInitialNostrNsec();
    return {
      currentNsec,
      isResolved: !isNativePlatform(),
    };
  });

  React.useEffect(() => {
    let cancelled = false;

    void (async () => {
      const currentNsec = await readStoredNostrNsecBestEffort(
        getInitialNostrNsec(),
      );
      if (cancelled) return;
      setState((previousState) =>
        previousState.isResolved && previousState.currentNsec === currentNsec
          ? previousState
          : { currentNsec, isResolved: true },
      );
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  React.useEffect(() => {
    if (!state.isResolved) return;

    void (async () => {
      try {
        if (state.currentNsec) {
          await setStoredPushNsec(state.currentNsec);
        } else {
          await clearStoredPushNsec();
        }
      } catch {
        // ignore
      }
    })();
  }, [state.currentNsec, state.isResolved]);

  const setCurrentNsec = React.useCallback((currentNsec: string | null) => {
    setState({ currentNsec, isResolved: true });
  }, []);

  return {
    currentNsec: state.currentNsec,
    isResolved: state.isResolved,
    setCurrentNsec,
  };
};
