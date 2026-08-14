import * as Evolu from "@evolu/common";
import React from "react";
import { omitSyntheticContactLightningAddress } from "../../derivedProfile";
import {
  cacheProfileAvatarFromUrl,
  deleteCachedProfileAvatar,
  fetchNostrProfileMetadata,
  getNostrProfilePictureUrl,
  isCachedProfilePictureStale,
  loadCachedProfileAvatarObjectUrl,
  loadCachedProfileMetadata,
  loadCachedProfilePicture,
  primeProfileMetadataCache,
  recordProfileMetadataLookup,
  recordProfilePictureLookup,
  saveCachedProfileMetadata,
  saveCachedProfilePicture,
} from "../../nostrProfile";
import {
  fetchNostrGeneralStatus,
  loadCachedNostrGeneralStatus,
  saveCachedNostrGeneralStatus,
} from "../../nostrStatus";
import { getBestNostrName } from "../../utils/formatting";
import { normalizeNpubIdentifier } from "../../utils/nostrNpub";
import { isHttpUrl } from "../../utils/validation";
import { resolveContactRowOwnerLane } from "../lib/contactOwnerLane";
import type { ContactRowLike } from "../types/appTypes";

type EvoluMutations = ReturnType<typeof import("../../evolu").useEvolu>;

interface UseContactsNostrPrefetchEffectsParams<
  TContact extends ContactRowLike & { id: string },
> {
  appOwnerId: Evolu.OwnerId | null;
  canFetchFromNostr?: boolean;
  contacts: readonly TContact[];
  nostrFetchRelays: string[];
  nostrInFlight: React.MutableRefObject<Set<string>>;
  nostrMetadataInFlight: React.MutableRefObject<Set<string>>;
  nostrStatusByNpub: Record<string, string | null>;
  nostrStatusInFlight: React.MutableRefObject<Set<string>>;
  rememberBlobAvatarUrl: (npub: string, url: string | null) => string | null;
  routeKind: string;
  setNostrPictureByNpub: React.Dispatch<
    React.SetStateAction<Record<string, string | null>>
  >;
  setNostrStatusByNpub: React.Dispatch<
    React.SetStateAction<Record<string, string | null>>
  >;
  update: EvoluMutations["update"];
  visibleOwnerIds: readonly Evolu.OwnerId[];
}

export const useContactsNostrPrefetchEffects = <
  TContact extends ContactRowLike & { id: string },
>({
  appOwnerId,
  canFetchFromNostr = true,
  contacts,
  nostrFetchRelays,
  nostrInFlight,
  nostrMetadataInFlight,
  nostrStatusByNpub,
  nostrStatusInFlight,
  rememberBlobAvatarUrl,
  routeKind,
  setNostrPictureByNpub,
  setNostrStatusByNpub,
  update,
  visibleOwnerIds,
}: UseContactsNostrPrefetchEffectsParams<TContact>) => {
  const metadataPromisesRef = React.useRef<
    Map<string, Promise<Awaited<ReturnType<typeof fetchNostrProfileMetadata>>>>
  >(new Map());
  const metadataCompletedRef = React.useRef<Set<string>>(new Set());
  const statusCompletedRef = React.useRef<Set<string>>(new Set());
  const statusByNpubRef = React.useRef(nostrStatusByNpub);
  const contactsRef = React.useRef(contacts);
  statusByNpubRef.current = nostrStatusByNpub;
  contactsRef.current = contacts;
  const metadataContactsKey = contacts
    .map(
      (contact) =>
        `${contact.id}:${normalizeNpubIdentifier(contact.npub) ?? ""}`,
    )
    .sort()
    .join("|");
  const uniqueNpubsKey = Array.from(
    new Set(
      contacts
        .map((contact) => normalizeNpubIdentifier(contact.npub))
        .filter((npub): npub is string => Boolean(npub)),
    ),
  )
    .sort()
    .join("|");

  const loadProfileMetadata = React.useCallback(
    (npub: string) => {
      const relayKey = nostrFetchRelays
        .map((relay) => relay.trim())
        .filter(Boolean)
        .sort()
        .join(",");
      const key = `${npub}|${relayKey}`;
      const existing = metadataPromisesRef.current.get(key);
      if (existing) return existing;

      const promise = fetchNostrProfileMetadata(npub, {
        relays: nostrFetchRelays,
      }).finally(() => {
        metadataPromisesRef.current.delete(key);
      });
      metadataPromisesRef.current.set(key, promise);
      return promise;
    },
    [nostrFetchRelays],
  );

  const updateContactFromNostr = React.useCallback(
    (
      contact: TContact,
      payload: {
        id: string;
      } & Partial<
        Record<
          "lnAddress" | "name" | "npub",
          typeof Evolu.NonEmptyString1000.Type | null
        >
      >,
    ) => {
      const ownerId =
        resolveContactRowOwnerLane(contact, visibleOwnerIds) ?? appOwnerId;
      return ownerId
        ? update("contact", payload, { ownerId })
        : update("contact", payload);
    },
    [appOwnerId, update, visibleOwnerIds],
  );

  React.useEffect(() => {
    // Fill missing name / lightning address from Nostr, but do not run while
    // user is editing/creating a contact to avoid overwriting form state.
    if (routeKind === "contactEdit" || routeKind === "contactNew") return;

    let cancelled = false;

    const run = async () => {
      if (canFetchFromNostr) {
        const npubs = contactsRef.current
          .map((contact) => normalizeNpubIdentifier(contact.npub))
          .filter((npub): npub is string => Boolean(npub));
        await primeProfileMetadataCache(npubs, { relays: nostrFetchRelays });
        if (cancelled) return;
      }

      for (const contact of contactsRef.current) {
        const rawNpub = String(contact.npub ?? "").trim();
        const npub = normalizeNpubIdentifier(rawNpub);
        if (!npub) continue;

        const currentName = String(contact.name ?? "").trim();
        const currentLn = String(contact.lnAddress ?? "").trim();
        const currentLnNormalized = currentLn.toLowerCase();
        const shouldNormalizeNpub = rawNpub !== npub;

        const needsName = !currentName;
        if (!needsName && !shouldNormalizeNpub && currentLnNormalized) {
          const cached = loadCachedProfileMetadata(npub);
          const cachedLn = cached?.metadata
            ? omitSyntheticContactLightningAddress(
                String(cached.metadata.lud16 ?? "").trim() ||
                  String(cached.metadata.lud06 ?? "").trim(),
                npub,
              )
            : "";
          if (cachedLn && cachedLn.toLowerCase() !== currentLnNormalized) {
            updateContactFromNostr(contact, {
              id: contact.id,
              lnAddress: cachedLn as typeof Evolu.NonEmptyString1000.Type,
              ...(shouldNormalizeNpub
                ? { npub: npub as typeof Evolu.NonEmptyString1000.Type }
                : {}),
            });
            continue;
          }
        }

        // Try cached metadata first.
        const cached = loadCachedProfileMetadata(npub);
        if (cached?.metadata) {
          const bestName = getBestNostrName(cached.metadata);
          const ln = omitSyntheticContactLightningAddress(
            String(cached.metadata.lud16 ?? "").trim() ||
              String(cached.metadata.lud06 ?? "").trim(),
            npub,
          );
          const shouldSyncLn =
            Boolean(ln) && ln.toLowerCase() !== currentLnNormalized;
          const patch: Partial<{
            name: typeof Evolu.NonEmptyString1000.Type;
            lnAddress: typeof Evolu.NonEmptyString1000.Type;
            npub: typeof Evolu.NonEmptyString1000.Type;
          }> = {};

          if (needsName && bestName) {
            patch.name = bestName as typeof Evolu.NonEmptyString1000.Type;
          }
          if (shouldSyncLn) {
            patch.lnAddress = ln as typeof Evolu.NonEmptyString1000.Type;
          }
          if (shouldNormalizeNpub) {
            patch.npub = npub as typeof Evolu.NonEmptyString1000.Type;
          }

          if (Object.keys(patch).length > 0) {
            metadataCompletedRef.current.add(npub);
            updateContactFromNostr(contact, { id: contact.id, ...patch });
          }
          metadataCompletedRef.current.add(npub);
          continue;
        }

        if (metadataCompletedRef.current.has(npub)) continue;
        if (!canFetchFromNostr) continue;

        if (nostrMetadataInFlight.current.has(npub)) continue;
        nostrMetadataInFlight.current.add(npub);

        try {
          const metadata = await loadProfileMetadata(npub);

          recordProfileMetadataLookup(npub, metadata);
          if (cancelled) return;
          if (!metadata) {
            metadataCompletedRef.current.add(npub);
            continue;
          }

          const bestName = getBestNostrName(metadata);
          const ln = omitSyntheticContactLightningAddress(
            String(metadata.lud16 ?? "").trim() ||
              String(metadata.lud06 ?? "").trim(),
            npub,
          );
          const shouldSyncLn =
            Boolean(ln) && ln.toLowerCase() !== currentLnNormalized;

          const patch: Partial<{
            name: typeof Evolu.NonEmptyString1000.Type;
            lnAddress: typeof Evolu.NonEmptyString1000.Type;
            npub: typeof Evolu.NonEmptyString1000.Type;
          }> = {};

          if (needsName && bestName) {
            patch.name = bestName as typeof Evolu.NonEmptyString1000.Type;
          }
          if (shouldSyncLn) {
            patch.lnAddress = ln as typeof Evolu.NonEmptyString1000.Type;
          }
          if (shouldNormalizeNpub) {
            patch.npub = npub as typeof Evolu.NonEmptyString1000.Type;
          }

          if (Object.keys(patch).length > 0) {
            metadataCompletedRef.current.add(npub);
            updateContactFromNostr(contact, { id: contact.id, ...patch });
          }
          metadataCompletedRef.current.add(npub);
        } catch {
          recordProfileMetadataLookup(npub, null);
          if (cancelled) return;
        } finally {
          nostrMetadataInFlight.current.delete(npub);
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [
    canFetchFromNostr,
    metadataContactsKey,
    routeKind,
    updateContactFromNostr,
    nostrFetchRelays,
    nostrMetadataInFlight,
    loadProfileMetadata,
  ]);

  React.useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    const uniqueNpubs: string[] = [];
    const seen = new Set<string>();
    for (const contact of contactsRef.current) {
      const npub = normalizeNpubIdentifier(contact.npub);
      if (!npub) continue;
      if (seen.has(npub)) continue;
      seen.add(npub);
      uniqueNpubs.push(npub);
    }

    const run = async () => {
      if (canFetchFromNostr) {
        await primeProfileMetadataCache(uniqueNpubs, {
          relays: nostrFetchRelays,
          signal: controller.signal,
        });
        if (cancelled) return;
      }

      for (const npub of uniqueNpubs) {
        const cached = loadCachedProfilePicture(npub);
        const shouldRefreshCachedPicture = isCachedProfilePictureStale(cached);

        if (cached) {
          setNostrPictureByNpub((prev) =>
            prev[npub] === cached.url ? prev : { ...prev, [npub]: cached.url },
          );
          if (cached.url === null || !isHttpUrl(cached.url)) {
            if (!shouldRefreshCachedPicture) continue;
          }
        }

        try {
          const blobUrl = await loadCachedProfileAvatarObjectUrl(npub);
          if (cancelled) return;
          if (blobUrl) {
            const remembered = rememberBlobAvatarUrl(npub, blobUrl);
            setNostrPictureByNpub((prev) =>
              prev[npub] === remembered
                ? prev
                : { ...prev, [npub]: remembered },
            );
            if (!shouldRefreshCachedPicture) continue;
          }
        } catch {
          // ignore
        }

        if (cached && !shouldRefreshCachedPicture) continue;

        if (!canFetchFromNostr) continue;

        if (nostrInFlight.current.has(npub)) continue;
        nostrInFlight.current.add(npub);

        try {
          if (cached && shouldRefreshCachedPicture) {
            const metadata = await loadProfileMetadata(npub);
            if (cancelled) return;
            if (!metadata) continue;

            saveCachedProfileMetadata(npub, metadata);
            const refreshedUrl = getNostrProfilePictureUrl(metadata);
            if (refreshedUrl) {
              saveCachedProfilePicture(npub, refreshedUrl);
              const blobUrl = await cacheProfileAvatarFromUrl(
                npub,
                refreshedUrl,
                {
                  signal: controller.signal,
                },
              );
              if (cancelled) return;
              setNostrPictureByNpub((prev) => ({
                ...prev,
                [npub]: rememberBlobAvatarUrl(npub, blobUrl || refreshedUrl),
              }));
            } else {
              saveCachedProfilePicture(npub, null);
              void deleteCachedProfileAvatar(npub);
              rememberBlobAvatarUrl(npub, null);
              setNostrPictureByNpub((prev) => ({
                ...prev,
                [npub]: null,
              }));
            }
          } else {
            const metadata = await loadProfileMetadata(npub);
            recordProfileMetadataLookup(npub, metadata);
            const url = metadata ? getNostrProfilePictureUrl(metadata) : null;
            recordProfilePictureLookup(npub, url);
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
                if (typeof existing === "string" && existing.trim())
                  return prev;
                if (existing === null) return prev;
                return { ...prev, [npub]: null };
              });
            }
          }
        } catch {
          if (cancelled) return;
          if (!cached) {
            recordProfilePictureLookup(npub, null);
            setNostrPictureByNpub((prev) => {
              const existing = prev[npub];
              if (typeof existing === "string" && existing.trim()) return prev;
              if (existing === null) return prev;
              return { ...prev, [npub]: null };
            });
          }
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
    canFetchFromNostr,
    uniqueNpubsKey,
    nostrInFlight,
    loadProfileMetadata,
    rememberBlobAvatarUrl,
    nostrFetchRelays,
    setNostrPictureByNpub,
  ]);

  React.useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    const uniqueNpubs: string[] = [];
    const seen = new Set<string>();
    for (const contact of contactsRef.current) {
      const npub = normalizeNpubIdentifier(contact.npub);
      if (!npub) continue;
      if (seen.has(npub)) continue;
      seen.add(npub);
      uniqueNpubs.push(npub);
    }

    const run = async () => {
      for (const npub of uniqueNpubs) {
        if (statusCompletedRef.current.has(npub)) continue;
        if (statusByNpubRef.current[npub] !== undefined) {
          statusCompletedRef.current.add(npub);
          continue;
        }

        const cached = loadCachedNostrGeneralStatus(npub);
        if (cached) {
          setNostrStatusByNpub((prev) =>
            prev[npub] !== undefined
              ? prev
              : { ...prev, [npub]: cached.status },
          );
          statusCompletedRef.current.add(npub);
          continue;
        }

        if (!canFetchFromNostr) continue;

        if (nostrStatusInFlight.current.has(npub)) continue;
        nostrStatusInFlight.current.add(npub);

        try {
          const status = await fetchNostrGeneralStatus(npub, {
            signal: controller.signal,
            relays: nostrFetchRelays,
          });
          saveCachedNostrGeneralStatus(npub, status);
          if (cancelled) return;
          setNostrStatusByNpub((prev) => ({ ...prev, [npub]: status }));
          statusCompletedRef.current.add(npub);
        } catch {
          if (cancelled) return;
        } finally {
          nostrStatusInFlight.current.delete(npub);
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [
    canFetchFromNostr,
    uniqueNpubsKey,
    nostrFetchRelays,
    nostrStatusInFlight,
    setNostrStatusByNpub,
  ]);
};
