import type { OwnerId } from "@evolu/common";
import React from "react";
import type { LocalMintInfoRow } from "../types/appTypes";
import {
  getMintDuckDuckGoIcon,
  getMintIconOverride,
  getMintOriginAndHost,
  normalizeMintUrl,
} from "../../utils/mint";
import { useMintInfoStore } from "./mint/useMintInfoStore";

interface UseMintDomainParams {
  appOwnerId: OwnerId | null;
  appOwnerIdRef: React.MutableRefObject<OwnerId | null>;
  cashuTokensAll: readonly Record<string, unknown>[];
  defaultMintUrl: string | null;
  rememberSeenMint: (mintUrl: unknown) => void;
}

interface UseMintDomainResult {
  getMintIconUrl: (mint: unknown) => {
    failed: boolean;
    host: string | null;
    origin: string | null;
    url: string | null;
  };
  getMintRuntime: (
    mintUrl: string,
  ) => { lastCheckedAtSec: number; latencyMs: number | null } | null;
  isMintDeleted: (mintUrl: string) => boolean;
  mintIconUrlByMint: Record<string, string | null>;
  mintInfoByUrl: Map<string, LocalMintInfoRow>;
  mintInfoDeduped: Array<{ canonicalUrl: string; row: LocalMintInfoRow }>;
  refreshMintInfo: (mintUrl: string) => Promise<void>;
  setMintIconUrlByMint: React.Dispatch<
    React.SetStateAction<Record<string, string | null>>
  >;
  setMintInfoAll: React.Dispatch<React.SetStateAction<LocalMintInfoRow[]>>;
  touchMintInfo: (_mintUrl: string, nowSec: number) => void;
}

export const useMintDomain = ({
  appOwnerId,
  appOwnerIdRef,
  cashuTokensAll,
  defaultMintUrl,
  rememberSeenMint,
}: UseMintDomainParams): UseMintDomainResult => {
  const [mintIconUrlByMint, setMintIconUrlByMint] = React.useState<
    Record<string, string | null>
  >(() => ({}));

  const {
    getMintRuntime,
    isMintDeleted,
    mintInfoByUrl,
    mintInfoDeduped,
    refreshMintInfo,
    setMintInfoAll,
    touchMintInfo,
  } = useMintInfoStore({
    appOwnerId,
    appOwnerIdRef,
    cashuTokensAll,
    defaultMintUrl,
    rememberSeenMint,
  });

  const getMintInfoIconUrl = React.useCallback(
    (mint: unknown): string | null => {
      const raw = String(mint ?? "").trim();
      const normalized = normalizeMintUrl(raw);
      if (!normalized) return null;
      const row = mintInfoByUrl.get(normalized) as
        | (Record<string, unknown> & { infoJson?: unknown })
        | undefined;
      const infoText = String(row?.infoJson ?? "").trim();
      if (!infoText) return null;
      let baseUrl: string | null = null;
      try {
        baseUrl = new URL(normalized).toString();
      } catch {
        const { origin } = getMintOriginAndHost(normalized);
        baseUrl = origin ?? null;
      }
      if (!baseUrl) return null;

      const findIcon = (value: unknown): string | null => {
        if (!value || typeof value !== "object") return null;
        const rec = value as Record<string, unknown>;
        const keys = [
          "icon_url",
          "iconUrl",
          "icon",
          "logo",
          "image",
          "image_url",
          "imageUrl",
        ];
        for (const key of keys) {
          const rawValue = String(rec[key] ?? "").trim();
          if (rawValue) return rawValue;
        }
        for (const inner of Object.values(rec)) {
          if (inner && typeof inner === "object") {
            const found = findIcon(inner);
            if (found) return found;
          }
        }
        return null;
      };

      try {
        const info = JSON.parse(infoText) as unknown;
        const rawIcon = findIcon(info);
        if (!rawIcon) return null;
        try {
          return new URL(rawIcon, baseUrl).toString();
        } catch {
          return null;
        }
      } catch {
        return null;
      }
    },
    [mintInfoByUrl],
  );

  const getMintIconUrl = React.useCallback(
    (
      mint: unknown,
    ): {
      origin: string | null;
      url: string | null;
      host: string | null;
      failed: boolean;
    } => {
      const { origin, host } = getMintOriginAndHost(mint);
      if (!origin) return { origin: null, url: null, host, failed: true };

      if (Object.prototype.hasOwnProperty.call(mintIconUrlByMint, origin)) {
        const stored = mintIconUrlByMint[origin];
        return {
          origin,
          url: stored ?? null,
          host,
          failed: stored === null,
        };
      }

      const infoIcon = getMintInfoIconUrl(mint);
      if (infoIcon) return { origin, url: infoIcon, host, failed: false };

      const override = getMintIconOverride(host);
      if (override) return { origin, url: override, host, failed: false };

      const duckIcon = getMintDuckDuckGoIcon(host);
      if (duckIcon) return { origin, url: duckIcon, host, failed: false };

      return {
        origin,
        url: `${origin}/favicon.ico`,
        host,
        failed: false,
      };
    },
    [getMintInfoIconUrl, mintIconUrlByMint],
  );

  return {
    getMintIconUrl,
    getMintRuntime,
    isMintDeleted,
    mintIconUrlByMint,
    mintInfoByUrl,
    mintInfoDeduped,
    refreshMintInfo,
    setMintIconUrlByMint,
    setMintInfoAll,
    touchMintInfo,
  };
};
