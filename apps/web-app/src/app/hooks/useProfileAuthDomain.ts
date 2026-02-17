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
  CASHU_BIP85_MNEMONIC_STORAGE_KEY,
  NOSTR_AUTH_METHOD_STORAGE_KEY,
  NOSTR_NSEC_STORAGE_KEY,
  NOSTR_SLIP39_SEED_STORAGE_KEY,
} from "../../utils/constants";
import {
  createSlip39Seed,
  deriveCashuBip85MnemonicFromSlip39,
  deriveEvoluOwnerMnemonicFromSlip39,
  deriveNostrKeysFromSlip39,
  looksLikeSlip39Seed,
} from "../../utils/slip39Nostr";

type EvoluMutations = ReturnType<typeof import("../../evolu").useEvolu>;

const NOSTR_IDENTITY_ROW_ID = Evolu.createIdFromString<"NostrIdentity">(
  "active-nostr-identity",
);

export type OnboardingStep = {
  step: 1 | 2 | 3;
  derivedName: string | null;
  error: string | null;
} | null;

interface UseProfileAuthDomainParams {
  currentNsec: string | null;
  pushToast: (message: string) => void;
  t: (key: string) => string;
  update: EvoluMutations["update"];
  upsert: EvoluMutations["upsert"];
}

interface UseProfileAuthDomainResult {
  createNewAccount: () => Promise<void>;
  currentNpub: string | null;
  hasCustomNsecOverride: boolean;
  isSeedLogin: boolean;
  logoutArmed: boolean;
  onboardingIsBusy: boolean;
  onboardingStep: OnboardingStep;
  pasteExistingNsec: () => Promise<void>;
  requestDeriveNostrKeys: () => Promise<void>;
  requestPasteNostrKeys: () => Promise<void>;
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
  update,
  upsert,
}: UseProfileAuthDomainParams): UseProfileAuthDomainResult => {
  type NostrAuthMethod = "nsec" | "slip39";

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
      return localStorage.getItem(NOSTR_AUTH_METHOD_STORAGE_KEY) === "slip39";
    } catch {
      return false;
    }
  });
  const [derivedSeedNsec, setDerivedSeedNsec] = React.useState<string | null>(
    null,
  );

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

  const persistNsecToMetaOwner = React.useCallback(
    async (nsec: string, seedCandidate: string | null): Promise<void> => {
      const normalizedNsec = String(nsec ?? "").trim();
      const normalizedSeed = String(seedCandidate ?? "").trim();
      if (!normalizedNsec || !normalizedSeed) return;

      const metaMnemonic = await deriveEvoluOwnerMnemonicFromSlip39(
        normalizedSeed,
        "meta",
        0,
      );
      if (!metaMnemonic) return;

      const parsed = Evolu.Mnemonic.fromUnknown(metaMnemonic);
      if (!parsed.ok) return;

      const metaOwner = Evolu.createAppOwner(
        Evolu.mnemonicToOwnerSecret(parsed.value),
      );

      upsert(
        "nostrIdentity",
        {
          id: NOSTR_IDENTITY_ROW_ID,
          nsec: normalizedNsec,
        },
        { ownerId: metaOwner.id },
      );
    },
    [upsert],
  );

  const markCustomNsecDeletedInMetaOwner = React.useCallback(
    async (seedCandidate: string | null): Promise<void> => {
      const normalizedSeed = String(seedCandidate ?? "").trim();
      if (!normalizedSeed) return;

      const metaMnemonic = await deriveEvoluOwnerMnemonicFromSlip39(
        normalizedSeed,
        "meta",
        0,
      );
      if (!metaMnemonic) return;

      const parsed = Evolu.Mnemonic.fromUnknown(metaMnemonic);
      if (!parsed.ok) return;

      const metaOwner = Evolu.createAppOwner(
        Evolu.mnemonicToOwnerSecret(parsed.value),
      );

      update(
        "nostrIdentity",
        {
          id: NOSTR_IDENTITY_ROW_ID,
          isDeleted: Evolu.sqliteTrue,
        },
        { ownerId: metaOwner.id },
      );
    },
    [update],
  );

  React.useEffect(() => {
    if (!isSeedLogin) {
      setDerivedSeedNsec(null);
      return;
    }

    const normalizedSeed = String(slip39Seed ?? "").trim();
    if (!normalizedSeed) {
      setDerivedSeedNsec(null);
      return;
    }

    let cancelled = false;
    void (async () => {
      const derived = await deriveNostrKeysFromSlip39(normalizedSeed);
      if (cancelled) return;
      setDerivedSeedNsec(derived?.nsec ?? null);
    })();

    return () => {
      cancelled = true;
    };
  }, [isSeedLogin, slip39Seed]);

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
      authMethod: NostrAuthMethod = "nsec",
      invalidMessageKey: string = "onboardingInvalidNsec",
      sourceSlip39Seed: string | null = null,
      isManualNsecEntry = false,
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

      if (isManualNsecEntry) {
        const currentSeed = String(slip39Seed ?? "").trim();
        const incomingSeed = String(sourceSlip39Seed ?? "").trim();
        const seedForMetaOwner = incomingSeed || currentSeed || null;
        await persistNsecToMetaOwner(raw, seedForMetaOwner);
      }

      let derivedCashuMnemonic: string | null = null;
      if (authMethod === "slip39") {
        const normalizedSlip39 = String(sourceSlip39Seed ?? "").trim();
        if (!normalizedSlip39) {
          pushToast(t(invalidMessageKey));
          return;
        }

        derivedCashuMnemonic =
          await deriveCashuBip85MnemonicFromSlip39(normalizedSlip39);
        if (!derivedCashuMnemonic) {
          pushToast(t(invalidMessageKey));
          return;
        }
      }

      try {
        localStorage.setItem(NOSTR_NSEC_STORAGE_KEY, raw);
        localStorage.setItem(NOSTR_AUTH_METHOD_STORAGE_KEY, authMethod);
        if (authMethod === "slip39" && sourceSlip39Seed) {
          localStorage.setItem(NOSTR_SLIP39_SEED_STORAGE_KEY, sourceSlip39Seed);
          if (derivedCashuMnemonic) {
            localStorage.setItem(
              CASHU_BIP85_MNEMONIC_STORAGE_KEY,
              derivedCashuMnemonic,
            );
          }
        } else {
          localStorage.removeItem(NOSTR_SLIP39_SEED_STORAGE_KEY);
          localStorage.removeItem(CASHU_BIP85_MNEMONIC_STORAGE_KEY);
        }
        localStorage.setItem(INITIAL_MNEMONIC_STORAGE_KEY, mnemonic);
      } catch {
        // ignore
      }

      setIsSeedLogin(authMethod === "slip39");
      setSlip39Seed(authMethod === "slip39" ? sourceSlip39Seed : null);
      setCashuSeedMnemonic(
        authMethod === "slip39" ? derivedCashuMnemonic : null,
      );

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
    [
      deriveEvoluMnemonicFromNsec,
      persistNsecToMetaOwner,
      pushToast,
      slip39Seed,
      t,
    ],
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
        null,
        true,
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

  const requestPasteNostrKeys = React.useCallback(async () => {
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

      const privBytes = await decodeNsecPrivateBytes(raw);
      if (!privBytes) {
        pushToast(t("nostrPasteInvalid"));
        return;
      }

      const { nip19 } = await import("nostr-tools");
      const normalizedNsec = nip19.nsecEncode(privBytes);

      await setIdentityFromNsecAndReload(
        normalizedNsec,
        isSeedLogin ? "slip39" : "nsec",
        "nostrPasteInvalid",
        isSeedLogin ? String(slip39Seed ?? "").trim() : null,
        true,
      );
    } catch {
      pushToast(t("pasteNotAvailable"));
    } finally {
      setOnboardingIsBusy(false);
    }
  }, [
    decodeNsecPrivateBytes,
    isSeedLogin,
    onboardingIsBusy,
    pushToast,
    setIdentityFromNsecAndReload,
    slip39Seed,
    t,
  ]);

  const requestDeriveNostrKeys = React.useCallback(async () => {
    if (onboardingIsBusy) return;

    const normalizedSeed = String(slip39Seed ?? "").trim();
    if (!isSeedLogin || !normalizedSeed) {
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

      await markCustomNsecDeletedInMetaOwner(normalizedSeed);

      await setIdentityFromNsecAndReload(
        derived.nsec,
        "slip39",
        "restoreFailed",
        normalizedSeed,
        false,
      );
    } finally {
      setOnboardingIsBusy(false);
    }
  }, [
    isSeedLogin,
    markCustomNsecDeletedInMetaOwner,
    onboardingIsBusy,
    pushToast,
    setIdentityFromNsecAndReload,
    slip39Seed,
    t,
  ]);

  const hasCustomNsecOverride = React.useMemo(() => {
    if (!isSeedLogin) return false;
    const current = String(currentNsec ?? "").trim();
    const derived = String(derivedSeedNsec ?? "").trim();
    if (!current || !derived) return false;
    return current !== derived;
  }, [currentNsec, derivedSeedNsec, isSeedLogin]);

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
    setCashuSeedMnemonic(null);
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
    hasCustomNsecOverride,
    isSeedLogin,
    logoutArmed,
    onboardingIsBusy,
    onboardingStep,
    pasteExistingNsec,
    requestDeriveNostrKeys,
    requestPasteNostrKeys,
    requestLogout,
    cashuSeedMnemonic,
    seedMnemonic,
    slip39Seed,
    setOnboardingStep,
  };
};
