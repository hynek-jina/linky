import * as Evolu from "@evolu/common";
import React from "react";
import {
  cycleGeneratedAvatar,
  deriveDefaultProfile,
  deriveGeneratedAvatar,
  type AvatarEditorControlId,
  type DerivedGeneratedAvatar,
} from "../../derivedProfile";
import { evolu } from "../../evolu";
import type { Lang } from "../../i18n";
import {
  NOSTR_RELAYS,
  saveCachedProfileMetadata,
  saveCachedProfilePicture,
} from "../../nostrProfile";
import { publishKind0ProfileMetadata } from "../../nostrPublish";
import { readClipboardText } from "../../platform/clipboard";
import {
  clearIdentitySecrets,
  persistIdentitySecrets,
  readStoredCashuMnemonic,
  readStoredSlip39Seed,
  writeStoredCashuMnemonic,
} from "../../platform/identitySecrets";
import { triggerPasswordManagerSeedSave } from "../../platform/passwordManager";
import type { JsonRecord } from "../../types/json";
import {
  CASHU_ONBOARDING_SET_MAIN_MINT_STORAGE_KEY,
  EVOLU_CASHU_OWNER_BASELINE_COUNT_STORAGE_KEY,
  EVOLU_CASHU_OWNER_LAST_ROTATED_AT_MS_STORAGE_KEY,
  EVOLU_CONTACTS_OWNER_BASELINE_COUNT_STORAGE_KEY,
  EVOLU_CONTACTS_OWNER_EDIT_COUNT_STORAGE_KEY,
  EVOLU_CONTACTS_OWNER_INDEX_STORAGE_KEY,
  EVOLU_CONTACTS_OWNER_LAST_ROTATED_AT_MS_STORAGE_KEY,
  EVOLU_MESSAGES_OWNER_BASELINE_COUNT_STORAGE_KEY,
  EVOLU_MESSAGES_OWNER_EDIT_COUNT_STORAGE_KEY,
  EVOLU_MESSAGES_OWNER_INDEX_STORAGE_KEY,
  EVOLU_MESSAGES_OWNER_LAST_ROTATED_AT_MS_STORAGE_KEY,
  EVOLU_TRANSACTIONS_OWNER_BASELINE_COUNT_STORAGE_KEY,
  EVOLU_TRANSACTIONS_OWNER_EDIT_COUNT_STORAGE_KEY,
  EVOLU_TRANSACTIONS_OWNER_INDEX_STORAGE_KEY,
  EVOLU_TRANSACTIONS_OWNER_LAST_ROTATED_AT_MS_STORAGE_KEY,
} from "../../utils/constants";
import { createSquareAvatarDataUrl } from "../../utils/image";
import {
  applySlip39Suggestion,
  normalizeSlip39Input,
} from "../../utils/slip39Input";
import {
  createSlip39Seed,
  deriveCashuBip85MnemonicFromSlip39,
  deriveEvoluOwnerMnemonicFromSlip39,
  deriveNostrKeysFromSlip39,
  looksLikeSlip39Seed,
} from "../../utils/slip39Nostr";
import {
  getInitialNostrIdentitySource,
  safeLocalStorageSet,
} from "../../utils/storage";
import type { IdentityChangeMessageSource } from "../lib/identityChangeMessage";

type EvoluMutations = ReturnType<typeof import("../../evolu").useEvolu>;

type NostrIdentitySource = "custom" | "derived";

export interface PendingOnboardingProfile {
  customPictureUrl: string | null;
  error: string | null;
  generatedAvatar: DerivedGeneratedAvatar;
  kind: "profile";
  name: string;
  npub: string;
  nsec: string;
  pictureUrl: string;
  selectedPictureKind: "custom" | "generated";
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
  appendIdentityChangeNoticesRef: React.MutableRefObject<
    | ((args: {
        changedAtSec: number;
        identitySource: IdentityChangeMessageSource;
      }) => void)
    | null
  >;
  currentNsec: string | null;
  lang: Lang;
  pushToast: (message: string) => void;
  t: (key: string) => string;
  upsert: EvoluMutations["upsert"];
}

interface UseProfileAuthDomainResult {
  activeNostrIdentitySource: NostrIdentitySource;
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
  requestPasteNostrKeys: () => Promise<void>;
  requestLogout: () => void;
  savePendingOnboardingBackupToPasswordManager: (
    username: string,
    password: string,
  ) => Promise<void>;
  seedMnemonic: string | null;
  cyclePendingOnboardingAvatarControl: (
    controlId: AvatarEditorControlId,
  ) => void;
  selectReturningSlip39Suggestion: (value: string) => void;
  cashuSeedMnemonic: string | null;
  slip39Seed: string | null;
  setReturningSlip39Input: (value: string) => void;
  setOnboardingStep: React.Dispatch<React.SetStateAction<OnboardingStep>>;
  setPendingOnboardingName: (value: string) => void;
  submitReturningSlip39: (inputOverride?: string) => Promise<void>;
}

const OWNER_ROTATION_STORAGE_KEYS = [
  EVOLU_CONTACTS_OWNER_INDEX_STORAGE_KEY,
  EVOLU_MESSAGES_OWNER_INDEX_STORAGE_KEY,
  EVOLU_TRANSACTIONS_OWNER_INDEX_STORAGE_KEY,
  EVOLU_CONTACTS_OWNER_BASELINE_COUNT_STORAGE_KEY,
  EVOLU_CASHU_OWNER_BASELINE_COUNT_STORAGE_KEY,
  EVOLU_MESSAGES_OWNER_BASELINE_COUNT_STORAGE_KEY,
  EVOLU_TRANSACTIONS_OWNER_BASELINE_COUNT_STORAGE_KEY,
  EVOLU_CONTACTS_OWNER_EDIT_COUNT_STORAGE_KEY,
  EVOLU_MESSAGES_OWNER_EDIT_COUNT_STORAGE_KEY,
  EVOLU_TRANSACTIONS_OWNER_EDIT_COUNT_STORAGE_KEY,
  EVOLU_CONTACTS_OWNER_LAST_ROTATED_AT_MS_STORAGE_KEY,
  EVOLU_CASHU_OWNER_LAST_ROTATED_AT_MS_STORAGE_KEY,
  EVOLU_MESSAGES_OWNER_LAST_ROTATED_AT_MS_STORAGE_KEY,
  EVOLU_TRANSACTIONS_OWNER_LAST_ROTATED_AT_MS_STORAGE_KEY,
] as const;

const resetStoredOwnerRotationState = (): void => {
  try {
    for (const storageKey of OWNER_ROTATION_STORAGE_KEYS) {
      localStorage.removeItem(storageKey);
    }
  } catch {
    // ignore storage unavailability
  }
};

const ACTIVE_NOSTR_IDENTITY_ROW_ID = Evolu.createIdFromString<"NostrIdentity">(
  "active-nostr-identity",
);

export const useProfileAuthDomain = ({
  appendIdentityChangeNoticesRef,
  currentNsec,
  lang,
  pushToast,
  t,
  upsert,
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
  const [activeNostrIdentitySource, setActiveNostrIdentitySource] =
    React.useState<NostrIdentitySource>(() => getInitialNostrIdentitySource());
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

  const deriveNpubFromNsec = React.useCallback(
    async (nsec: string): Promise<string | null> => {
      try {
        const { nip19, getPublicKey } = await import("nostr-tools");
        const privBytes = await decodeNsecPrivateBytes(nsec);
        if (!privBytes) return null;
        return nip19.npubEncode(getPublicKey(privBytes));
      } catch {
        return null;
      }
    },
    [decodeNsecPrivateBytes],
  );

  const upsertActiveNostrIdentity = React.useCallback(
    async (
      nsec: string,
      sourceSlip39Seed: string,
      source: NostrIdentitySource,
      switchedAtSec: number | null,
    ): Promise<void> => {
      const normalizedSlip39 = String(sourceSlip39Seed ?? "").trim();
      if (!normalizedSlip39) return;

      const identityMnemonic = await deriveEvoluOwnerMnemonicFromSlip39(
        normalizedSlip39,
        "identity",
        0,
      );
      if (!identityMnemonic) return;

      const parsedMnemonic = Evolu.Mnemonic.fromUnknown(identityMnemonic);
      if (!parsedMnemonic.ok) return;

      const ownerSecret = Evolu.mnemonicToOwnerSecret(parsedMnemonic.value);
      const identityOwnerId = Evolu.createAppOwner(ownerSecret).id;

      const npub = await deriveNpubFromNsec(nsec);
      if (!npub) return;

      upsert(
        "nostrIdentity",
        {
          id: ACTIVE_NOSTR_IDENTITY_ROW_ID,
          nsec,
          npub,
          source,
          switchedAtSec,
        },
        { ownerId: identityOwnerId },
      );
    },
    [deriveNpubFromNsec, upsert],
  );

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
      options?: {
        identitySource?: NostrIdentitySource;
        invalidMessageKey?: string;
        recordChatNotice?: boolean;
        switchedAtSec?: number | null;
      },
    ) => {
      const invalidMessageKey =
        options?.invalidMessageKey ?? "onboardingInvalidSeed";
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

      const identitySource = options?.identitySource ?? "derived";
      const changedAtSec = Math.ceil(Date.now() / 1000);
      const switchedAtSec =
        identitySource === "custom"
          ? (options?.switchedAtSec ?? changedAtSec)
          : null;
      const previousNsec = String(currentNsec ?? "").trim();
      const shouldRecordChatNotice =
        options?.recordChatNotice === true &&
        Boolean(previousNsec) &&
        previousNsec !== raw;

      await persistIdentitySecrets({
        appMnemonic,
        cashuMnemonic: derivedCashuMnemonic,
        identitySource,
        nsec: raw,
        slip39Seed: normalizedSlip39,
        switchedAtSec,
      });

      await upsertActiveNostrIdentity(
        raw,
        normalizedSlip39,
        identitySource,
        switchedAtSec,
      );

      if (shouldRecordChatNotice) {
        appendIdentityChangeNoticesRef.current?.({
          changedAtSec,
          identitySource,
        });
      }

      resetStoredOwnerRotationState();

      setIsSeedLogin(true);
      setActiveNostrIdentitySource(identitySource);
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
    [
      appendIdentityChangeNoticesRef,
      currentNsec,
      deriveAppMnemonicFromSlip39,
      pushToast,
      t,
      upsertActiveNostrIdentity,
    ],
  );

  React.useEffect(() => {
    if (!isSeedLogin) return;
    if (activeNostrIdentitySource === "custom") return;

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
        {
          identitySource: "derived",
          invalidMessageKey: "restoreFailed",
          switchedAtSec: null,
        },
      );
    })();

    return () => {
      cancelled = true;
    };
  }, [
    activeNostrIdentitySource,
    currentNsec,
    isSeedLogin,
    setIdentityFromNsecAndReload,
    slip39Seed,
  ]);

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

      const defaults = deriveDefaultProfile(npub, lang);
      setOnboardingStep({
        kind: "preparing",
        step: 1,
        derivedName: defaults.name,
        error: null,
      });

      const generatedAvatar = deriveGeneratedAvatar(npub);

      setOnboardingStep({
        kind: "preparing",
        step: 2,
        derivedName: defaults.name,
        error: null,
      });

      setOnboardingStep({
        kind: "profile",
        customPictureUrl: null,
        error: null,
        generatedAvatar,
        name: defaults.name,
        npub,
        nsec: normalizedNsec,
        pictureUrl: generatedAvatar.pictureUrl || defaults.pictureUrl,
        selectedPictureKind: "generated",
        slip39Seed: slip39,
      });
    } finally {
      setOnboardingIsBusy(false);
    }
  }, [lang, onboardingIsBusy, pushToast, t]);

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

  const cyclePendingOnboardingAvatarControl = React.useCallback(
    (controlId: AvatarEditorControlId) => {
      updatePendingOnboardingProfile((current) => {
        const nextGeneratedAvatar = cycleGeneratedAvatar(
          current.generatedAvatar.selection,
          controlId,
        );

        return {
          ...current,
          error: null,
          generatedAvatar: nextGeneratedAvatar,
          pictureUrl: nextGeneratedAvatar.pictureUrl,
          selectedPictureKind: "generated",
        };
      });
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
          customPictureUrl: pictureUrl,
          error: null,
          pictureUrl,
          selectedPictureKind: "custom",
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
        {
          identitySource: "derived",
          invalidMessageKey: "onboardingCreateFailed",
          switchedAtSec: null,
        },
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

  const savePendingOnboardingBackupToPasswordManager = React.useCallback(
    async (username: string, password: string) => {
      if (onboardingIsBusy) return;
      if (!onboardingStep || onboardingStep.kind !== "profile") return;

      setOnboardingIsBusy(true);
      try {
        await triggerPasswordManagerSeedSave({
          displayName: onboardingStep.name,
          password,
          username,
        });
      } finally {
        setOnboardingIsBusy(false);
      }
    },
    [onboardingIsBusy, onboardingStep],
  );

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

        await setIdentityFromNsecAndReload(derived.nsec, normalizedSlip39, {
          identitySource: "derived",
          invalidMessageKey: "onboardingInvalidSeed",
          switchedAtSec: null,
        });
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
      const text = await readClipboardText();
      if (text === null) {
        pushToast(t("pasteNotAvailable"));
        return;
      }

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

      await setIdentityFromNsecAndReload(derived.nsec, normalizedSeed, {
        identitySource: "derived",
        invalidMessageKey: "restoreFailed",
        recordChatNotice: true,
        switchedAtSec: null,
      });
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

  const requestPasteNostrKeys = React.useCallback(async () => {
    if (onboardingIsBusy) return;

    const normalizedSeed = String(slip39Seed ?? "").trim();
    if (!normalizedSeed) {
      pushToast(t("seedMissing"));
      return;
    }

    setOnboardingIsBusy(true);
    try {
      const text = await readClipboardText();
      if (text === null) {
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

      await setIdentityFromNsecAndReload(raw, normalizedSeed, {
        identitySource: "custom",
        invalidMessageKey: "nostrPasteInvalid",
        recordChatNotice: true,
        switchedAtSec: Math.ceil(Date.now() / 1000),
      });
    } finally {
      setOnboardingIsBusy(false);
    }
  }, [
    decodeNsecPrivateBytes,
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
      setActiveNostrIdentitySource("derived");
      setCashuSeedMnemonic(null);
      setSlip39Seed(null);
      resetStoredOwnerRotationState();

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
    activeNostrIdentitySource,
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
    requestPasteNostrKeys,
    requestLogout,
    savePendingOnboardingBackupToPasswordManager,
    cyclePendingOnboardingAvatarControl,
    selectReturningSlip39Suggestion,
    cashuSeedMnemonic,
    seedMnemonic,
    slip39Seed,
    setReturningSlip39Input,
    setOnboardingStep,
    setPendingOnboardingName,
    submitReturningSlip39,
  };
};
