import type { OwnerId } from "@evolu/common";
import type { LocalMintInfoRow } from "../app/types/appTypes";
import { useNavigation } from "../hooks/useRouting";
import type { extractPpk } from "../utils/mint";
import type { safeLocalStorageSetJson } from "../utils/storage";

interface MintDetailPageProps {
  Evolu: { sqliteTrue: LocalMintInfoRow["isDeleted"] };
  LOCAL_MINT_INFO_STORAGE_KEY_PREFIX: string;
  appOwnerIdRef: React.RefObject<OwnerId | null>;
  extractPpk: (data: Parameters<typeof extractPpk>[0]) => number | null;
  getMintRuntime: (
    url: string,
  ) => { lastCheckedAtSec: number; latencyMs: number | null } | null;
  lang: string;
  mintInfoByUrl: Map<string, LocalMintInfoRow>;
  mintUrl: string;
  normalizeMintUrl: (url: string) => string;
  pendingMintDeleteUrl: string | null;
  refreshMintInfo: (url: string) => Promise<void>;
  safeLocalStorageSetJson: typeof safeLocalStorageSetJson;
  setMintInfoAll: React.Dispatch<React.SetStateAction<LocalMintInfoRow[]>>;
  setPendingMintDeleteUrl: (url: string | null) => void;
  setStatus: (message: string) => void;
  t: (key: string) => string;
}

const isPpkSearchInput = (
  value: unknown,
): value is Parameters<typeof extractPpk>[0] => {
  if (value === null) return true;
  if (Array.isArray(value)) return true;
  const valueType = typeof value;
  return (
    valueType === "string" ||
    valueType === "number" ||
    valueType === "boolean" ||
    valueType === "bigint" ||
    valueType === "symbol" ||
    valueType === "object"
  );
};

export function MintDetailPage({
  Evolu,
  LOCAL_MINT_INFO_STORAGE_KEY_PREFIX,
  appOwnerIdRef,
  extractPpk,
  getMintRuntime,
  lang,
  mintInfoByUrl,
  mintUrl,
  normalizeMintUrl,
  pendingMintDeleteUrl,
  refreshMintInfo,
  safeLocalStorageSetJson,
  setMintInfoAll,
  setPendingMintDeleteUrl,
  setStatus,
  t,
}: MintDetailPageProps) {
  const navigateTo = useNavigation();
  const cleaned = normalizeMintUrl(mintUrl);
  const row = mintInfoByUrl.get(cleaned) ?? null;

  if (!row) {
    return (
      <section className="panel">
        <p className="muted">{t("mintNotFound")}</p>
      </section>
    );
  }

  const supportsMpp = String(row.supportsMpp ?? "") === "1";
  const feesJson = String(row.feesJson ?? "").trim();

  const runtime = getMintRuntime(cleaned);
  const lastCheckedAtSec = runtime?.lastCheckedAtSec ?? 0;
  const latencyMs = runtime?.latencyMs ?? null;

  const ppk = (() => {
    if (!feesJson) return null;
    try {
      const parsed: unknown = JSON.parse(feesJson);
      if (!isPpkSearchInput(parsed)) return null;
      const found = extractPpk(parsed);
      if (typeof found === "number" && Number.isFinite(found)) {
        return found;
      }
      return null;
    } catch {
      return null;
    }
  })();

  return (
    <section className="panel">
      <div>
        <div className="settings-row">
          <div className="settings-left">
            <span className="settings-icon" aria-hidden="true">
              🔗
            </span>
            <span className="settings-label">{t("mintUrl")}</span>
          </div>
          <div className="settings-right">
            <span className="relay-url">{cleaned}</span>
          </div>
        </div>

        <div className="settings-row">
          <div className="settings-left">
            <span className="settings-icon" aria-hidden="true">
              🧩
            </span>
            <span className="settings-label">{t("mintMpp")}</span>
          </div>
          <div className="settings-right">
            <span className={supportsMpp ? "relay-count" : "muted"}>
              {supportsMpp ? "MPP" : t("unknown")}
            </span>
          </div>
        </div>

        <div className="settings-row">
          <div className="settings-left">
            <span className="settings-icon" aria-hidden="true">
              💸
            </span>
            <span className="settings-label">{t("mintFees")}</span>
          </div>
          <div className="settings-right">
            {ppk !== null ? (
              <span className="relay-url">ppk: {ppk}</span>
            ) : feesJson ? (
              <span className="relay-url">{feesJson}</span>
            ) : (
              <span className="muted">{t("unknown")}</span>
            )}
          </div>
        </div>

        <div className="settings-row">
          <div className="settings-left">
            <span className="settings-icon" aria-hidden="true">
              ⏱
            </span>
            <span className="settings-label">Latency</span>
          </div>
          <div className="settings-right">
            {latencyMs !== null ? (
              <span className="relay-url">{latencyMs} ms</span>
            ) : (
              <span className="muted">{t("unknown")}</span>
            )}
          </div>
        </div>

        <div className="settings-row">
          <button
            type="button"
            className="btn-wide secondary"
            onClick={() => {
              void refreshMintInfo(cleaned);
            }}
          >
            {t("mintRefresh")}
          </button>
        </div>

        <div className="settings-row">
          <button
            type="button"
            className={
              pendingMintDeleteUrl === cleaned ? "btn-wide danger" : "btn-wide"
            }
            onClick={() => {
              if (pendingMintDeleteUrl === cleaned) {
                const ownerId = appOwnerIdRef.current;
                if (ownerId) {
                  setMintInfoAll((prev) => {
                    const next = prev.map((mintInfoRow) => {
                      const url = normalizeMintUrl(
                        String(mintInfoRow.url ?? ""),
                      );
                      if (url !== cleaned) return mintInfoRow;
                      return {
                        ...mintInfoRow,
                        isDeleted: Evolu.sqliteTrue,
                      };
                    });
                    safeLocalStorageSetJson(
                      `${LOCAL_MINT_INFO_STORAGE_KEY_PREFIX}.${String(ownerId)}`,
                      next,
                    );
                    return next;
                  });
                }

                setPendingMintDeleteUrl(null);
                navigateTo({ route: "mints" });
                return;
              }
              setStatus(t("deleteArmedHint"));
              setPendingMintDeleteUrl(cleaned);
            }}
          >
            {t("mintDelete")}
          </button>
        </div>

        {lastCheckedAtSec ? (
          <p className="muted" style={{ marginTop: 10 }}>
            {t("mintLastChecked")}:{" "}
            {new Date(lastCheckedAtSec * 1000).toLocaleString(
              lang === "cs" ? "cs-CZ" : "en-US",
            )}
          </p>
        ) : null}
      </div>
    </section>
  );
}
