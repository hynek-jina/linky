import React from "react";
import {
  cacheProfileAvatarFromUrl,
  deleteCachedProfileAvatar,
  fetchNostrProfileMetadata,
  fetchNostrProfilePicture,
  loadCachedProfileAvatarObjectUrl,
  loadCachedProfileMetadata,
  loadCachedProfilePicture,
  saveCachedProfileMetadata,
  saveCachedProfilePicture,
  type NostrProfileMetadata,
} from "../../../nostrProfile";
import { getBestNostrName } from "../../../utils/formatting";

interface UseProfileMetadataSyncEffectParams {
  currentNpub: string | null;
  nostrFetchRelays: string[];
  rememberBlobAvatarUrl: (npub: string, url: string | null) => string | null;
  setMyProfileLnAddress: React.Dispatch<React.SetStateAction<string | null>>;
  setMyProfileMetadata: React.Dispatch<
    React.SetStateAction<NostrProfileMetadata | null>
  >;
  setMyProfileName: React.Dispatch<React.SetStateAction<string | null>>;
  setMyProfilePicture: React.Dispatch<React.SetStateAction<string | null>>;
}

export const useProfileMetadataSyncEffect = ({
  currentNpub,
  nostrFetchRelays,
  rememberBlobAvatarUrl,
  setMyProfileLnAddress,
  setMyProfileMetadata,
  setMyProfileName,
  setMyProfilePicture,
}: UseProfileMetadataSyncEffectParams) => {
  React.useEffect(() => {
    // Load current user's Nostr profile (name + picture) from relays.
    if (!currentNpub) return;

    const cachedBlobController = new AbortController();
    let cancelledBlob = false;
    void (async () => {
      try {
        const blobUrl = await loadCachedProfileAvatarObjectUrl(currentNpub);
        if (cancelledBlob) return;
        if (blobUrl) {
          setMyProfilePicture(rememberBlobAvatarUrl(currentNpub, blobUrl));
        }
      } catch {
        // ignore
      }
    })();

    const cachedPic = loadCachedProfilePicture(currentNpub);
    if (cachedPic) setMyProfilePicture(cachedPic.url);

    const cachedMeta = loadCachedProfileMetadata(currentNpub);
    if (cachedMeta?.metadata) {
      setMyProfileMetadata(cachedMeta.metadata);
      const bestName = getBestNostrName(cachedMeta.metadata);
      if (bestName) setMyProfileName(bestName);

      const lud16 = String(cachedMeta.metadata.lud16 ?? "").trim();
      const lud06 = String(cachedMeta.metadata.lud06 ?? "").trim();
      const ln = lud16 || lud06;
      if (ln) setMyProfileLnAddress(ln);
    }

    const controller = new AbortController();
    let cancelled = false;

    const run = async () => {
      try {
        const [picture, metadata] = await Promise.all([
          fetchNostrProfilePicture(currentNpub, {
            signal: controller.signal,
            relays: nostrFetchRelays,
          }),
          fetchNostrProfileMetadata(currentNpub, {
            signal: controller.signal,
            relays: nostrFetchRelays,
          }),
        ]);

        if (cancelled) return;

        if (picture) {
          // Persist the source URL (for future refresh), but display a cached blob when possible.
          saveCachedProfilePicture(currentNpub, picture);

          const blobUrl = await cacheProfileAvatarFromUrl(
            currentNpub,
            picture,
            {
              signal: controller.signal,
            },
          );
          if (cancelled) return;
          setMyProfilePicture(
            rememberBlobAvatarUrl(currentNpub, blobUrl || picture),
          );
        }

        if (metadata) {
          saveCachedProfileMetadata(currentNpub, metadata);
          setMyProfileMetadata(metadata);
        }

        const bestName = metadata ? getBestNostrName(metadata) : null;
        if (bestName) setMyProfileName(bestName);

        // Only clear avatar if we positively observed kind-0 metadata without picture/image.
        if (
          metadata &&
          !String(metadata.picture ?? "").trim() &&
          !String(metadata.image ?? "").trim()
        ) {
          saveCachedProfilePicture(currentNpub, null);
          void deleteCachedProfileAvatar(currentNpub);
          rememberBlobAvatarUrl(currentNpub, null);
          setMyProfilePicture(null);
        }

        if (!picture) {
          console.log("[linky][nostr] profile picture missing", {
            npub: currentNpub,
            relays: { count: nostrFetchRelays.length, urls: nostrFetchRelays },
            metadataHasPicture: Boolean(
              String(metadata?.picture ?? "").trim() ||
              String(metadata?.image ?? "").trim(),
            ),
          });
        }

        const lud16 = String(metadata?.lud16 ?? "").trim();
        const lud06 = String(metadata?.lud06 ?? "").trim();
        const ln = lud16 || lud06;
        setMyProfileLnAddress(ln || null);
      } catch {
        // ignore
      }
    };

    void run();
    return () => {
      cancelled = true;
      controller.abort();
      cancelledBlob = true;
      cachedBlobController.abort();
    };
  }, [
    currentNpub,
    nostrFetchRelays,
    rememberBlobAvatarUrl,
    setMyProfileLnAddress,
    setMyProfileMetadata,
    setMyProfileName,
    setMyProfilePicture,
  ]);
};
