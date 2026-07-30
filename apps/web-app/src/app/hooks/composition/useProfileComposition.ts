import React from "react";
import {
  DEFAULT_LIGHTNING_ADDRESS_DOMAIN,
  deriveDefaultLightningAddress,
  deriveDefaultProfile,
} from "../../../derivedProfile";
import type { Lang } from "../../../i18n";
import type { NostrProfileMetadata } from "../../../nostrProfile";
import { navigateTo, type useRouting } from "../../../hooks/useRouting";
import { resolveNpubCashServerBaseUrl } from "../../../utils/npubCashServer";
import { getInitialShowProfileQrOnTiltEnabled } from "../../../utils/storage";
import { usePortraitOrientationLock } from "../usePortraitOrientationLock";
import { useProfileEditor } from "../profile/useProfileEditor";
import { useProfileMetadataSyncEffect } from "../profile/useProfileMetadataSyncEffect";
import { useProfileStatusEditor } from "../profile/useProfileStatusEditor";
import { useProfileStatusSyncEffect } from "../profile/useProfileStatusSyncEffect";

interface UseProfileCompositionParams {
  currentNpub: string | null;
  currentNsec: string | null;
  lang: Lang;
  nostrBootstrapReady: boolean;
  nostrFetchRelays: string[];
  rememberBlobAvatarUrl: (npub: string, url: string | null) => string | null;
  route: ReturnType<typeof useRouting>;
  setStatus: React.Dispatch<React.SetStateAction<string | null>>;
  t: (key: string) => string;
}

export const useProfileComposition = ({
  currentNpub,
  currentNsec,
  lang,
  nostrBootstrapReady,
  nostrFetchRelays,
  rememberBlobAvatarUrl,
  route,
  setStatus,
  t,
}: UseProfileCompositionParams) => {
  const [showProfileQrOnTiltEnabled, setShowProfileQrOnTiltEnabled] =
    React.useState<boolean>(() => getInitialShowProfileQrOnTiltEnabled());
  const [myProfileName, setMyProfileName] = React.useState<string | null>(null);
  const [myProfilePicture, setMyProfilePicture] = React.useState<string | null>(
    null,
  );
  const [myProfileQr, setMyProfileQr] = React.useState<string | null>(null);
  const [myProfileLnAddress, setMyProfileLnAddress] = React.useState<
    string | null
  >(null);
  const [ownedProfileLightningAddresses, setOwnedProfileLightningAddresses] =
    React.useState<string[]>([]);
  const [
    ownedProfileLightningAddressesLoading,
    setOwnedProfileLightningAddressesLoading,
  ] = React.useState(true);
  const [myProfileStatus, setMyProfileStatus] = React.useState<string | null>(
    null,
  );
  const [myProfileMetadata, setMyProfileMetadata] =
    React.useState<NostrProfileMetadata | null>(null);

  const npubCashInfoInFlightRef = React.useRef(false);
  const npubCashInfoLoadedForNpubRef = React.useRef<string | null>(null);
  const npubCashInfoLoadedAtMsRef = React.useRef<number>(0);

  usePortraitOrientationLock(showProfileQrOnTiltEnabled);

  const defaultLightningAddress = React.useMemo(() => {
    if (!currentNpub) return null;
    return deriveDefaultLightningAddress(currentNpub);
  }, [currentNpub]);

  const derivedProfile = React.useMemo(() => {
    if (!currentNpub) return null;
    return deriveDefaultProfile(currentNpub, lang);
  }, [currentNpub, lang]);

  const effectiveProfileName = myProfileName ?? derivedProfile?.name ?? null;
  const effectiveProfilePicture =
    myProfilePicture ?? derivedProfile?.pictureUrl ?? null;

  const effectiveMyLightningAddress =
    myProfileLnAddress ?? defaultLightningAddress;

  const npubCashServerBaseUrl = React.useMemo(() => {
    return resolveNpubCashServerBaseUrl(effectiveMyLightningAddress);
  }, [effectiveMyLightningAddress]);

  const profileClaimLightningAddressServerBaseUrl = React.useMemo(() => {
    return resolveNpubCashServerBaseUrl(
      `claim@${DEFAULT_LIGHTNING_ADDRESS_DOMAIN}`,
    );
  }, []);

  const {
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
    profilePhotoInputRef,
    profileSelectedPictureKind,
    saveClaimedLightningAddress,
    saveProfileEdits,
    setIsProfileEditing,
    setProfileEditLnAddress,
    setProfileEditName,
    setProfileEditStatus,
    toggleProfileEditing,
    unregisteredOwnLightningAddress,
  } = useProfileEditor({
    currentNpub,
    currentNsec,
    defaultLightningAddress,
    effectiveMyLightningAddress,
    effectiveProfileName,
    effectiveProfilePicture,
    myProfileMetadata,
    myProfileStatus,
    nostrFetchRelays,
    ownedLightningAddresses: ownedProfileLightningAddresses,
    ownedLightningAddressesLoading: ownedProfileLightningAddressesLoading,
    setMyProfileLnAddress,
    setMyProfileMetadata,
    setMyProfileName,
    setMyProfilePicture,
    setMyProfileStatus,
    setStatus,
    t,
  });

  useProfileMetadataSyncEffect({
    canFetchFromNostr: nostrBootstrapReady,
    currentNpub,
    nostrFetchRelays,
    rememberBlobAvatarUrl,
    setMyProfileLnAddress,
    setMyProfileMetadata,
    setMyProfileName,
    setMyProfilePicture,
  });

  useProfileStatusSyncEffect({
    canFetchFromNostr: nostrBootstrapReady,
    currentNpub,
    nostrFetchRelays,
    setMyProfileStatus,
  });

  const {
    profileStatusCurrencies,
    profileStatusIsSaving,
    selectedProfileStatusCurrencies,
    toggleProfileStatusCurrency,
  } = useProfileStatusEditor({
    currentNpub,
    currentNsec,
    myProfileStatus,
    nostrFetchRelays,
    setMyProfileStatus,
    setStatus,
    t,
  });

  React.useEffect(() => {
    if (route.kind !== "profileEdit") {
      return;
    }

    if (!isProfileEditing) {
      toggleProfileEditing();
    }
  }, [isProfileEditing, route.kind, toggleProfileEditing]);

  // Intentionally no automatic publishing of kind-0 profile metadata.
  // We only publish profile changes when the user does so explicitly.

  const openProfileQr = React.useCallback(() => {
    navigateTo({ route: "profile" });
  }, []);

  return {
    cycleProfileAvatarControl,
    defaultLightningAddress,
    derivedProfile,
    effectiveMyLightningAddress,
    effectiveProfileName,
    effectiveProfilePicture,
    isProfileEditing,
    myProfileLnAddress,
    myProfileMetadata,
    myProfileName,
    myProfilePicture,
    myProfileQr,
    myProfileStatus,
    npubCashInfoInFlightRef,
    npubCashInfoLoadedAtMsRef,
    npubCashInfoLoadedForNpubRef,
    npubCashServerBaseUrl,
    onPickProfilePhoto,
    onProfilePhotoError,
    onProfilePhotoSelected,
    openProfileQr,
    ownedProfileLightningAddresses,
    ownedProfileLightningAddressesLoading,
    profileClaimLightningAddressServerBaseUrl,
    profileCustomPictureUrl,
    profileEditInitialRef,
    profileEditLnAddress,
    profileEditName,
    profileEditPicture,
    profileEditStatus,
    profileEditsSavable,
    profilePhotoInputRef,
    profileSelectedPictureKind,
    profileStatusCurrencies,
    profileStatusIsSaving,
    saveClaimedLightningAddress,
    saveProfileEdits,
    selectedProfileStatusCurrencies,
    setIsProfileEditing,
    setMyProfileLnAddress,
    setMyProfileMetadata,
    setMyProfileName,
    setMyProfilePicture,
    setMyProfileQr,
    setMyProfileStatus,
    setOwnedProfileLightningAddresses,
    setOwnedProfileLightningAddressesLoading,
    setProfileEditLnAddress,
    setProfileEditName,
    setProfileEditStatus,
    setShowProfileQrOnTiltEnabled,
    showProfileQrOnTiltEnabled,
    toggleProfileEditing,
    toggleProfileStatusCurrency,
    unregisteredOwnLightningAddress,
  };
};
