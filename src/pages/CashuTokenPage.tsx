import type { FC } from "react";
import type { CashuTokenId } from "../evolu";

interface CashuTokenPageProps {
  cashuTokensAll: readonly any[];
  routeId: CashuTokenId;
  cashuIsBusy: boolean;
  pendingCashuDeleteId: CashuTokenId | null;
  checkAndRefreshCashuToken: (id: CashuTokenId) => Promise<void>;
  copyText: (text: string) => Promise<void>;
  requestDeleteCashuToken: (id: CashuTokenId) => void;
  t: (key: string) => string;
}

const CashuTokenPage: FC<CashuTokenPageProps> = ({
  cashuTokensAll,
  routeId,
  cashuIsBusy,
  pendingCashuDeleteId,
  checkAndRefreshCashuToken,
  copyText,
  requestDeleteCashuToken,
  t,
}) => {
  const row = cashuTokensAll.find(
    (tkn) =>
      String(tkn?.id ?? "") === String(routeId as unknown as string) &&
      !tkn?.isDeleted,
  );

  if (!row) {
    return (
      <section className="panel">
        <p className="muted">{t("errorPrefix")}</p>
      </section>
    );
  }

  const tokenText = String(row.token ?? row.rawToken ?? "");
  const mintText = String(row.mint ?? "").trim();
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

export default CashuTokenPage;
