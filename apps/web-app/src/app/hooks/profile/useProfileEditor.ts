import React from "react";
import {
  cycleGeneratedAvatar,
  deriveGeneratedAvatar,
  type AvatarEditorControlId,
  type DerivedAvatarSelection,
} from "../../../derivedProfile";
import { navigateTo } from "../../../hooks/useRouting";
import {
  deleteCachedProfileAvatar,
  fetchNostrProfileMetadata,
  loadCachedProfileMetadata,
  NOSTR_RELAYS,
  saveCachedProfileMetadata,
  saveCachedProfilePicture,
  type NostrProfileMetadata,
} from "../../../nostrProfile";
import { publishKind0ProfileMetadata } from "../../../nostrPublish";
import {
  buildProfileGeneralStatus,
  parseProfileExchangeStatusCurrencies,
  parseProfileGeneralStatusText,
  publishNostrGeneralStatus,
  saveCachedNostrGeneralStatus,
} from "../../../nostrStatus";
import type { JsonRecord } from "../../../types/json";
import { getBestNostrName } from "../../../utils/formatting";
import { getDefaultNip05IdentifierFromAddress } from "../../../utils/nostrNip05";
import {
  getOwnLightningAddressInputCandidate,
  type OwnLightningAddressInputCandidate,
} from "../../../utils/npubCashUsernameClaim";
import { isHttpUrl } from "../../../utils/validation";
import {
  applyLightningAddressToProfileMetadata,
  buildKind0ProfileContent,
} from "../../lib/profileMetadata";

interface UseProfileEditorParams {
  currentNpub: string | null;
  currentNsec: string | null;
  defaultLightningAddress: string | null;
  effectiveMyLightningAddress: string | null;
  effectiveProfileName: string | null;
  effectiveProfilePicture: string | null;
  myProfileMetadata: NostrProfileMetadata | null;
  myProfileStatus: string | null;
  nostrFetchRelays: string[];
  ownedLightningAddresses: readonly string[];
  ownedLightningAddressesLoading: boolean;
  setMyProfileLnAddress: React.Dispatch<React.SetStateAction<string | null>>;
  setMyProfileMetadata: React.Dispatch<
    React.SetStateAction<NostrProfileMetadata | null>
  >;
  setMyProfileName: React.Dispatch<React.SetStateAction<string | null>>;
  setMyProfilePicture: React.Dispatch<React.SetStateAction<string | null>>;
  setMyProfileStatus: React.Dispatch<React.SetStateAction<string | null>>;
  setStatus: React.Dispatch<React.SetStateAction<string | null>>;
  t: (key: string) => string;
}

interface PersistProfileValuesArgs {
  lightningAddress: string;
  name: string;
  navigateToProfile: boolean;
  picture: string;
  status: string;
}

export const useProfileEditor = ({
  currentNpub,
  currentNsec,
  defaultLightningAddress,
  effectiveMyLightningAddress,
  effectiveProfileName,
  effectiveProfilePicture,
  myProfileMetadata,
  myProfileStatus,
  nostrFetchRelays,
  ownedLightningAddresses,
  ownedLightningAddressesLoading,
  setMyProfileLnAddress,
  setMyProfileMetadata,
  setMyProfileName,
  setMyProfilePicture,
  setMyProfileStatus,
  setStatus,
  t,
}: UseProfileEditorParams) => {
  const [isProfileEditing, setIsProfileEditing] = React.useState(false);
  const [profileEditName, setProfileEditName] = React.useState("");
  const [profileEditLnAddress, setProfileEditLnAddress] = React.useState("");
  const [profileEditStatus, setProfileEditStatus] = React.useState("");
  const [profileEditPicture, setProfileEditPicture] = React.useState("");
  const [, setProfileAvatarSelection] = React.useState<DerivedAvatarSelection>(
    () => deriveGeneratedAvatar("linky").selection,
  );
  const [profileCustomPictureUrl, setProfileCustomPictureUrl] =
    React.useState("");
  const [profileSelectedPictureKind, setProfileSelectedPictureKind] =
    React.useState<"custom" | "generated">("generated");

  const profilePhotoInputRef = React.useRef<HTMLInputElement | null>(null);
  const profileEditInitialRef = React.useRef<{
    lnAddress: string;
    name: string;
    picture: string;
    status: string;
  } | null>(null);

  const toggleProfileEditing = React.useCallback(() => {
    if (isProfileEditing) {
      setIsProfileEditing(false);
      profileEditInitialRef.current = null;
      return;
    }

    const bestName = myProfileMetadata
      ? getBestNostrName(myProfileMetadata)
      : null;
    const initialName = bestName ?? effectiveProfileName ?? "";
    const initialLn = effectiveMyLightningAddress ?? "";

    const metaPic = String(
      myProfileMetadata?.picture ??
        myProfileMetadata?.image ??
        effectiveProfilePicture ??
        "",
    ).trim();

    const generatedAvatar = deriveGeneratedAvatar(currentNpub ?? initialName);
    const initialPicture = metaPic || generatedAvatar.pictureUrl;
    const customPicture =
      metaPic && metaPic !== generatedAvatar.pictureUrl ? metaPic : "";
    const initialStatus = parseProfileGeneralStatusText(myProfileStatus) ?? "";

    setProfileAvatarSelection(generatedAvatar.selection);
    setProfileCustomPictureUrl(customPicture);
    setProfileSelectedPictureKind(customPicture ? "custom" : "generated");
    setProfileEditName(initialName);
    setProfileEditLnAddress(initialLn);
    setProfileEditStatus(initialStatus);
    setProfileEditPicture(initialPicture);

    profileEditInitialRef.current = {
      name: initialName,
      lnAddress: initialLn,
      picture: initialPicture,
      status: initialStatus,
    };

    setIsProfileEditing(true);
  }, [
    effectiveMyLightningAddress,
    effectiveProfileName,
    effectiveProfilePicture,
    isProfileEditing,
    myProfileMetadata,
    myProfileStatus,
    currentNpub,
  ]);

  const profileEditsDirty = React.useMemo(() => {
    if (!isProfileEditing) return false;
    if (!profileEditInitialRef.current) return false;

    const initial = profileEditInitialRef.current;
    const name = profileEditName.trim();
    const ln = profileEditLnAddress.trim();
    const pic = profileEditPicture.trim();
    const status = profileEditStatus.trim();

    return (
      name !== initial.name.trim() ||
      ln !== initial.lnAddress.trim() ||
      pic !== initial.picture.trim() ||
      status !== initial.status.trim()
    );
  }, [
    isProfileEditing,
    profileEditLnAddress,
    profileEditName,
    profileEditPicture,
    profileEditStatus,
  ]);

  const profileEditsSavable =
    profileEditsDirty && Boolean(currentNpub && currentNsec);

  const ownLightningAddressInputCandidate = React.useMemo(() => {
    if (ownedLightningAddressesLoading) return null;
    return getOwnLightningAddressInputCandidate(profileEditLnAddress);
  }, [ownedLightningAddressesLoading, profileEditLnAddress]);

  const ownLightningAddressMatchesCurrentIdentity = React.useCallback(
    (candidate: OwnLightningAddressInputCandidate): boolean => {
      const normalizedDefault = String(defaultLightningAddress ?? "")
        .trim()
        .toLowerCase();
      if (
        normalizedDefault &&
        candidate.lightningAddress === normalizedDefault
      ) {
        return true;
      }

      for (const lightningAddress of ownedLightningAddresses) {
        const normalizedOwned = String(lightningAddress ?? "")
          .trim()
          .toLowerCase();
        if (normalizedOwned && candidate.lightningAddress === normalizedOwned) {
          return true;
        }
      }

      return false;
    },
    [defaultLightningAddress, ownedLightningAddresses],
  );

  const unregisteredOwnLightningAddress = React.useMemo(() => {
    if (!ownLightningAddressInputCandidate) return null;
    if (
      ownLightningAddressMatchesCurrentIdentity(
        ownLightningAddressInputCandidate,
      )
    ) {
      return null;
    }
    return ownLightningAddressInputCandidate;
  }, [
    ownLightningAddressInputCandidate,
    ownLightningAddressMatchesCurrentIdentity,
  ]);

  const profileLightningAddressToPersist = React.useMemo(() => {
    if (
      ownLightningAddressInputCandidate &&
      ownLightningAddressMatchesCurrentIdentity(
        ownLightningAddressInputCandidate,
      )
    ) {
      return ownLightningAddressInputCandidate.lightningAddress;
    }

    return profileEditLnAddress;
  }, [
    ownLightningAddressInputCandidate,
    ownLightningAddressMatchesCurrentIdentity,
    profileEditLnAddress,
  ]);

  const persistProfileValues = React.useCallback(
    async ({
      lightningAddress,
      name,
      navigateToProfile,
      picture,
      status,
    }: PersistProfileValuesArgs): Promise<boolean> => {
      try {
        if (!currentNpub || !currentNsec) {
          setStatus(t("profileMissingNpub"));
          return false;
        }

        const trimmedName = name.trim();
        const trimmedLightningAddress = lightningAddress.trim();
        const nextNip05 = getDefaultNip05IdentifierFromAddress(
          trimmedLightningAddress,
        );
        const trimmedPicture = picture.trim();
        const trimmedStatus = status.trim();
        const nextStatus = buildProfileGeneralStatus({
          currencies: parseProfileExchangeStatusCurrencies(myProfileStatus),
          text: status,
        });

        const { nip19 } = await import("nostr-tools");

        const decoded = nip19.decode(currentNsec);
        if (decoded.type !== "nsec") throw new Error("Invalid nsec");
        const privBytes = decoded.data as Uint8Array;

        const cachedPrev =
          loadCachedProfileMetadata(currentNpub)?.metadata ?? null;
        const livePrev = await Promise.race([
          fetchNostrProfileMetadata(currentNpub, {
            relays: nostrFetchRelays,
          }).catch(() => null),
          new Promise<null>((resolve) =>
            window.setTimeout(() => resolve(null), 2000),
          ),
        ]);

        const prev = (livePrev ??
          cachedPrev ??
          myProfileMetadata ??
          {}) as NostrProfileMetadata;

        const contentObj: JsonRecord = {
          ...(prev.name ? { name: prev.name } : {}),
          ...(prev.displayName ? { display_name: prev.displayName } : {}),
          ...(prev.picture ? { picture: prev.picture } : {}),
          ...(prev.image ? { image: prev.image } : {}),
          ...(prev.lud16 ? { lud16: prev.lud16 } : {}),
          ...(prev.lud06 ? { lud06: prev.lud06 } : {}),
          ...(prev.nip05 ? { nip05: prev.nip05 } : {}),
        };

        if (trimmedName) {
          contentObj.name = trimmedName;
          contentObj.display_name = trimmedName;
        } else {
          delete contentObj.name;
          delete contentObj.display_name;
        }

        if (trimmedLightningAddress) {
          contentObj.lud16 = trimmedLightningAddress;
        } else {
          delete contentObj.lud16;
          delete contentObj.lud06;
        }

        if (nextNip05) {
          contentObj.nip05 = nextNip05;
        } else if (getDefaultNip05IdentifierFromAddress(prev.nip05)) {
          delete contentObj.nip05;
        }

        if (trimmedPicture) {
          contentObj.picture = trimmedPicture;
          contentObj.image = trimmedPicture;
        } else {
          delete contentObj.picture;
          delete contentObj.image;
        }

        const relaysToUse =
          nostrFetchRelays.length > 0 ? nostrFetchRelays : NOSTR_RELAYS;

        const statusPublish = await publishNostrGeneralStatus({
          privBytes,
          relays: relaysToUse,
          status: nextStatus,
        });
        if (!statusPublish.anySuccess) throw new Error("status publish failed");

        const publish = await publishKind0ProfileMetadata({
          privBytes,
          relays: relaysToUse,
          content: contentObj,
        });
        if (!publish.anySuccess) throw new Error("publish failed");

        const updatedMeta: NostrProfileMetadata = { ...prev };

        if (trimmedName) {
          updatedMeta.name = trimmedName;
          updatedMeta.displayName = trimmedName;
        } else {
          delete updatedMeta.name;
          delete updatedMeta.displayName;
        }

        if (trimmedLightningAddress) {
          updatedMeta.lud16 = trimmedLightningAddress;
        } else {
          delete updatedMeta.lud16;
          delete updatedMeta.lud06;
        }

        if (nextNip05) {
          updatedMeta.nip05 = nextNip05;
        } else if (getDefaultNip05IdentifierFromAddress(prev.nip05)) {
          delete updatedMeta.nip05;
        }

        if (trimmedPicture) {
          updatedMeta.picture = trimmedPicture;
          updatedMeta.image = trimmedPicture;
        } else {
          delete updatedMeta.picture;
          delete updatedMeta.image;
        }

        saveCachedProfileMetadata(currentNpub, updatedMeta);
        saveCachedProfilePicture(currentNpub, trimmedPicture || null);
        saveCachedNostrGeneralStatus(currentNpub, nextStatus);
        setMyProfileMetadata(updatedMeta);
        setMyProfileName(trimmedName || null);
        setMyProfileLnAddress(trimmedLightningAddress || null);
        setMyProfilePicture(trimmedPicture || null);
        setMyProfileStatus(nextStatus);
        setProfileEditName(trimmedName);
        setProfileEditLnAddress(trimmedLightningAddress);
        setProfileEditPicture(trimmedPicture);
        setProfileEditStatus(trimmedStatus);

        profileEditInitialRef.current = {
          lnAddress: trimmedLightningAddress,
          name: trimmedName,
          picture: trimmedPicture,
          status: trimmedStatus,
        };

        if (!trimmedPicture || !isHttpUrl(trimmedPicture)) {
          void deleteCachedProfileAvatar(currentNpub);
        }

        if (navigateToProfile) {
          setIsProfileEditing(false);
          profileEditInitialRef.current = null;
          navigateTo({ route: "profile" });
        }

        return true;
      } catch (error) {
        setStatus(`${t("errorPrefix")}: ${String(error ?? "unknown")}`);
        return false;
      }
    },
    [
      currentNpub,
      currentNsec,
      myProfileMetadata,
      myProfileStatus,
      nostrFetchRelays,
      setMyProfileLnAddress,
      setMyProfileMetadata,
      setMyProfileName,
      setMyProfilePicture,
      setMyProfileStatus,
      setStatus,
      t,
    ],
  );

  const saveProfileEdits = React.useCallback(async () => {
    if (unregisteredOwnLightningAddress) {
      return;
    }

    await persistProfileValues({
      lightningAddress: profileLightningAddressToPersist,
      name: profileEditName,
      navigateToProfile: true,
      picture: profileEditPicture,
      status: profileEditStatus,
    });
  }, [
    profileLightningAddressToPersist,
    profileEditName,
    profileEditPicture,
    profileEditStatus,
    persistProfileValues,
    unregisteredOwnLightningAddress,
  ]);

  const saveClaimedLightningAddress = React.useCallback(
    async (lightningAddress: string): Promise<boolean> => {
      try {
        if (!currentNpub || !currentNsec) {
          setStatus(t("profileMissingNpub"));
          return false;
        }

        const { nip19 } = await import("nostr-tools");
        const decoded = nip19.decode(currentNsec);
        if (decoded.type !== "nsec" || !(decoded.data instanceof Uint8Array)) {
          throw new Error("Invalid nsec");
        }
        const privBytes = decoded.data;

        const cachedPrev =
          loadCachedProfileMetadata(currentNpub)?.metadata ?? null;
        const livePrev = await Promise.race([
          fetchNostrProfileMetadata(currentNpub, {
            relays: nostrFetchRelays,
          }).catch(() => null),
          new Promise<null>((resolve) =>
            window.setTimeout(() => resolve(null), 2000),
          ),
        ]);

        const emptyMetadata: NostrProfileMetadata = {};
        const prev =
          livePrev ?? cachedPrev ?? myProfileMetadata ?? emptyMetadata;
        const next = applyLightningAddressToProfileMetadata(
          prev,
          lightningAddress,
        );
        const relaysToUse =
          nostrFetchRelays.length > 0 ? nostrFetchRelays : NOSTR_RELAYS;

        const publish = await publishKind0ProfileMetadata({
          privBytes,
          relays: relaysToUse,
          content: buildKind0ProfileContent(next.metadata),
        });
        if (!publish.anySuccess) throw new Error("publish failed");

        const bestName = getBestNostrName(next.metadata);
        const picture = String(
          next.metadata.picture ??
            next.metadata.image ??
            effectiveProfilePicture ??
            "",
        ).trim();
        const statusText = parseProfileGeneralStatusText(myProfileStatus) ?? "";

        saveCachedProfileMetadata(currentNpub, next.metadata);
        setMyProfileMetadata(next.metadata);
        setMyProfileLnAddress(next.lightningAddress || null);
        setMyProfileName(bestName ?? effectiveProfileName);
        setMyProfilePicture(picture || effectiveProfilePicture);

        setProfileEditName(bestName ?? effectiveProfileName ?? "");
        setProfileEditLnAddress(next.lightningAddress);
        setProfileEditPicture(picture);
        setProfileEditStatus(statusText);
        profileEditInitialRef.current = {
          lnAddress: next.lightningAddress,
          name: bestName ?? effectiveProfileName ?? "",
          picture,
          status: statusText,
        };

        return true;
      } catch (error) {
        setStatus(`${t("errorPrefix")}: ${String(error ?? "unknown")}`);
        return false;
      }
    },
    [
      currentNpub,
      currentNsec,
      effectiveProfileName,
      effectiveProfilePicture,
      myProfileMetadata,
      myProfileStatus,
      nostrFetchRelays,
      setMyProfileLnAddress,
      setMyProfileMetadata,
      setMyProfileName,
      setMyProfilePicture,
      setStatus,
      t,
    ],
  );

  const onPickProfilePhoto = React.useCallback(async () => {
    profilePhotoInputRef.current?.click();
  }, []);

  const cycleProfileAvatarControl = React.useCallback(
    (controlId: AvatarEditorControlId) => {
      setProfileAvatarSelection((currentSelection) => {
        const nextAvatar = cycleGeneratedAvatar(currentSelection, controlId);
        setProfileSelectedPictureKind("generated");
        setProfileEditPicture(nextAvatar.pictureUrl);
        return nextAvatar.selection;
      });
    },
    [],
  );

  const onProfilePhotoSelected = React.useCallback((dataUrl: string) => {
    setProfileCustomPictureUrl(dataUrl);
    setProfileSelectedPictureKind("custom");
    setProfileEditPicture(dataUrl);
  }, []);

  const onProfilePhotoError = React.useCallback(
    (error: unknown) => {
      setStatus(`${t("errorPrefix")}: ${String(error ?? "unknown")}`);
    },
    [setStatus, t],
  );

  return {
    cycleProfileAvatarControl,
    isProfileEditing,
    onPickProfilePhoto,
    onProfilePhotoError,
    onProfilePhotoSelected,
    profileCustomPictureUrl,
    profileEditInitialRef,
    profileEditLnAddress,
    profileEditName,
    profileEditPicture,
    profileEditStatus,
    profileEditsSavable,
    unregisteredOwnLightningAddress,
    profilePhotoInputRef,
    profileSelectedPictureKind,
    saveClaimedLightningAddress,
    saveProfileEdits,
    setIsProfileEditing,
    setProfileEditLnAddress,
    setProfileEditName,
    setProfileEditStatus,
    setProfileEditPicture,
    toggleProfileEditing,
  };
};
