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
      const currentNsec = await readStoredNostrNsec();
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
