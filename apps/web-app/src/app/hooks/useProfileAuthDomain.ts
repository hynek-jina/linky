import * as Evolu from "@evolu/common";
import { entropyToMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english";
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
  NOSTR_AUTH_METHOD_STORAGE_KEY,
  NOSTR_NSEC_STORAGE_KEY,
  NOSTR_SLIP39_SEED_STORAGE_KEY,
} from "../../utils/constants";
import {
  createSlip39Seed,
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
  requestLogout: () => void;
  seedMnemonic: string | null;
  slip39Seed: string | null;
  setOnboardingStep: React.Dispatch<React.SetStateAction<OnboardingStep>>;
}

export const useProfileAuthDomain = ({
  currentNsec,
  pushToast,
  t,
}: UseProfileAuthDomainParams): UseProfileAuthDomainResult => {
  type NostrAuthMethod = "nsec" | "slip39";

  const [currentNpub, setCurrentNpub] = React.useState<string | null>(null);
  const [onboardingIsBusy, setOnboardingIsBusy] = React.useState(false);
  const [onboardingStep, setOnboardingStep] =
    React.useState<OnboardingStep>(null);
  const [seedMnemonic, setSeedMnemonic] = React.useState<string | null>(null);
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
      return localStorage.getItem(NOSTR_AUTH_METHOD_STORAGE_KEY) === "slip39";
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

  const deriveEvoluMnemonicFromNsec = React.useCallback(
    async (nsec: string): Promise<Evolu.Mnemonic | null> => {
      const raw = String(nsec ?? "").trim();
      if (!raw) return null;

      try {
        const privBytes = await decodeNsecPrivateBytes(raw);
        if (!privBytes) return null;

        const prefix = new TextEncoder().encode("linky-evolu-v1:");
        const data = new Uint8Array(prefix.length + privBytes.length);
        data.set(prefix);
        data.set(privBytes, prefix.length);

        const hashBuf = await crypto.subtle.digest("SHA-256", data);
        const hash = new Uint8Array(hashBuf);
        const entropy = hash.slice(0, 16);
        const phrase = entropyToMnemonic(entropy, wordlist);
        const validated = Evolu.Mnemonic.fromUnknown(phrase);
        if (!validated.ok) return null;

        return validated.value;
      } catch {
        return null;
      }
    },
    [decodeNsecPrivateBytes],
  );

  React.useEffect(() => {
    const nsec = String(currentNsec ?? "").trim();
    if (!nsec) {
      setSeedMnemonic(null);
      return;
    }

    let cancelled = false;
    void (async () => {
      const derived = await deriveEvoluMnemonicFromNsec(nsec);
      if (cancelled) return;
      setSeedMnemonic(derived ? String(derived) : null);
    })();

    return () => {
      cancelled = true;
    };
  }, [currentNsec, deriveEvoluMnemonicFromNsec]);

  const setIdentityFromNsecAndReload = React.useCallback(
    async (
      nsec: string,
      authMethod: NostrAuthMethod = "nsec",
      invalidMessageKey: string = "onboardingInvalidNsec",
      sourceSlip39Seed: string | null = null,
    ) => {
      const raw = String(nsec ?? "").trim();
      if (!raw) {
        pushToast(t(invalidMessageKey));
        return;
      }

      const mnemonic = await deriveEvoluMnemonicFromNsec(raw);
      if (!mnemonic) {
        pushToast(t(invalidMessageKey));
        return;
      }

      try {
        localStorage.setItem(NOSTR_NSEC_STORAGE_KEY, raw);
        localStorage.setItem(NOSTR_AUTH_METHOD_STORAGE_KEY, authMethod);
        if (authMethod === "slip39" && sourceSlip39Seed) {
          localStorage.setItem(NOSTR_SLIP39_SEED_STORAGE_KEY, sourceSlip39Seed);
        } else {
          localStorage.removeItem(NOSTR_SLIP39_SEED_STORAGE_KEY);
        }
        localStorage.setItem(INITIAL_MNEMONIC_STORAGE_KEY, mnemonic);
      } catch {
        // ignore
      }

      setIsSeedLogin(authMethod === "slip39");
      setSlip39Seed(authMethod === "slip39" ? sourceSlip39Seed : null);

      try {
        await evolu.restoreAppOwner(mnemonic, {
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
    [deriveEvoluMnemonicFromNsec, pushToast, t],
  );

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
        "slip39",
        "onboardingCreateFailed",
        slip39,
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

      if (looksLikeSlip39Seed(raw)) {
        const derived = await deriveNostrKeysFromSlip39(raw);
        if (derived) {
          const normalizedSlip39 = normalizeSlip39Seed(raw);
          await setIdentityFromNsecAndReload(
            derived.nsec,
            "slip39",
            "onboardingInvalidNsecOrSeed",
            normalizedSlip39,
          );
          return;
        }
      }

      const privBytes = await decodeNsecPrivateBytes(raw);
      if (!privBytes) {
        pushToast(t("onboardingInvalidNsecOrSeed"));
        return;
      }

      const { nip19 } = await import("nostr-tools");
      const normalizedNsec = nip19.nsecEncode(privBytes);
      await setIdentityFromNsecAndReload(
        normalizedNsec,
        "nsec",
        "onboardingInvalidNsecOrSeed",
      );
    } catch {
      pushToast(t("pasteNotAvailable"));
    } finally {
      setOnboardingIsBusy(false);
    }
  }, [
    decodeNsecPrivateBytes,
    normalizeSlip39Seed,
    onboardingIsBusy,
    pushToast,
    setIdentityFromNsecAndReload,
    t,
  ]);

  const requestLogout = React.useCallback(() => {
    if (!logoutArmed) {
      setLogoutArmed(true);
      pushToast(t("logoutArmedHint"));
      return;
    }

    setLogoutArmed(false);
    try {
      localStorage.removeItem(NOSTR_NSEC_STORAGE_KEY);
      localStorage.removeItem(NOSTR_AUTH_METHOD_STORAGE_KEY);
      localStorage.removeItem(NOSTR_SLIP39_SEED_STORAGE_KEY);
      localStorage.removeItem(INITIAL_MNEMONIC_STORAGE_KEY);
    } catch {
      // ignore
    }

    setIsSeedLogin(false);
    setSlip39Seed(null);

    try {
      window.location.hash = "#";
    } catch {
      // ignore
    }
    globalThis.location.reload();
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
    requestLogout,
    seedMnemonic,
    slip39Seed,
    setOnboardingStep,
  };
};
