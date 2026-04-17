import type { Dispatch, FC, SetStateAction } from "react";
import { useNavigation } from "../hooks/useRouting";
import type { CashuTokenRowLike, MintUrlInput } from "../app/types/appTypes";
import { CashuTokenPill } from "../components/CashuTokenPill";
import { TokenAddFabIcon } from "../components/TokenAddFabIcon";
import type { CashuTokenId } from "../evolu";
import { useAppShellCore } from "../app/context/AppShellContexts";

type CashuTokenListItem = CashuTokenRowLike & { id: CashuTokenId };

interface CashuTokensPageProps {
  cashuBalance: number;
  cashuBulkCheckIsBusy: boolean;
  cashuIsBusy: boolean;
  cashuMeltToMainMintButtonLabel: string | null;
  cashuOwnTokens: readonly CashuTokenListItem[];
  cashuIssuedTokens: readonly CashuTokenListItem[];
  checkAllCashuTokensAndDeleteInvalid: () => Promise<void>;
  getMintIconUrl: (mint: MintUrlInput) => {
    origin: string | null;
    url: string | null;
    host: string | null;
    failed: boolean;
  };
  meltLargestForeignMintToMainMint: () => Promise<void>;
  setMintIconUrlByMint: Dispatch<SetStateAction<Record<string, string | null>>>;
  t: (key: string) => string;
}

export const CashuTokensPage: FC<CashuTokensPageProps> = ({
  cashuBalance,
  cashuBulkCheckIsBusy,
  cashuIsBusy,
  cashuIssuedTokens,
  cashuMeltToMainMintButtonLabel,
  cashuOwnTokens,
  checkAllCashuTokensAndDeleteInvalid,
  getMintIconUrl,
  meltLargestForeignMintToMainMint,
  setMintIconUrlByMint,
  t,
}) => {
  const { formatDisplayedAmountText } = useAppShellCore();
  const navigateTo = useNavigation();
  const issuedBalance = cashuIssuedTokens.reduce((sum, token) => {
    const amount = Number(token.amount ?? 0);
    return sum + (Number.isFinite(amount) ? amount : 0);
  }, 0);

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
              {t("cashuMine")} · {formatDisplayedAmountText(cashuBalance)}
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
        </div>

        <div className="ln-list wallet-token-list">
          <div className="list-header">
            <span>
              {t("cashuIssued")} · {formatDisplayedAmountText(issuedBalance)}
            </span>
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
