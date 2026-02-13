import * as Evolu from "@evolu/common";
import React from "react";
import {
  cacheProfileAvatarFromUrl,
  fetchNostrProfileMetadata,
  fetchNostrProfilePicture,
  loadCachedProfileAvatarObjectUrl,
  loadCachedProfileMetadata,
  loadCachedProfilePicture,
  saveCachedProfileMetadata,
  saveCachedProfilePicture,
} from "../../nostrProfile";
import { getBestNostrName } from "../../utils/formatting";

type EvoluMutations = ReturnType<typeof import("../../evolu").useEvolu>;

interface UseContactsNostrPrefetchEffectsParams<
  TContact extends {
    id: string;
    lnAddress?: unknown;
    name?: unknown;
    npub?: unknown;
  },
> {
  contacts: readonly TContact[];
  nostrFetchRelays: string[];
  nostrInFlight: React.MutableRefObject<Set<string>>;
  nostrMetadataInFlight: React.MutableRefObject<Set<string>>;
  nostrPictureByNpub: Record<string, string | null>;
  rememberBlobAvatarUrl: (npub: string, url: string | null) => string | null;
  routeKind: string;
  setNostrPictureByNpub: React.Dispatch<
    React.SetStateAction<Record<string, string | null>>
  >;
  update: EvoluMutations["update"];
}

export const useContactsNostrPrefetchEffects = <
  TContact extends {
    id: string;
    lnAddress?: unknown;
    name?: unknown;
    npub?: unknown;
  },
>({
  contacts,
  nostrFetchRelays,
  nostrInFlight,
  nostrMetadataInFlight,
  nostrPictureByNpub,
  rememberBlobAvatarUrl,
  routeKind,
  setNostrPictureByNpub,
  update,
}: UseContactsNostrPrefetchEffectsParams<TContact>) => {
  React.useEffect(() => {
    // Fill missing name / lightning address from Nostr on list page only,
    // so we don't overwrite user's in-progress edits.
    if (routeKind !== "contacts") return;

    const controller = new AbortController();
    let cancelled = false;

    const run = async () => {
      for (const contact of contacts) {
        const npub = String(contact.npub ?? "").trim();
        if (!npub) continue;

        const currentName = String(contact.name ?? "").trim();
        const currentLn = String(contact.lnAddress ?? "").trim();

        const needsName = !currentName;
        const needsLn = !currentLn;
        if (!needsName && !needsLn) continue;

        // Try cached metadata first.
        const cached = loadCachedProfileMetadata(npub);
        if (cached?.metadata) {
          const bestName = getBestNostrName(cached.metadata);
          const lud16 = String(cached.metadata.lud16 ?? "").trim();
          const patch: Partial<{
            name: typeof Evolu.NonEmptyString1000.Type;
            lnAddress: typeof Evolu.NonEmptyString1000.Type;
          }> = {};

          if (needsName && bestName) {
            patch.name = bestName as typeof Evolu.NonEmptyString1000.Type;
          }
          if (needsLn && lud16) {
            patch.lnAddress = lud16 as typeof Evolu.NonEmptyString1000.Type;
          }

          if (Object.keys(patch).length > 0) {
            update("contact", { id: contact.id, ...patch });
          }
          continue;
        }

        if (nostrMetadataInFlight.current.has(npub)) continue;
        nostrMetadataInFlight.current.add(npub);

        try {
          const metadata = await fetchNostrProfileMetadata(npub, {
            signal: controller.signal,
            relays: nostrFetchRelays,
          });

          saveCachedProfileMetadata(npub, metadata);
          if (cancelled) return;
          if (!metadata) continue;

          const bestName = getBestNostrName(metadata);
          const lud16 = String(metadata.lud16 ?? "").trim();

          const patch: Partial<{
            name: typeof Evolu.NonEmptyString1000.Type;
            lnAddress: typeof Evolu.NonEmptyString1000.Type;
          }> = {};

          if (needsName && bestName) {
            patch.name = bestName as typeof Evolu.NonEmptyString1000.Type;
          }
          if (needsLn && lud16) {
            patch.lnAddress = lud16 as typeof Evolu.NonEmptyString1000.Type;
          }

          if (Object.keys(patch).length > 0) {
            update("contact", { id: contact.id, ...patch });
          }
        } catch {
          saveCachedProfileMetadata(npub, null);
          if (cancelled) return;
        } finally {
          nostrMetadataInFlight.current.delete(npub);
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [contacts, routeKind, update, nostrFetchRelays, nostrMetadataInFlight]);

  React.useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    const uniqueNpubs: string[] = [];
    const seen = new Set<string>();
    for (const contact of contacts) {
      const raw = (contact.npub ?? null) as string | null;
      const npub = (raw ?? "").trim();
      if (!npub) continue;
      if (seen.has(npub)) continue;
      seen.add(npub);
      uniqueNpubs.push(npub);
    }

    const run = async () => {
      for (const npub of uniqueNpubs) {
        if (nostrPictureByNpub[npub] !== undefined) continue;

        try {
          const blobUrl = await loadCachedProfileAvatarObjectUrl(npub);
          if (cancelled) return;
          if (blobUrl) {
            setNostrPictureByNpub((prev) => ({
              ...prev,
              [npub]: rememberBlobAvatarUrl(npub, blobUrl),
            }));
            continue;
          }
        } catch {
          // ignore
        }

        const cached = loadCachedProfilePicture(npub);
        if (cached) {
          setNostrPictureByNpub((prev) =>
            prev[npub] !== undefined ? prev : { ...prev, [npub]: cached.url },
          );
          continue;
        }

        if (nostrInFlight.current.has(npub)) continue;
        nostrInFlight.current.add(npub);

        try {
          const url = await fetchNostrProfilePicture(npub, {
            signal: controller.signal,
            relays: nostrFetchRelays,
          });
          saveCachedProfilePicture(npub, url);
          if (cancelled) return;

          if (url) {
            const blobUrl = await cacheProfileAvatarFromUrl(npub, url, {
              signal: controller.signal,
            });
            if (cancelled) return;
            setNostrPictureByNpub((prev) => ({
              ...prev,
              [npub]: rememberBlobAvatarUrl(npub, blobUrl || url),
            }));
          } else {
            setNostrPictureByNpub((prev) => {
              const existing = prev[npub];
              if (typeof existing === "string" && existing.trim()) return prev;
              if (existing === null) return prev;
              return { ...prev, [npub]: null };
            });
          }
        } catch {
          saveCachedProfilePicture(npub, null);
          if (cancelled) return;
          setNostrPictureByNpub((prev) => {
            const existing = prev[npub];
            if (typeof existing === "string" && existing.trim()) return prev;
            if (existing === null) return prev;
            return { ...prev, [npub]: null };
          });
        } finally {
          nostrInFlight.current.delete(npub);
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [
    contacts,
    nostrInFlight,
    nostrPictureByNpub,
    rememberBlobAvatarUrl,
    nostrFetchRelays,
    setNostrPictureByNpub,
  ]);
};
