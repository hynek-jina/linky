import * as Evolu from "@evolu/common";
import React from "react";
import {
  MAIN_MINT_URL,
  normalizeMintUrl,
  PRESET_MINTS,
} from "../../../utils/mint";
import {
  LAST_ACCEPTED_CASHU_TOKEN_STORAGE_KEY,
  LOCAL_MINT_INFO_STORAGE_KEY_PREFIX,
} from "../../../utils/constants";
import {
  safeLocalStorageGetJson,
  safeLocalStorageSet,
  safeLocalStorageSetJson,
} from "../../../utils/storage";
import { makeLocalId } from "../../../utils/validation";
import type {
  CashuTokenRowLike,
  LocalMintInfoRow,
  MintUrlInput,
} from "../../types/appTypes";
import {
  buildMintDedupeSignature,
  dedupeMintInfoRows,
  getActiveMintInfoRows,
  getEncounteredMintUrls,
  getMintInfoByUrlMap,
  getMintInfoDedupedRows,
  isMintDeletedRow,
  parseMintInfoPayload,
} from "./mintInfoHelpers";

interface UseMintInfoStoreParams {
  appOwnerId: Evolu.OwnerId | null;
  appOwnerIdRef: React.MutableRefObject<Evolu.OwnerId | null>;
  cashuTokensAll: readonly CashuTokenRowLike[];
  defaultMintUrl: string | null;
  rememberSeenMint: (mintUrl: MintUrlInput) => void;
}

interface UseMintInfoStoreResult {
  getMintRuntime: (
    mintUrl: string,
  ) => { lastCheckedAtSec: number; latencyMs: number | null } | null;
  isMintDeleted: (mintUrl: string) => boolean;
  mintInfoAll: LocalMintInfoRow[];
  mintInfoByUrl: Map<string, LocalMintInfoRow>;
  mintInfoDeduped: Array<{ canonicalUrl: string; row: LocalMintInfoRow }>;
  refreshMintInfo: (mintUrl: string) => Promise<void>;
  setMintInfoAll: React.Dispatch<React.SetStateAction<LocalMintInfoRow[]>>;
  touchMintInfo: (_mintUrl: string, nowSec: number) => void;
}

export const useMintInfoStore = ({
  appOwnerId,
  appOwnerIdRef,
  cashuTokensAll,
  defaultMintUrl,
  rememberSeenMint,
}: UseMintInfoStoreParams): UseMintInfoStoreResult => {
  const [mintInfoAll, setMintInfoAll] = React.useState<LocalMintInfoRow[]>(
    () => [],
  );

  React.useEffect(() => {
    const ownerId = appOwnerIdRef.current;
    if (!ownerId) {
      setMintInfoAll([]);
      return;
    }

    setMintInfoAll(
      safeLocalStorageGetJson(
        `${LOCAL_MINT_INFO_STORAGE_KEY_PREFIX}.${String(ownerId)}`,
        [] as LocalMintInfoRow[],
      ),
    );
  }, [appOwnerId, appOwnerIdRef]);

  const mintInfo = React.useMemo(
    () => getActiveMintInfoRows(mintInfoAll),
    [mintInfoAll],
  );

  const mintInfoDeduped = React.useMemo(
    () => getMintInfoDedupedRows(mintInfo, defaultMintUrl),
    [defaultMintUrl, mintInfo],
  );

  const mintInfoByUrl = React.useMemo(
    () => getMintInfoByUrlMap(mintInfoAll),
    [mintInfoAll],
  );

  const isMintDeleted = React.useCallback(
    (mintUrl: string): boolean => {
      const cleaned = normalizeMintUrl(mintUrl);
      if (!cleaned) return false;

      return mintInfoAll.some((row) => {
        const rowUrl = normalizeMintUrl(String(row.url ?? ""));
        return rowUrl === cleaned && isMintDeletedRow(row);
      });
    },
    [mintInfoAll],
  );

  const touchMintInfo = React.useCallback(
    (_mintUrl: string, nowSec: number): void => {
      const cleaned = normalizeMintUrl(_mintUrl);
      if (!cleaned || isMintDeleted(cleaned)) return;

      rememberSeenMint(cleaned);

      const existing = mintInfoByUrl.get(cleaned);

      const now = Math.floor(nowSec) as typeof Evolu.PositiveInt.Type;
      const ownerId = appOwnerIdRef.current;
      if (!ownerId) return;

      setMintInfoAll((prev) => {
        const next = [...prev];

        const firstSeen =
          existing && Number(existing.firstSeenAtSec ?? 0) > 0
            ? Math.floor(Number(existing?.firstSeenAtSec))
            : now;

        if (
          existing &&
          String(existing?.isDeleted ?? "") !== String(Evolu.sqliteTrue)
        ) {
          const id = String(existing?.id ?? "");
          const idx = next.findIndex((row) => String(row.id ?? "") === id);
          if (idx >= 0) {
            const prevRow = next[idx];
            const prevUrl = String(prevRow.url ?? "");
            const prevFirst = Number(prevRow.firstSeenAtSec ?? 0) || 0;
            const prevLast = Number(prevRow.lastSeenAtSec ?? 0) || 0;

            if (
              prevUrl === cleaned &&
              prevFirst === firstSeen &&
              prevLast === now
            ) {
              return prev;
            }

            next[idx] = {
              ...next[idx],
              url: cleaned,
              firstSeenAtSec: firstSeen,
              lastSeenAtSec: now,
            };
          }
        } else {
          next.push({
            id: makeLocalId(),
            url: cleaned,
            firstSeenAtSec: now,
            lastSeenAtSec: now,
            supportsMpp: null,
            feesJson: null,
            infoJson: null,
          });
        }

        safeLocalStorageSetJson(
          `${LOCAL_MINT_INFO_STORAGE_KEY_PREFIX}.${String(ownerId)}`,
          next,
        );

        return next;
      });
    },
    [appOwnerIdRef, isMintDeleted, mintInfoByUrl, rememberSeenMint],
  );

  const encounteredMintUrls = React.useMemo(
    () => getEncounteredMintUrls(cashuTokensAll),
    [cashuTokensAll],
  );

  const [mintRuntimeByUrl, setMintRuntimeByUrl] = React.useState<
    Record<string, { lastCheckedAtSec: number; latencyMs: number | null }>
  >(() => ({}));

  const mintInfoCheckOnceRef = React.useRef<Set<string>>(new Set());

  React.useEffect(() => {
    mintInfoCheckOnceRef.current = new Set();
  }, [appOwnerId]);

  const getMintRuntime = React.useCallback(
    (mintUrl: string) => {
      const key = normalizeMintUrl(mintUrl);
      if (!key) return null;
      return mintRuntimeByUrl[key] ?? null;
    },
    [mintRuntimeByUrl],
  );

  const recordMintRuntime = React.useCallback(
    (
      mintUrl: string,
      patch: { lastCheckedAtSec: number; latencyMs: number | null },
    ) => {
      const key = normalizeMintUrl(mintUrl);
      if (!key) return;
      setMintRuntimeByUrl((prev) => ({ ...prev, [key]: patch }));
    },
    [],
  );

  const refreshMintInfo = React.useCallback(
    async (mintUrl: string) => {
      const cleaned = normalizeMintUrl(mintUrl);
      if (!cleaned || isMintDeleted(cleaned)) return;
      if (mintInfoCheckOnceRef.current.has(cleaned)) return;

      mintInfoCheckOnceRef.current.add(cleaned);

      const ownerId = appOwnerIdRef.current;
      if (!ownerId) return;

      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 8000);
      const startedAt =
        typeof performance !== "undefined" &&
        typeof performance.now === "function"
          ? performance.now()
          : Date.now();

      const nowSec = Math.floor(Date.now() / 1000);
      recordMintRuntime(cleaned, { lastCheckedAtSec: nowSec, latencyMs: null });

      try {
        const tryUrls = [`${cleaned}/v1/info`, `${cleaned}/info`];
        let info: unknown = null;
        let lastErr: unknown = null;

        for (const url of tryUrls) {
          try {
            const res = await fetch(url, {
              method: "GET",
              headers: { accept: "application/json" },
              signal: controller.signal,
            });

            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            info = await res.json();
            lastErr = null;
            break;
          } catch (err) {
            lastErr = err;
          }
        }

        if (!info) throw lastErr ?? new Error("No info");

        const parsed = parseMintInfoPayload(info);
        const existing = mintInfoByUrl.get(cleaned);

        setMintInfoAll((prev) => {
          const next = [...prev];
          const idx = next
            .map((row) => normalizeMintUrl(String(row.url ?? "")))
            .findIndex((url) => url === cleaned);

          if (idx >= 0) {
            next[idx] = {
              ...next[idx],
              supportsMpp: parsed.supportsMpp,
              feesJson: parsed.feesJson,
              infoJson: parsed.infoJson,
              lastCheckedAtSec: nowSec,
            };
          } else if (
            !existing ||
            String(existing.isDeleted ?? "") === String(Evolu.sqliteTrue)
          ) {
            next.push({
              id: makeLocalId(),
              url: cleaned,
              firstSeenAtSec: nowSec,
              lastSeenAtSec: nowSec,
              supportsMpp: parsed.supportsMpp,
              feesJson: parsed.feesJson,
              infoJson: parsed.infoJson,
              lastCheckedAtSec: nowSec,
            });
          }

          safeLocalStorageSetJson(
            `${LOCAL_MINT_INFO_STORAGE_KEY_PREFIX}.${String(ownerId)}`,
            next,
          );

          return next;
        });

        const finishedAt =
          typeof performance !== "undefined" &&
          typeof performance.now === "function"
            ? performance.now()
            : Date.now();

        recordMintRuntime(cleaned, {
          lastCheckedAtSec: nowSec,
          latencyMs: Math.max(0, Math.round(finishedAt - startedAt)),
        });
      } catch {
        recordMintRuntime(cleaned, {
          lastCheckedAtSec: nowSec,
          latencyMs: null,
        });
      } finally {
        window.clearTimeout(timeout);
      }
    },
    [appOwnerIdRef, isMintDeleted, mintInfoByUrl, recordMintRuntime],
  );

  React.useEffect(() => {
    const cleaned = normalizeMintUrl(defaultMintUrl ?? MAIN_MINT_URL);
    if (!cleaned || isMintDeleted(cleaned)) return;

    const existing = mintInfoByUrl.get(cleaned);
    const nowSec = Math.floor(Date.now() / 1000);
    if (!existing) {
      touchMintInfo(cleaned, nowSec);
      return;
    }

    if (!getMintRuntime(cleaned)) {
      void refreshMintInfo(cleaned);
    }
  }, [
    defaultMintUrl,
    getMintRuntime,
    isMintDeleted,
    mintInfoByUrl,
    refreshMintInfo,
    touchMintInfo,
  ]);

  React.useEffect(() => {
    if (encounteredMintUrls.length === 0) return;

    const nowSec = Math.floor(Date.now() / 1000);
    const candidates = new Set<string>();

    for (const mintUrl of encounteredMintUrls) candidates.add(mintUrl);
    for (const mintUrl of PRESET_MINTS) candidates.add(mintUrl);
    if (defaultMintUrl) candidates.add(defaultMintUrl);
    for (const mintInfoRow of mintInfoDeduped) {
      const url = String(mintInfoRow.canonicalUrl ?? "").trim();
      if (url) candidates.add(url);
    }

    for (const mintUrl of candidates) {
      const cleaned = String(mintUrl ?? "")
        .trim()
        .replace(/\/+$/, "");
      if (!cleaned || isMintDeleted(cleaned)) continue;

      const existing = mintInfoByUrl.get(cleaned);
      if (!existing) {
        touchMintInfo(cleaned, nowSec);
        continue;
      }

      touchMintInfo(cleaned, nowSec);

      const lastChecked = getMintRuntime(cleaned)?.lastCheckedAtSec ?? 0;
      const oneDay = 86_400;
      if (lastChecked === 0 || nowSec - lastChecked > oneDay) {
        void refreshMintInfo(cleaned);
      }
    }
  }, [
    defaultMintUrl,
    encounteredMintUrls,
    getMintRuntime,
    isMintDeleted,
    mintInfoByUrl,
    mintInfoDeduped,
    refreshMintInfo,
    touchMintInfo,
  ]);

  const mintDedupeRanRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    const signature = buildMintDedupeSignature(mintInfoAll);
    if (!signature) return;
    if (mintDedupeRanRef.current === signature) return;

    mintDedupeRanRef.current = signature;

    const ownerId = appOwnerIdRef.current;
    if (!ownerId) return;

    const deduped = dedupeMintInfoRows(mintInfoAll);
    if (!deduped) return;

    setMintInfoAll(deduped);
    safeLocalStorageSetJson(
      `${LOCAL_MINT_INFO_STORAGE_KEY_PREFIX}.${String(ownerId)}`,
      deduped,
    );
  }, [appOwnerIdRef, mintInfoAll]);

  React.useEffect(() => {
    const remembered = safeLocalStorageGetJson(
      LAST_ACCEPTED_CASHU_TOKEN_STORAGE_KEY,
      "",
    );
    if (!String(remembered ?? "").trim()) return;
    safeLocalStorageSet(LAST_ACCEPTED_CASHU_TOKEN_STORAGE_KEY, "");
  }, []);

  return {
    getMintRuntime,
    isMintDeleted,
    mintInfoAll,
    mintInfoByUrl,
    mintInfoDeduped,
    refreshMintInfo,
    setMintInfoAll,
    touchMintInfo,
  };
};
