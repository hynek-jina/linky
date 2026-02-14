import type { FC } from "react";
import type { CashuTokenRowLike } from "../app/types/appTypes";
import { parseCashuToken } from "../cashu";
import type { CashuTokenId } from "../evolu";

type CashuTokenPageRow = CashuTokenRowLike & { id: CashuTokenId };

interface CashuTokenPageProps {
  cashuIsBusy: boolean;
  cashuTokensAll: readonly CashuTokenPageRow[];
  checkAndRefreshCashuToken: (
    id: CashuTokenId,
  ) => Promise<"ok" | "invalid" | "transient" | "skipped">;
  copyText: (text: string) => Promise<void>;
  pendingCashuDeleteId: CashuTokenId | null;
  requestDeleteCashuToken: (id: CashuTokenId) => void;
  routeId: CashuTokenId;
  t: (key: string) => string;
}

export const CashuTokenPage: FC<CashuTokenPageProps> = ({
  cashuIsBusy,
  cashuTokensAll,
  checkAndRefreshCashuToken,
  copyText,
  pendingCashuDeleteId,
  requestDeleteCashuToken,
  routeId,
  t,
}) => {
  const row = cashuTokensAll.find(
    (tkn) => tkn.id === routeId && !tkn.isDeleted,
  );

  if (!row) {
    return (
      <section className="panel">
        <p className="muted">{t("errorPrefix")}</p>
      </section>
    );
  }

  const tokenText = String(row.token ?? row.rawToken ?? "").trim();
  const parsed = tokenText ? parseCashuToken(tokenText) : null;
  const mintText =
    String(row.mint ?? "").trim() ||
    (parsed?.mint ? String(parsed.mint).trim() : "");
  const mintDisplay = (() => {
    if (!mintText) return null;
    try {
      return new URL(mintText).host;
    } catch {
      return mintText;
    }
  })();

  return (
    <section className="panel">
      {mintDisplay && (
        <p className="muted" style={{ margin: "0 0 10px" }}>
          {mintDisplay}
        </p>
      )}

      {String(row.state ?? "") === "error" && (
        <p className="muted" style={{ margin: "0 0 10px", color: "#fca5a5" }}>
          {String(row.error ?? "").trim() || t("cashuInvalid")}
        </p>
      )}

      <div className="settings-row">
        <button
          className="btn-wide"
          onClick={() => void checkAndRefreshCashuToken(routeId)}
          disabled={cashuIsBusy}
        >
          {t("cashuCheckToken")}
        </button>
      </div>
      <label>{t("cashuToken")}</label>
      <textarea readOnly value={tokenText} />

      <div className="settings-row">
        <button
          className="btn-wide secondary"
          onClick={() => void copyText(tokenText)}
          disabled={!tokenText.trim()}
        >
          {t("copy")}
        </button>
      </div>

      <div className="settings-row">
        <button
          className={
            pendingCashuDeleteId === routeId
              ? "btn-wide secondary danger-armed"
              : "btn-wide secondary"
          }
          onClick={() => requestDeleteCashuToken(routeId)}
        >
          {t("delete")}
        </button>
      </div>
    </section>
  );
};
