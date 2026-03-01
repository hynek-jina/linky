import type { FC } from "react";
import type { CashuTokenRowLike, MintUrlInput } from "../app/types/appTypes";
import { CashuTokenPill } from "../components/CashuTokenPill";
import type { CashuTokenId } from "../evolu";
import { useNavigation } from "../hooks/useRouting";
import { formatInteger } from "../utils/formatting";

type CashuTokenListItem = CashuTokenRowLike & { id: CashuTokenId };

interface CashuTokenNewPageProps {
  cashuBalance: number;
  cashuBulkCheckIsBusy: boolean;
  cashuDraft: string;
  cashuDraftRef: React.RefObject<HTMLTextAreaElement | null>;
  cashuIsBusy: boolean;
  cashuTokens: readonly CashuTokenListItem[];
  checkAllCashuTokensAndDeleteInvalid: () => Promise<void>;
  displayUnit: string;
  getMintIconUrl: (mint: MintUrlInput) => {
    origin: string | null;
    url: string | null;
    host: string | null;
    failed: boolean;
  };
  saveCashuFromText: (
    text: string,
    opts: { navigateToWallet: boolean },
  ) => Promise<void>;
  setCashuDraft: (value: string) => void;
  setMintIconUrlByMint: React.Dispatch<
    React.SetStateAction<Record<string, string | null>>
  >;
  t: (key: string) => string;
}

export const CashuTokenNewPage: FC<CashuTokenNewPageProps> = ({
  cashuBalance,
  cashuBulkCheckIsBusy,
  cashuDraft,
  cashuDraftRef,
  cashuIsBusy,
  cashuTokens,
  checkAllCashuTokensAndDeleteInvalid,
  displayUnit,
  getMintIconUrl,
  saveCashuFromText,
  setCashuDraft,
  setMintIconUrlByMint,
  t,
}) => {
  const navigateTo = useNavigation();
  return (
    <section className="panel">
      <div className="ln-list wallet-token-list">
        <div className="list-header">
          <span>
            Cashu · {formatInteger(cashuBalance)} {displayUnit}
          </span>
          <button
            type="button"
            className="btn-small secondary"
            onClick={() => void checkAllCashuTokensAndDeleteInvalid()}
            disabled={
              cashuIsBusy || cashuBulkCheckIsBusy || cashuTokens.length === 0
            }
          >
            {t("cashuCheckAllTokens")}
          </button>
        </div>
        {cashuTokens.length === 0 ? (
          <p className="muted">{t("cashuEmpty")}</p>
        ) : (
          <div className="ln-tags">
            {cashuTokens.map((token) => (
              <CashuTokenPill
                key={token.id}
                token={token}
                getMintIconUrl={getMintIconUrl}
                formatInteger={formatInteger}
                isError={String(token.state ?? "") === "error"}
                onMintIconLoad={(origin, url) => {
                  setMintIconUrlByMint((prev) => ({
                    ...prev,
                    [origin]: url,
                  }));
                }}
                onMintIconError={(origin, nextUrl) => {
                  setMintIconUrlByMint((prev) => ({
                    ...prev,
                    [origin]: nextUrl,
                  }));
                }}
                onClick={() =>
                  navigateTo({
                    route: "cashuToken",
                    id: token.id,
                  })
                }
                ariaLabel={t("cashuToken")}
              />
            ))}
          </div>
        )}
      </div>

      <label>{t("cashuToken")}</label>
      <textarea
        ref={cashuDraftRef}
        value={cashuDraft}
        onChange={(e) => setCashuDraft(e.target.value)}
        onPaste={(e) => {
          const text = e.clipboardData?.getData("text") ?? "";
          const tokenRaw = String(text).trim();
          if (!tokenRaw) return;
          e.preventDefault();
          void saveCashuFromText(tokenRaw, { navigateToWallet: true });
        }}
        placeholder={t("cashuPasteManualHint")}
      />

      <div className="settings-row">
        <button
          className="btn-wide"
          onClick={() =>
            void saveCashuFromText(cashuDraft, { navigateToWallet: true })
          }
          disabled={!cashuDraft.trim() || cashuIsBusy}
        >
          {t("cashuSave")}
        </button>
      </div>
    </section>
  );
};
