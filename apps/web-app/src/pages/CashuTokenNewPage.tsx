import type { FC } from "react";
import type {
  CashuTokenRowLike,
  CredoTokenRow,
  MintUrlInput,
} from "../app/types/appTypes";
import { CashuTokenPill } from "../components/CashuTokenPill";
import { CredoTokenPill } from "../components/CredoTokenPill";
import type { CashuTokenId, CredoTokenId } from "../evolu";
import { useNavigation } from "../hooks/useRouting";
import { formatInteger } from "../utils/formatting";

type CashuTokenListItem = CashuTokenRowLike & { id: CashuTokenId };
type CredoTokenListItem = CredoTokenRow & { id: CredoTokenId };

interface CashuTokenNewPageProps {
  cashuBalance: number;
  cashuBulkCheckIsBusy: boolean;
  cashuDraft: string;
  cashuDraftRef: React.RefObject<HTMLTextAreaElement | null>;
  cashuIsBusy: boolean;
  cashuTokens: readonly CashuTokenListItem[];
  checkAllCashuTokensAndDeleteInvalid: () => Promise<void>;
  credoOweTokens: CredoTokenListItem[];
  credoPromisedTokens: CredoTokenListItem[];
  displayUnit: string;
  getCredoRemainingAmount: (
    row: Pick<CredoTokenRow, "amount" | "settledAmount">,
  ) => number;
  getMintIconUrl: (mint: MintUrlInput) => {
    origin: string | null;
    url: string | null;
    host: string | null;
    failed: boolean;
  };
  nostrPictureByNpub: Record<string, string | null>;
  saveCashuFromText: (
    text: string,
    opts: { navigateToWallet: boolean },
  ) => Promise<void>;
  setCashuDraft: (value: string) => void;
  setMintIconUrlByMint: React.Dispatch<
    React.SetStateAction<Record<string, string | null>>
  >;
  t: (key: string) => string;
  totalCredoOutstandingIn: number;
  totalCredoOutstandingOut: number;
}

export const CashuTokenNewPage: FC<CashuTokenNewPageProps> = ({
  cashuBalance,
  cashuBulkCheckIsBusy,
  cashuDraft,
  cashuDraftRef,
  cashuIsBusy,
  cashuTokens,
  checkAllCashuTokensAndDeleteInvalid,
  credoOweTokens,
  credoPromisedTokens,
  displayUnit,
  getCredoRemainingAmount,
  getMintIconUrl,
  nostrPictureByNpub,
  saveCashuFromText,
  setCashuDraft,
  setMintIconUrlByMint,
  t,
  totalCredoOutstandingIn,
  totalCredoOutstandingOut,
}) => {
  const navigateTo = useNavigation();
  return (
    <section className="panel">
      <div className="ln-list wallet-token-list">
        <div className="list-header">
          <span>{t("totalBalanceWithPromises")}</span>
          <span>
            {formatInteger(
              cashuBalance + totalCredoOutstandingIn - totalCredoOutstandingOut,
            )}{" "}
            {displayUnit}
          </span>
        </div>
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

        <div className="list-header" style={{ marginTop: 12 }}>
          <span>
            {t("credoOwe")} · {formatInteger(totalCredoOutstandingOut)}{" "}
            {displayUnit}
          </span>
        </div>
        {credoOweTokens.length === 0 ? (
          <p className="muted">—</p>
        ) : (
          <div className="ln-tags">
            {credoOweTokens.map((token) => {
              const amount = getCredoRemainingAmount(token);
              const npub = String(token.recipient ?? "").trim();
              const avatar = npub ? nostrPictureByNpub[npub] : null;
              return (
                <CredoTokenPill
                  key={token.id}
                  token={token}
                  amount={amount}
                  avatar={avatar}
                  onClick={() =>
                    navigateTo({
                      route: "credoToken",
                      id: token.id,
                    })
                  }
                  ariaLabel={t("credoOwe")}
                  formatInteger={formatInteger}
                />
              );
            })}
          </div>
        )}

        <div className="list-header" style={{ marginTop: 12 }}>
          <span>
            {t("credoPromisedToMe")} · {formatInteger(totalCredoOutstandingIn)}{" "}
            {displayUnit}
          </span>
        </div>
        {credoPromisedTokens.length === 0 ? (
          <p className="muted">—</p>
        ) : (
          <div className="ln-tags">
            {credoPromisedTokens.map((token) => {
              const amount = getCredoRemainingAmount(token);
              const npub = String(token.issuer ?? "").trim();
              const avatar = npub ? nostrPictureByNpub[npub] : null;
              return (
                <CredoTokenPill
                  key={token.id}
                  token={token}
                  amount={amount}
                  avatar={avatar}
                  onClick={() =>
                    navigateTo({
                      route: "credoToken",
                      id: token.id,
                    })
                  }
                  ariaLabel={t("credoPromisedToMe")}
                  formatInteger={formatInteger}
                />
              );
            })}
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
