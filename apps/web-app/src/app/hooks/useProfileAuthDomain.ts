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
import { NOSTR_NSEC_STORAGE_KEY } from "../../utils/constants";

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
  logoutArmed: boolean;
  onboardingIsBusy: boolean;
  onboardingStep: OnboardingStep;
  pasteExistingNsec: () => Promise<void>;
  requestLogout: () => void;
  seedMnemonic: string | null;
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
  const [logoutArmed, setLogoutArmed] = React.useState(false);

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
        const decoded = nip19.decode(nsec);
        if (decoded.type !== "nsec") return;

        const privBytes = decoded.data as Uint8Array;
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
  }, [currentNsec]);

  const deriveEvoluMnemonicFromNsec = React.useCallback(
    async (nsec: string): Promise<Evolu.Mnemonic | null> => {
      const raw = String(nsec ?? "").trim();
      if (!raw) return null;

      try {
        const { nip19 } = await import("nostr-tools");
        const decoded = nip19.decode(raw);
        if (decoded.type !== "nsec") return null;

        const privBytes = decoded.data as Uint8Array;

        const prefix = new TextEncoder().encode("linky-evolu-v1:");
        const data = new Uint8Array(prefix.length + privBytes.length);
        data.set(prefix);
        data.set(privBytes, prefix.length);

        const hashBuf = await crypto.subtle.digest(
          "SHA-256",
          data as unknown as BufferSource,
        );
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
    [],
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
    async (nsec: string) => {
      const raw = String(nsec ?? "").trim();
      if (!raw) {
        pushToast(t("onboardingInvalidNsec"));
        return;
      }

      const mnemonic = await deriveEvoluMnemonicFromNsec(raw);
      if (!mnemonic) {
        pushToast(t("onboardingInvalidNsec"));
        return;
      }

      try {
        localStorage.setItem(NOSTR_NSEC_STORAGE_KEY, raw);
        localStorage.setItem(INITIAL_MNEMONIC_STORAGE_KEY, mnemonic);
      } catch {
        // ignore
      }

      try {
        await evolu.restoreAppOwner(mnemonic as unknown as Evolu.Mnemonic, {
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
      const { nip19, getPublicKey } = await import("nostr-tools");
      const generateRandomSecretKey = (): Uint8Array => {
        const bytes = new Uint8Array(32);
        crypto.getRandomValues(bytes);
        return bytes;
      };

      let privBytes: Uint8Array | null = null;
      for (let attempt = 0; attempt < 20; attempt += 1) {
        const candidate = generateRandomSecretKey();
        try {
          getPublicKey(candidate);
          privBytes = candidate;
          break;
        } catch {
          // try again
        }
      }

      if (!privBytes) {
        pushToast(t("onboardingCreateFailed"));
        setOnboardingStep({
          step: 1,
          derivedName: null,
          error: t("onboardingCreateFailed"),
        });
        return;
      }

      const pubkeyHex = getPublicKey(privBytes);
      const npub = nip19.npubEncode(pubkeyHex);

      const defaults = deriveDefaultProfile(npub);
      setOnboardingStep({ step: 1, derivedName: defaults.name, error: null });

      setOnboardingStep({ step: 2, derivedName: defaults.name, error: null });
      setOnboardingStep({ step: 3, derivedName: defaults.name, error: null });

      try {
        const content: Record<string, unknown> = {
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

      const nsec = nip19.nsecEncode(privBytes);
      await setIdentityFromNsecAndReload(nsec);
    } finally {
      setOnboardingIsBusy(false);
    }
  }, [onboardingIsBusy, pushToast, setIdentityFromNsecAndReload, t]);

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

      await setIdentityFromNsecAndReload(raw);
    } catch {
      pushToast(t("pasteNotAvailable"));
    } finally {
      setOnboardingIsBusy(false);
    }
  }, [onboardingIsBusy, pushToast, setIdentityFromNsecAndReload, t]);

  const requestLogout = React.useCallback(() => {
    if (!logoutArmed) {
      setLogoutArmed(true);
      pushToast(t("logoutArmedHint"));
      return;
    }

    setLogoutArmed(false);
    try {
      localStorage.removeItem(NOSTR_NSEC_STORAGE_KEY);
      localStorage.removeItem(INITIAL_MNEMONIC_STORAGE_KEY);
    } catch {
      // ignore
    }

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
    logoutArmed,
    onboardingIsBusy,
    onboardingStep,
    pasteExistingNsec,
    requestLogout,
    seedMnemonic,
    setOnboardingStep,
  };
};
