import * as Evolu from "@evolu/common";
import React from "react";
import {
  deriveAvatarChoices,
  deriveDefaultProfile,
  type DerivedAvatarChoice,
} from "../../derivedProfile";
import { evolu } from "../../evolu";
import {
  NOSTR_RELAYS,
  saveCachedProfileMetadata,
  saveCachedProfilePicture,
} from "../../nostrProfile";
import { publishKind0ProfileMetadata } from "../../nostrPublish";
import {
  clearIdentitySecrets,
  persistIdentitySecrets,
  readStoredCashuMnemonic,
  readStoredSlip39Seed,
  writeStoredCashuMnemonic,
} from "../../platform/identitySecrets";
import type { JsonRecord } from "../../types/json";
import { CASHU_ONBOARDING_SET_MAIN_MINT_STORAGE_KEY } from "../../utils/constants";
import { createSquareAvatarDataUrl } from "../../utils/image";
import {
  createSlip39Seed,
  deriveCashuBip85MnemonicFromSlip39,
  deriveEvoluOwnerMnemonicFromSlip39,
  deriveNostrKeysFromSlip39,
  looksLikeSlip39Seed,
} from "../../utils/slip39Nostr";
import {
  applySlip39Suggestion,
  normalizeSlip39Input,
} from "../../utils/slip39Input";
import { safeLocalStorageSet } from "../../utils/storage";

export interface PendingOnboardingProfile {
  avatarChoices: readonly DerivedAvatarChoice[];
  error: string | null;
  kind: "profile";
  name: string;
  npub: string;
  nsec: string;
  pictureUrl: string;
  slip39Seed: string;
}

export interface ReturningOnboardingStep {
  error: string | null;
  input: string;
  kind: "returning";
}

type PreparingOnboardingStep = {
  derivedName: string | null;
  error: string | null;
  kind: "preparing";
  step: 1 | 2;
};

export type OnboardingStep =
  | PreparingOnboardingStep
  | PendingOnboardingProfile
  | ReturningOnboardingStep
  | null;

interface PersistNewProfileParams {
  lnAddress: string;
  name: string;
  npub: string;
  nsec: string;
  pictureUrl: string;
}

interface UseProfileAuthDomainParams {
  currentNsec: string | null;
  pushToast: (message: string) => void;
  t: (key: string) => string;
}

interface UseProfileAuthDomainResult {
  confirmPendingOnboardingProfile: () => Promise<void>;
  createNewAccount: () => Promise<void>;
  currentNpub: string | null;
  isSeedLogin: boolean;
  logoutArmed: boolean;
  onboardingIsBusy: boolean;
  onboardingPhotoInputRef: React.RefObject<HTMLInputElement | null>;
  onboardingStep: OnboardingStep;
  openReturningOnboarding: () => void;
  onPendingOnboardingPhotoSelected: (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => Promise<void>;
  pasteReturningSlip39FromClipboard: () => Promise<void>;
  pickPendingOnboardingPhoto: () => Promise<void>;
  requestDeriveNostrKeys: () => Promise<void>;
  requestLogout: () => void;
  seedMnemonic: string | null;
  selectReturningSlip39Suggestion: (value: string) => void;
  selectPendingOnboardingAvatar: (pictureUrl: string) => void;
  cashuSeedMnemonic: string | null;
  slip39Seed: string | null;
  setReturningSlip39Input: (value: string) => void;
  setOnboardingStep: React.Dispatch<React.SetStateAction<OnboardingStep>>;
  setPendingOnboardingName: (value: string) => void;
  submitReturningSlip39: (inputOverride?: string) => Promise<void>;
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
  >(null);
  const [slip39Seed, setSlip39Seed] = React.useState<string | null>(null);
  const [logoutArmed, setLogoutArmed] = React.useState(false);
  const onboardingPhotoInputRef = React.useRef<HTMLInputElement | null>(null);
  const [isSeedLogin, setIsSeedLogin] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;

    void (async () => {
      const [storedCashuMnemonic, storedSlip39Seed] = await Promise.all([
        readStoredCashuMnemonic(),
        readStoredSlip39Seed(),
      ]);

      if (cancelled) return;
      setCashuSeedMnemonic(storedCashuMnemonic);
      setSlip39Seed(storedSlip39Seed);
      setIsSeedLogin(Boolean(storedSlip39Seed));
    })();

    return () => {
      cancelled = true;
    };
  }, []);
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
      await writeStoredCashuMnemonic(derived);
    })();

    return () => {
      cancelled = true;
    };
  }, [cashuSeedMnemonic, isSeedLogin, slip39Seed]);

  const updatePendingOnboardingProfile = React.useCallback(
    (
      update: (profile: PendingOnboardingProfile) => PendingOnboardingProfile,
    ) => {
      setOnboardingStep((current) => {
        if (!current || current.kind !== "profile") return current;
        return update(current);
      });
    },
    [],
  );

  const updateReturningOnboardingStep = React.useCallback(
    (update: (step: ReturningOnboardingStep) => ReturningOnboardingStep) => {
      setOnboardingStep((current) => {
        if (!current || current.kind !== "returning") return current;
        return update(current);
      });
    },
    [],
  );

  const publishNewProfileMetadata = React.useCallback(
    async ({
      lnAddress,
      name,
      npub,
      nsec,
      pictureUrl,
    }: PersistNewProfileParams) => {
      const privBytes = await decodeNsecPrivateBytes(nsec);
      if (!privBytes) {
        throw new Error(t("onboardingCreateFailed"));
      }

      const trimmedLnAddress = lnAddress.trim();
      const trimmedName = name.trim();
      const trimmedPicture = pictureUrl.trim();
      const content: JsonRecord = {
        ...(trimmedName
          ? { name: trimmedName, display_name: trimmedName }
          : {}),
        ...(trimmedLnAddress ? { lud16: trimmedLnAddress } : {}),
        ...(trimmedPicture
          ? { picture: trimmedPicture, image: trimmedPicture }
          : {}),
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
        ...(trimmedName ? { name: trimmedName, displayName: trimmedName } : {}),
        ...(trimmedLnAddress ? { lud16: trimmedLnAddress } : {}),
        ...(trimmedPicture
          ? { picture: trimmedPicture, image: trimmedPicture }
          : {}),
      });
      saveCachedProfilePicture(npub, trimmedPicture || null);
    },
    [decodeNsecPrivateBytes, t],
  );

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

      await persistIdentitySecrets({
        appMnemonic,
        cashuMnemonic: derivedCashuMnemonic,
        nsec: raw,
        slip39Seed: normalizedSlip39,
      });

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
    setOnboardingStep({
      kind: "preparing",
      step: 1,
      derivedName: null,
      error: null,
    });
    try {
      const slip39 = await createSlip39Seed();
      if (!slip39) {
        pushToast(t("onboardingCreateFailed"));
        setOnboardingStep({
          kind: "preparing",
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
          kind: "preparing",
          step: 1,
          derivedName: null,
          error: t("onboardingCreateFailed"),
        });
        return;
      }

      const npub = derived.npub;
      const normalizedNsec = String(derived.nsec ?? "").trim();
      if (!normalizedNsec) {
        pushToast(t("onboardingCreateFailed"));
        setOnboardingStep({
          kind: "preparing",
          step: 1,
          derivedName: null,
          error: t("onboardingCreateFailed"),
        });
        return;
      }

      const defaults = deriveDefaultProfile(npub);
      setOnboardingStep({
        kind: "preparing",
        step: 1,
        derivedName: defaults.name,
        error: null,
      });

      const avatarChoices = deriveAvatarChoices(npub, 8);

      setOnboardingStep({
        kind: "preparing",
        step: 2,
        derivedName: defaults.name,
        error: null,
      });

      setOnboardingStep({
        kind: "profile",
        avatarChoices,
        error: null,
        name: defaults.name,
        npub,
        nsec: normalizedNsec,
        pictureUrl: avatarChoices[0]?.pictureUrl ?? defaults.pictureUrl,
        slip39Seed: slip39,
      });
    } finally {
      setOnboardingIsBusy(false);
    }
  }, [onboardingIsBusy, pushToast, t]);

  const setPendingOnboardingName = React.useCallback(
    (value: string) => {
      updatePendingOnboardingProfile((current) => ({
        ...current,
        error: null,
        name: value,
      }));
    },
    [updatePendingOnboardingProfile],
  );

  const selectPendingOnboardingAvatar = React.useCallback(
    (pictureUrl: string) => {
      const normalizedPicture = String(pictureUrl ?? "").trim();
      if (!normalizedPicture) return;

      updatePendingOnboardingProfile((current) => ({
        ...current,
        error: null,
        pictureUrl: normalizedPicture,
      }));
    },
    [updatePendingOnboardingProfile],
  );

  const pickPendingOnboardingPhoto = React.useCallback(async () => {
    onboardingPhotoInputRef.current?.click();
  }, []);

  const onPendingOnboardingPhotoSelected = React.useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0] ?? null;
      event.target.value = "";
      if (!file) return;

      try {
        const pictureUrl = await createSquareAvatarDataUrl(file, 160);
        updatePendingOnboardingProfile((current) => ({
          ...current,
          error: null,
          pictureUrl,
        }));
      } catch (error) {
        const message = `${t("errorPrefix")}: ${String(error ?? "unknown")}`;
        updatePendingOnboardingProfile((current) => ({
          ...current,
          error: message,
        }));
      }
    },
    [t, updatePendingOnboardingProfile],
  );

  const confirmPendingOnboardingProfile = React.useCallback(async () => {
    if (onboardingIsBusy) return;
    if (!onboardingStep || onboardingStep.kind !== "profile") return;

    const trimmedName = onboardingStep.name.trim();
    const trimmedPicture = onboardingStep.pictureUrl.trim();

    if (!trimmedName) {
      updatePendingOnboardingProfile((current) => ({
        ...current,
        error: t("onboardingNameRequired"),
      }));
      return;
    }

    if (!trimmedPicture) {
      updatePendingOnboardingProfile((current) => ({
        ...current,
        error: t("onboardingAvatarRequired"),
      }));
      return;
    }

    setOnboardingIsBusy(true);
    updatePendingOnboardingProfile((current) => ({
      ...current,
      error: null,
    }));

    try {
      const lnAddress = deriveDefaultProfile(onboardingStep.npub).lnAddress;

      try {
        await publishNewProfileMetadata({
          lnAddress,
          name: trimmedName,
          npub: onboardingStep.npub,
          nsec: onboardingStep.nsec,
          pictureUrl: trimmedPicture,
        });
      } catch (error) {
        const message = `${t("errorPrefix")}: ${String(error ?? "unknown")}`;
        updatePendingOnboardingProfile((current) => ({
          ...current,
          error: message,
        }));
        pushToast(message);
        return;
      }

      safeLocalStorageSet(CASHU_ONBOARDING_SET_MAIN_MINT_STORAGE_KEY, "1");

      await setIdentityFromNsecAndReload(
        onboardingStep.nsec,
        onboardingStep.slip39Seed,
        "onboardingCreateFailed",
      );
    } finally {
      setOnboardingIsBusy(false);
    }
  }, [
    onboardingIsBusy,
    onboardingStep,
    publishNewProfileMetadata,
    pushToast,
    setIdentityFromNsecAndReload,
    t,
    updatePendingOnboardingProfile,
  ]);

  const openReturningOnboarding = React.useCallback(() => {
    if (onboardingIsBusy) return;

    setOnboardingStep({
      kind: "returning",
      error: null,
      input: "",
    });
  }, [onboardingIsBusy]);

  const setReturningSlip39Input = React.useCallback(
    (value: string) => {
      updateReturningOnboardingStep((current) => ({
        ...current,
        error: null,
        input: value,
      }));
    },
    [updateReturningOnboardingStep],
  );

  const selectReturningSlip39Suggestion = React.useCallback(
    (value: string) => {
      updateReturningOnboardingStep((current) => ({
        ...current,
        error: null,
        input: applySlip39Suggestion(current.input, value),
      }));
    },
    [updateReturningOnboardingStep],
  );

  const submitReturningSlip39 = React.useCallback(
    async (inputOverride?: string) => {
      if (onboardingIsBusy) return;

      const rawInput =
        typeof inputOverride === "string"
          ? inputOverride
          : onboardingStep?.kind === "returning"
            ? onboardingStep.input
            : "";
      const normalizedSlip39 = normalizeSlip39Input(rawInput);

      updateReturningOnboardingStep((current) => ({
        ...current,
        error: null,
        input: normalizedSlip39,
      }));

      if (!normalizedSlip39) {
        const message = t("pasteEmpty");
        updateReturningOnboardingStep((current) => ({
          ...current,
          error: message,
          input: normalizedSlip39,
        }));
        pushToast(message);
        return;
      }

      if (!looksLikeSlip39Seed(normalizedSlip39)) {
        const message = t("onboardingInvalidSeed");
        updateReturningOnboardingStep((current) => ({
          ...current,
          error: message,
          input: normalizedSlip39,
        }));
        pushToast(message);
        return;
      }

      setOnboardingIsBusy(true);
      try {
        const derived = await deriveNostrKeysFromSlip39(normalizedSlip39);
        if (!derived) {
          const message = t("onboardingInvalidSeed");
          updateReturningOnboardingStep((current) => ({
            ...current,
            error: message,
            input: normalizedSlip39,
          }));
          pushToast(message);
          return;
        }

        await setIdentityFromNsecAndReload(
          derived.nsec,
          normalizedSlip39,
          "onboardingInvalidSeed",
        );
      } finally {
        setOnboardingIsBusy(false);
      }
    },
    [
      onboardingIsBusy,
      onboardingStep,
      pushToast,
      setIdentityFromNsecAndReload,
      t,
      updateReturningOnboardingStep,
    ],
  );

  const pasteReturningSlip39FromClipboard = React.useCallback(async () => {
    if (onboardingIsBusy) return;

    try {
      if (!navigator.clipboard?.readText) {
        pushToast(t("pasteNotAvailable"));
        return;
      }

      const text = await navigator.clipboard.readText();
      const raw = String(text ?? "").trim();
      if (!raw) {
        pushToast(t("pasteEmpty"));
        return;
      }

      updateReturningOnboardingStep((current) => ({
        ...current,
        error: null,
        input: raw,
      }));
      await submitReturningSlip39(raw);
    } catch {
      pushToast(t("pasteNotAvailable"));
    }
  }, [
    onboardingIsBusy,
    pushToast,
    submitReturningSlip39,
    t,
    updateReturningOnboardingStep,
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
      await clearIdentitySecrets();

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
    confirmPendingOnboardingProfile,
    createNewAccount,
    currentNpub,
    isSeedLogin,
    logoutArmed,
    onboardingIsBusy,
    onboardingPhotoInputRef,
    onboardingStep,
    openReturningOnboarding,
    onPendingOnboardingPhotoSelected,
    pasteReturningSlip39FromClipboard,
    pickPendingOnboardingPhoto,
    requestDeriveNostrKeys,
    requestLogout,
    selectReturningSlip39Suggestion,
    selectPendingOnboardingAvatar,
    cashuSeedMnemonic,
    seedMnemonic,
    slip39Seed,
    setReturningSlip39Input,
    setOnboardingStep,
    setPendingOnboardingName,
    submitReturningSlip39,
  };
};
