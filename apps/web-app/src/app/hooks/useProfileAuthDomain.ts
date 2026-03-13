import * as Evolu from "@evolu/common";
import React from "react";
import { deriveDefaultProfile } from "../../derivedProfile";
import { evolu } from "../../evolu";
import { INITIAL_MNEMONIC_STORAGE_KEY } from "../../mnemonic";
import {
  NOSTR_RELAYS,
  saveCachedProfileMetadata,
  saveCachedProfilePicture,
} from "../../nostrProfile";
import { publishKind0ProfileMetadata } from "../../nostrPublish";
import type { JsonRecord } from "../../types/json";
import {
  CASHU_BIP85_MNEMONIC_STORAGE_KEY,
  NOSTR_NSEC_STORAGE_KEY,
  NOSTR_SLIP39_SEED_STORAGE_KEY,
} from "../../utils/constants";
import {
  clearStoredPushNsec,
  setStoredPushNsec,
} from "../../utils/pushNsecStorage";
import {
  createSlip39Seed,
  deriveCashuBip85MnemonicFromSlip39,
  deriveEvoluOwnerMnemonicFromSlip39,
  deriveNostrKeysFromSlip39,
  looksLikeSlip39Seed,
} from "../../utils/slip39Nostr";

export type OnboardingStep = {
  step: 1 | 2 | 3;
  derivedName: string | null;
  error: string | null;
} | null;

interface UseProfileAuthDomainParams {
  currentNsec: string | null;
  pushToast: (message: string) => void;
  t: (key: string) => string;
}

interface UseProfileAuthDomainResult {
  createNewAccount: () => Promise<void>;
  currentNpub: string | null;
  isSeedLogin: boolean;
  logoutArmed: boolean;
  onboardingIsBusy: boolean;
  onboardingStep: OnboardingStep;
  pasteExistingNsec: () => Promise<void>;
  requestDeriveNostrKeys: () => Promise<void>;
  requestLogout: () => void;
  seedMnemonic: string | null;
  cashuSeedMnemonic: string | null;
  slip39Seed: string | null;
  setOnboardingStep: React.Dispatch<React.SetStateAction<OnboardingStep>>;
}

export const useProfileAuthDomain = ({
  currentNsec,
  pushToast,
  t,
}: UseProfileAuthDomainParams): UseProfileAuthDomainResult => {
  const [currentNpub, setCurrentNpub] = React.useState<string | null>(null);
  const [onboardingIsBusy, setOnboardingIsBusy] = React.useState(false);
  const [onboardingStep, setOnboardingStep] =
    React.useState<OnboardingStep>(null);
  const [seedMnemonic, setSeedMnemonic] = React.useState<string | null>(null);
  const [cashuSeedMnemonic, setCashuSeedMnemonic] = React.useState<
    string | null
  >(() => {
    try {
      const raw = localStorage.getItem(CASHU_BIP85_MNEMONIC_STORAGE_KEY);
      const normalized = String(raw ?? "").trim();
      return normalized || null;
    } catch {
      return null;
    }
  });
  const [slip39Seed, setSlip39Seed] = React.useState<string | null>(() => {
    try {
      const raw = localStorage.getItem(NOSTR_SLIP39_SEED_STORAGE_KEY);
      const normalized = String(raw ?? "").trim();
      return normalized || null;
    } catch {
      return null;
    }
  });
  const [logoutArmed, setLogoutArmed] = React.useState(false);
  const [isSeedLogin, setIsSeedLogin] = React.useState<boolean>(() => {
    try {
      const seed = String(
        localStorage.getItem(NOSTR_SLIP39_SEED_STORAGE_KEY) ?? "",
      ).trim();
      return Boolean(seed);
    } catch {
      return false;
    }
  });
  const decodeNsecPrivateBytes = React.useCallback(async (nsec: string) => {
    const raw = String(nsec ?? "").trim();
    if (!raw) return null;

    try {
      const { nip19 } = await import("nostr-tools");
      const decoded = nip19.decode(raw);
      if (decoded.type !== "nsec") return null;
      if (!(decoded.data instanceof Uint8Array)) return null;
      return decoded.data;
    } catch {
      return null;
    }
  }, []);

  const normalizeSlip39Seed = React.useCallback((value: string): string => {
    return String(value ?? "")
      .toLowerCase()
      .trim()
      .split(/\s+/)
      .filter((word) => word.length > 0)
      .join(" ");
  }, []);

  React.useEffect(() => {
    const nsec = String(currentNsec ?? "").trim();
    if (!nsec) {
      setCurrentNpub(null);
      return;
    }

    let cancelled = false;
    const run = async () => {
      try {
        const { nip19, getPublicKey } = await import("nostr-tools");
        const privBytes = await decodeNsecPrivateBytes(nsec);
        if (!privBytes) return;
        const pubHex = getPublicKey(privBytes);
        const npub = nip19.npubEncode(pubHex);

        if (cancelled) return;
        setCurrentNpub(npub);
      } catch {
        if (cancelled) return;
        setCurrentNpub(null);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [currentNsec, decodeNsecPrivateBytes]);

  const deriveAppMnemonicFromSlip39 = React.useCallback(
    async (seed: string): Promise<Evolu.Mnemonic | null> => {
      const normalizedSeed = String(seed ?? "").trim();
      if (!normalizedSeed) return null;

      const metaMnemonic = await deriveEvoluOwnerMnemonicFromSlip39(
        normalizedSeed,
        "meta",
        0,
      );
      if (!metaMnemonic) return null;

      const parsed = Evolu.Mnemonic.fromUnknown(metaMnemonic);
      if (!parsed.ok) return null;
      return parsed.value;
    },
    [],
  );

  React.useEffect(() => {
    const normalizedSlip39 = String(slip39Seed ?? "").trim();
    setSeedMnemonic(normalizedSlip39 || null);
  }, [slip39Seed]);

  React.useEffect(() => {
    if (!isSeedLogin) return;
    if (cashuSeedMnemonic) return;

    const normalizedSlip39 = String(slip39Seed ?? "").trim();
    if (!normalizedSlip39) return;

    let cancelled = false;
    void (async () => {
      const derived =
        await deriveCashuBip85MnemonicFromSlip39(normalizedSlip39);
      if (!derived || cancelled) return;

      setCashuSeedMnemonic(derived);
      try {
        localStorage.setItem(CASHU_BIP85_MNEMONIC_STORAGE_KEY, derived);
      } catch {
        // ignore
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [cashuSeedMnemonic, isSeedLogin, slip39Seed]);

  const setIdentityFromNsecAndReload = React.useCallback(
    async (
      nsec: string,
      sourceSlip39Seed: string,
      invalidMessageKey: string = "onboardingInvalidSeed",
    ) => {
      const raw = String(nsec ?? "").trim();
      if (!raw) {
        pushToast(t(invalidMessageKey));
        return;
      }

      const normalizedSlip39 = String(sourceSlip39Seed ?? "").trim();
      if (!normalizedSlip39) {
        pushToast(t(invalidMessageKey));
        return;
      }

      const appMnemonic = await deriveAppMnemonicFromSlip39(normalizedSlip39);
      if (!appMnemonic) {
        pushToast(t(invalidMessageKey));
        return;
      }

      const derivedCashuMnemonic =
        await deriveCashuBip85MnemonicFromSlip39(normalizedSlip39);
      if (!derivedCashuMnemonic) {
        pushToast(t(invalidMessageKey));
        return;
      }

      try {
        await setStoredPushNsec(raw);
      } catch {
        // ignore
      }

      try {
        localStorage.setItem(NOSTR_NSEC_STORAGE_KEY, raw);
        localStorage.setItem(NOSTR_SLIP39_SEED_STORAGE_KEY, normalizedSlip39);
        localStorage.setItem(
          CASHU_BIP85_MNEMONIC_STORAGE_KEY,
          derivedCashuMnemonic,
        );
        localStorage.setItem(INITIAL_MNEMONIC_STORAGE_KEY, appMnemonic);
      } catch {
        // ignore
      }

      setIsSeedLogin(true);
      setSlip39Seed(normalizedSlip39);
      setCashuSeedMnemonic(derivedCashuMnemonic);

      try {
        await evolu.restoreAppOwner(appMnemonic, {
          reload: false,
        });
      } catch (e) {
        console.log("[linky][evolu] restoreAppOwner failed", {
          error: String(e ?? "unknown"),
        });
      }

      try {
        window.location.hash = "#";
      } catch {
        // ignore
      }
      globalThis.location.reload();
    },
    [deriveAppMnemonicFromSlip39, pushToast, t],
  );

  React.useEffect(() => {
    if (!isSeedLogin) return;

    const normalizedSeed = String(slip39Seed ?? "").trim();
    if (!normalizedSeed) return;

    const normalizedCurrentNsec = String(currentNsec ?? "").trim();

    let cancelled = false;
    void (async () => {
      const derived = await deriveNostrKeysFromSlip39(normalizedSeed);
      if (!derived || cancelled) return;

      const normalizedDerivedNsec = String(derived.nsec ?? "").trim();
      if (!normalizedDerivedNsec) return;
      if (normalizedDerivedNsec === normalizedCurrentNsec) return;

      await setIdentityFromNsecAndReload(
        normalizedDerivedNsec,
        normalizedSeed,
        "restoreFailed",
      );
    })();

    return () => {
      cancelled = true;
    };
  }, [currentNsec, isSeedLogin, setIdentityFromNsecAndReload, slip39Seed]);

  const createNewAccount = React.useCallback(async () => {
    if (onboardingIsBusy) return;

    setOnboardingIsBusy(true);
    setOnboardingStep({ step: 1, derivedName: null, error: null });
    try {
      const slip39 = await createSlip39Seed();
      if (!slip39) {
        pushToast(t("onboardingCreateFailed"));
        setOnboardingStep({
          step: 1,
          derivedName: null,
          error: t("onboardingCreateFailed"),
        });
        return;
      }

      const derived = await deriveNostrKeysFromSlip39(slip39);
      if (!derived) {
        pushToast(t("onboardingCreateFailed"));
        setOnboardingStep({
          step: 1,
          derivedName: null,
          error: t("onboardingCreateFailed"),
        });
        return;
      }

      const npub = derived.npub;
      const privBytes = await decodeNsecPrivateBytes(derived.nsec);
      if (!privBytes) {
        pushToast(t("onboardingCreateFailed"));
        setOnboardingStep({
          step: 1,
          derivedName: null,
          error: t("onboardingCreateFailed"),
        });
        return;
      }

      const defaults = deriveDefaultProfile(npub);
      setOnboardingStep({ step: 1, derivedName: defaults.name, error: null });

      setOnboardingStep({ step: 2, derivedName: defaults.name, error: null });
      setOnboardingStep({ step: 3, derivedName: defaults.name, error: null });

      try {
        const content: JsonRecord = {
          name: defaults.name,
          display_name: defaults.name,
          picture: defaults.pictureUrl,
          image: defaults.pictureUrl,
          lud16: defaults.lnAddress,
        };

        const result = await publishKind0ProfileMetadata({
          privBytes,
          relays: NOSTR_RELAYS,
          content,
        });

        if (!result.anySuccess) {
          throw new Error("nostr publish failed");
        }

        saveCachedProfileMetadata(npub, {
          name: defaults.name,
          displayName: defaults.name,
          lud16: defaults.lnAddress,
          picture: defaults.pictureUrl,
          image: defaults.pictureUrl,
        });
        saveCachedProfilePicture(npub, defaults.pictureUrl);
      } catch (e) {
        const msg = `${t("errorPrefix")}: ${String(e ?? "unknown")}`;
        setOnboardingStep({ step: 3, derivedName: defaults.name, error: msg });
        pushToast(msg);
        return;
      }

      await setIdentityFromNsecAndReload(
        derived.nsec,
        slip39,
        "onboardingCreateFailed",
      );
    } finally {
      setOnboardingIsBusy(false);
    }
  }, [
    decodeNsecPrivateBytes,
    onboardingIsBusy,
    pushToast,
    setIdentityFromNsecAndReload,
    t,
  ]);

  const pasteExistingNsec = React.useCallback(async () => {
    if (onboardingIsBusy) return;

    setOnboardingIsBusy(true);
    try {
      let text = "";
      if (navigator.clipboard?.readText) {
        text = await navigator.clipboard.readText();
      } else if (
        typeof window !== "undefined" &&
        typeof window.prompt === "function"
      ) {
        text = String(window.prompt(t("onboardingPasteNsec")) ?? "");
      } else {
        pushToast(t("pasteNotAvailable"));
        return;
      }

      const raw = String(text ?? "").trim();
      if (!raw) {
        pushToast(t("pasteEmpty"));
        return;
      }

      if (!looksLikeSlip39Seed(raw)) {
        pushToast(t("onboardingInvalidSeed"));
        return;
      }

      const derived = await deriveNostrKeysFromSlip39(raw);
      if (!derived) {
        pushToast(t("onboardingInvalidSeed"));
        return;
      }

      const normalizedSlip39 = normalizeSlip39Seed(raw);
      await setIdentityFromNsecAndReload(
        derived.nsec,
        normalizedSlip39,
        "onboardingInvalidSeed",
      );
    } catch {
      pushToast(t("pasteNotAvailable"));
    } finally {
      setOnboardingIsBusy(false);
    }
  }, [
    normalizeSlip39Seed,
    onboardingIsBusy,
    pushToast,
    setIdentityFromNsecAndReload,
    t,
  ]);

  const requestDeriveNostrKeys = React.useCallback(async () => {
    if (onboardingIsBusy) return;

    const normalizedSeed = String(slip39Seed ?? "").trim();
    if (!normalizedSeed) {
      pushToast(t("seedMissing"));
      return;
    }

    setOnboardingIsBusy(true);
    try {
      const derived = await deriveNostrKeysFromSlip39(normalizedSeed);
      if (!derived) {
        pushToast(t("restoreFailed"));
        return;
      }

      await setIdentityFromNsecAndReload(
        derived.nsec,
        normalizedSeed,
        "restoreFailed",
      );
    } finally {
      setOnboardingIsBusy(false);
    }
  }, [
    onboardingIsBusy,
    pushToast,
    setIdentityFromNsecAndReload,
    slip39Seed,
    t,
  ]);

  const requestLogout = React.useCallback(() => {
    if (!logoutArmed) {
      setLogoutArmed(true);
      pushToast(t("logoutArmedHint"));
      return;
    }

    void (async () => {
      setLogoutArmed(false);
      try {
        await clearStoredPushNsec();
      } catch {
        // ignore
      }

      try {
        localStorage.removeItem(NOSTR_NSEC_STORAGE_KEY);
        localStorage.removeItem(NOSTR_SLIP39_SEED_STORAGE_KEY);
        localStorage.removeItem(INITIAL_MNEMONIC_STORAGE_KEY);
      } catch {
        // ignore
      }

      setIsSeedLogin(false);
      setCashuSeedMnemonic(null);
      setSlip39Seed(null);

      try {
        window.location.hash = "#";
      } catch {
        // ignore
      }
      globalThis.location.reload();
    })();
  }, [logoutArmed, pushToast, t]);

  React.useEffect(() => {
    if (!logoutArmed) return;

    const timeoutId = window.setTimeout(() => {
      setLogoutArmed(false);
    }, 5000);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [logoutArmed]);

  return {
    createNewAccount,
    currentNpub,
    isSeedLogin,
    logoutArmed,
    onboardingIsBusy,
    onboardingStep,
    pasteExistingNsec,
    requestDeriveNostrKeys,
    requestLogout,
    cashuSeedMnemonic,
    seedMnemonic,
    slip39Seed,
    setOnboardingStep,
  };
};
