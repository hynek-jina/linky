import React from "react";
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
import { getBestNostrName } from "../../../utils/formatting";
import { createSquareAvatarDataUrl } from "../../../utils/image";

interface UseProfileEditorParams {
  currentNpub: string | null;
  currentNsec: string | null;
  effectiveMyLightningAddress: string | null;
  effectiveProfileName: string | null;
  effectiveProfilePicture: string | null;
  myProfileMetadata: NostrProfileMetadata | null;
  nostrFetchRelays: string[];
  setMyProfileLnAddress: React.Dispatch<React.SetStateAction<string | null>>;
  setMyProfileMetadata: React.Dispatch<
    React.SetStateAction<NostrProfileMetadata | null>
  >;
  setMyProfileName: React.Dispatch<React.SetStateAction<string | null>>;
  setMyProfilePicture: React.Dispatch<React.SetStateAction<string | null>>;
  setStatus: React.Dispatch<React.SetStateAction<string | null>>;
  t: (key: string) => string;
}

export const useProfileEditor = ({
  currentNpub,
  currentNsec,
  effectiveMyLightningAddress,
  effectiveProfileName,
  effectiveProfilePicture,
  myProfileMetadata,
  nostrFetchRelays,
  setMyProfileLnAddress,
  setMyProfileMetadata,
  setMyProfileName,
  setMyProfilePicture,
  setStatus,
  t,
}: UseProfileEditorParams) => {
  const [isProfileEditing, setIsProfileEditing] = React.useState(false);
  const [profileEditName, setProfileEditName] = React.useState("");
  const [profileEditLnAddress, setProfileEditLnAddress] = React.useState("");
  const [profileEditPicture, setProfileEditPicture] = React.useState("");

  const profilePhotoInputRef = React.useRef<HTMLInputElement | null>(null);
  const profileEditInitialRef = React.useRef<{
    lnAddress: string;
    name: string;
    picture: string;
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

    setProfileEditName(initialName);
    setProfileEditLnAddress(initialLn);
    setProfileEditPicture(metaPic);

    profileEditInitialRef.current = {
      name: initialName,
      lnAddress: initialLn,
      picture: metaPic,
    };

    setIsProfileEditing(true);
  }, [
    effectiveMyLightningAddress,
    effectiveProfileName,
    effectiveProfilePicture,
    isProfileEditing,
    myProfileMetadata,
  ]);

  const profileEditsDirty = React.useMemo(() => {
    if (!isProfileEditing) return false;
    if (!profileEditInitialRef.current) return false;

    const initial = profileEditInitialRef.current;
    const name = profileEditName.trim();
    const ln = profileEditLnAddress.trim();
    const pic = profileEditPicture.trim();

    return (
      name !== initial.name.trim() ||
      ln !== initial.lnAddress.trim() ||
      pic !== initial.picture.trim()
    );
  }, [
    isProfileEditing,
    profileEditLnAddress,
    profileEditName,
    profileEditPicture,
  ]);

  const profileEditsSavable =
    profileEditsDirty && Boolean(currentNpub && currentNsec);

  const saveProfileEdits = React.useCallback(async () => {
    try {
      if (!currentNpub || !currentNsec) {
        setStatus(t("profileMissingNpub"));
        return;
      }

      const name = profileEditName.trim();
      const ln = profileEditLnAddress.trim();
      const picture = profileEditPicture.trim();

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

      const contentObj: Record<string, unknown> = {
        ...(prev.name ? { name: prev.name } : {}),
        ...(prev.displayName ? { display_name: prev.displayName } : {}),
        ...(prev.picture ? { picture: prev.picture } : {}),
        ...(prev.image ? { image: prev.image } : {}),
        ...(prev.lud16 ? { lud16: prev.lud16 } : {}),
        ...(prev.lud06 ? { lud06: prev.lud06 } : {}),
      };

      if (name) {
        contentObj.name = name;
        contentObj.display_name = name;
      } else {
        delete contentObj.name;
        delete contentObj.display_name;
      }

      if (ln) {
        contentObj.lud16 = ln;
      } else {
        delete contentObj.lud16;
        delete contentObj.lud06;
      }

      if (picture) {
        contentObj.picture = picture;
        contentObj.image = picture;
      } else {
        delete contentObj.picture;
        delete contentObj.image;
      }

      const relaysToUse =
        nostrFetchRelays.length > 0 ? nostrFetchRelays : NOSTR_RELAYS;

      const publish = await publishKind0ProfileMetadata({
        privBytes,
        relays: relaysToUse,
        content: contentObj,
      });
      if (!publish.anySuccess) throw new Error("publish failed");

      const updatedMeta: NostrProfileMetadata = { ...prev };

      if (name) {
        updatedMeta.name = name;
        updatedMeta.displayName = name;
      } else {
        delete updatedMeta.name;
        delete updatedMeta.displayName;
      }

      if (ln) {
        updatedMeta.lud16 = ln;
      } else {
        delete updatedMeta.lud16;
        delete updatedMeta.lud06;
      }

      if (picture) {
        updatedMeta.picture = picture;
        updatedMeta.image = picture;
      } else {
        delete updatedMeta.picture;
        delete updatedMeta.image;
      }

      saveCachedProfileMetadata(currentNpub, updatedMeta);
      saveCachedProfilePicture(currentNpub, picture || null);
      setMyProfileMetadata(updatedMeta);

      setMyProfileName(name || null);
      setMyProfileLnAddress(ln || null);
      setMyProfilePicture(picture || null);
      if (!picture) {
        void deleteCachedProfileAvatar(currentNpub);
      }

      setIsProfileEditing(false);
      profileEditInitialRef.current = null;
    } catch (error) {
      setStatus(`${t("errorPrefix")}: ${String(error ?? "unknown")}`);
    }
  }, [
    currentNpub,
    currentNsec,
    myProfileMetadata,
    nostrFetchRelays,
    profileEditLnAddress,
    profileEditName,
    profileEditPicture,
    setMyProfileLnAddress,
    setMyProfileMetadata,
    setMyProfileName,
    setMyProfilePicture,
    setStatus,
    t,
  ]);

  const onPickProfilePhoto = React.useCallback(async () => {
    profilePhotoInputRef.current?.click();
  }, []);

  const onProfilePhotoSelected = React.useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0] ?? null;
      event.target.value = "";
      if (!file) return;

      try {
        const dataUrl = await createSquareAvatarDataUrl(file, 160);
        setProfileEditPicture(dataUrl);
      } catch (error) {
        setStatus(`${t("errorPrefix")}: ${String(error ?? "unknown")}`);
      }
    },
    [setStatus, t],
  );

  return {
    isProfileEditing,
    onPickProfilePhoto,
    onProfilePhotoSelected,
    profileEditInitialRef,
    profileEditLnAddress,
    profileEditName,
    profileEditPicture,
    profileEditsSavable,
    profilePhotoInputRef,
    saveProfileEdits,
    setIsProfileEditing,
    setProfileEditLnAddress,
    setProfileEditName,
    setProfileEditPicture,
    toggleProfileEditing,
  };
};
