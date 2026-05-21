import type { Dispatch, FC, SetStateAction } from "react";
import { useEffect, useRef } from "react";
import { useAppShellCore } from "../app/context/AppShellContexts";
import type { CashuTokenRowLike, MintUrlInput } from "../app/types/appTypes";
import { CashuTokenPill } from "../components/CashuTokenPill";
import { TokenAddFabIcon } from "../components/TokenAddFabIcon";
import type { CashuTokenId } from "../evolu";
import { useNavigation } from "../hooks/useRouting";

type CashuTokenListItem = CashuTokenRowLike & { id: CashuTokenId };

interface CashuTokensPageProps {
  canRestoreTokens: boolean;
  cashuBalance: number;
  cashuTotalBalance: number;
  cashuBulkCheckIsBusy: boolean;
  cashuIsBusy: boolean;
  cashuMeltToMainMintButtonLabel: string | null;
  cashuOwnTokens: readonly CashuTokenListItem[];
  cashuIssuedTokens: readonly CashuTokenListItem[];
  checkAllCashuTokensAndDeleteInvalid: () => Promise<void>;
  checkIssuedCashuTokensAndDeleteClaimed: () => Promise<{
    checked: number;
    claimed: number;
  }>;
  getMintIconUrl: (mint: MintUrlInput) => {
    origin: string | null;
    url: string | null;
    host: string | null;
    failed: boolean;
  };
  meltLargestForeignMintToMainMint: () => Promise<void>;
  restoreMissingTokens: () => Promise<void>;
  setMintIconUrlByMint: Dispatch<SetStateAction<Record<string, string | null>>>;
  t: (key: string) => string;
  tokensRestoreIsBusy: boolean;
}

export const CashuTokensPage: FC<CashuTokensPageProps> = ({
  canRestoreTokens,
  cashuTotalBalance,
  cashuBulkCheckIsBusy,
  cashuIsBusy,
  cashuIssuedTokens,
  cashuMeltToMainMintButtonLabel,
  cashuOwnTokens,
  checkAllCashuTokensAndDeleteInvalid,
  checkIssuedCashuTokensAndDeleteClaimed,
  getMintIconUrl,
  meltLargestForeignMintToMainMint,
  restoreMissingTokens,
  setMintIconUrlByMint,
  t,
  tokensRestoreIsBusy,
}) => {
  const { formatDisplayedAmountText } = useAppShellCore();
  const navigateTo = useNavigation();
  const issuedBalance = cashuIssuedTokens.reduce((sum, token) => {
    const amount = Number(token.amount ?? 0);
    return sum + (Number.isFinite(amount) ? amount : 0);
  }, 0);

  const hasIssuedTokens = cashuIssuedTokens.length > 0;
  const autoCheckedRef = useRef(false);
  useEffect(() => {
    if (!hasIssuedTokens) return;
    if (autoCheckedRef.current) return;
    autoCheckedRef.current = true;
    void checkIssuedCashuTokensAndDeleteClaimed();
  }, [checkIssuedCashuTokensAndDeleteClaimed, hasIssuedTokens]);

  const renderTokenList = (
    tokens: readonly CashuTokenListItem[],
    emptyLabel: string,
  ) => {
    if (tokens.length === 0) {
      return <p className="muted">{emptyLabel}</p>;
    }

    return (
      <div className="ln-tags">
        {tokens.map((token) => (
          <CashuTokenPill
            key={token.id}
            token={token}
            getMintIconUrl={getMintIconUrl}
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
    );
  };

  return (
    <>
      <section className="panel">
        <div className="ln-list wallet-token-list">
          <div className="list-header">
            <span>
              {t("cashuMine")} · {formatDisplayedAmountText(cashuTotalBalance)}
            </span>
            <button
              type="button"
              className="btn-small secondary"
              onClick={() => void checkAllCashuTokensAndDeleteInvalid()}
              disabled={
                cashuIsBusy ||
                cashuBulkCheckIsBusy ||
                cashuOwnTokens.length === 0
              }
            >
              {t("cashuCheckAllTokens")}
            </button>
          </div>
          {renderTokenList(cashuOwnTokens, t("cashuEmpty"))}
          {cashuMeltToMainMintButtonLabel ? (
            <div className="settings-row" style={{ marginTop: 12 }}>
              <button
                type="button"
                className="btn-wide secondary"
                onClick={() => void meltLargestForeignMintToMainMint()}
                disabled={cashuIsBusy || cashuBulkCheckIsBusy}
              >
                {cashuMeltToMainMintButtonLabel}
              </button>
            </div>
          ) : null}
          <div className="settings-row" style={{ marginTop: 12 }}>
            <button
              type="button"
              className="btn-wide secondary"
              onClick={() => void restoreMissingTokens()}
              disabled={!canRestoreTokens || tokensRestoreIsBusy || cashuIsBusy}
            >
              {tokensRestoreIsBusy ? t("restoring") : t("restoreTokens")}
            </button>
          </div>
        </div>

        <div className="ln-list wallet-token-list">
          <div className="list-header">
            <span>
              {t("cashuIssued")} · {formatDisplayedAmountText(issuedBalance)}
            </span>
            <button
              type="button"
              className="btn-small secondary"
              onClick={() => void checkIssuedCashuTokensAndDeleteClaimed()}
              disabled={cashuIsBusy || cashuBulkCheckIsBusy || !hasIssuedTokens}
            >
              {t("cashuCheckIssuedTokens")}
            </button>
          </div>
          {renderTokenList(cashuIssuedTokens, t("cashuIssuedEmpty"))}
          <div className="settings-row" style={{ marginTop: 12 }}>
            <button
              type="button"
              className="btn-wide"
              onClick={() => navigateTo({ route: "cashuTokenEmit" })}
              disabled={cashuIsBusy}
            >
              {t("cashuEmit")}
            </button>
          </div>
        </div>
      </section>

      <button
        type="button"
        className="contacts-fab"
        onClick={() => navigateTo({ route: "cashuTokenNew" })}
        aria-label={t("cashuAddToken")}
        title={t("cashuAddToken")}
      >
        <TokenAddFabIcon />
      </button>
    </>
  );
};
