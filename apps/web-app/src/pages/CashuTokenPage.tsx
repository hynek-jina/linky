import type { FC } from "react";
import React from "react";
import { useAppShellCore } from "../app/context/AppShellContexts";
import {
  isCashuTokenAcceptedState,
  isCashuTokenExternalizedState,
  isCashuTokenIssuedState,
  isCashuTokenReservedState,
  isCashuTokenUnavailableState,
} from "../app/lib/cashuTokenState";
import { extractCashuTokenMeta } from "../app/lib/tokenText";
import type { CashuTokenRowLike } from "../app/types/appTypes";
import { parseCashuToken } from "../cashu";
import { NfcIcon } from "../components/NfcIcon";
import { WalletBalance } from "../components/WalletBalance";
import type { CashuTokenId } from "../evolu";
import { useNavigation } from "../hooks/useRouting";
import { buildCashuShareUrl } from "../utils/deepLinks";

type CashuTokenPageRow = CashuTokenRowLike & { id: CashuTokenId };

interface CashuTokenPageProps {
  canSendToContact: boolean;
  canWriteToNfc: boolean;
  cashuIsBusy: boolean;
  cashuTokensAll: readonly CashuTokenPageRow[];
  checkAndRefreshCashuToken: (
    id: CashuTokenId,
  ) => Promise<"ok" | "invalid" | "transient" | "skipped">;
  checkSingleIssuedCashuTokenIsClaimed: (id: CashuTokenId) => Promise<boolean>;
  copyText: (text: string) => Promise<void>;
  pendingCashuDeleteId: CashuTokenId | null;
  reserveCashuToken: (id: CashuTokenId) => Promise<void>;
  requestDeleteCashuToken: (id: CashuTokenId) => void;
  returnCashuTokenToWallet: (id: CashuTokenId) => Promise<void>;
  routeId: CashuTokenId;
  shareTokenText: (id: CashuTokenId, text: string) => Promise<void>;
  startSendCashuTokenToContact: (id: CashuTokenId) => Promise<void>;
  t: (key: string) => string;
  writeToNfc: (id: CashuTokenId, tokenText: string) => Promise<void>;
}

export const CashuTokenPage: FC<CashuTokenPageProps> = ({
  canSendToContact,
  canWriteToNfc,
  cashuIsBusy,
  cashuTokensAll,
  checkAndRefreshCashuToken,
  checkSingleIssuedCashuTokenIsClaimed,
  copyText,
  pendingCashuDeleteId,
  reserveCashuToken,
  requestDeleteCashuToken,
  returnCashuTokenToWallet,
  routeId,
  shareTokenText,
  startSendCashuTokenToContact,
  t,
  writeToNfc,
}) => {
  const { formatDisplayedAmountText } = useAppShellCore();
  const navigateTo = useNavigation();
  const [tokenQr, setTokenQr] = React.useState<string | null>(null);
  const row = cashuTokensAll.find(
    (tkn) => tkn.id === routeId && !tkn.isDeleted,
  );

  const tokenMeta = row ? extractCashuTokenMeta(row) : null;
  const tokenText = tokenMeta?.tokenText ?? "";

  const parsed = tokenText ? parseCashuToken(tokenText) : null;
  const tokenAmount = (() => {
    const storedAmount = Number(tokenMeta?.amount ?? 0);
    if (Number.isFinite(storedAmount) && storedAmount > 0) {
      return storedAmount;
    }

    const parsedAmount = Number(parsed?.amount ?? 0);
    return Number.isFinite(parsedAmount) && parsedAmount > 0 ? parsedAmount : 0;
  })();
  const mintText =
    String(tokenMeta?.mint ?? "").trim() ||
    (parsed?.mint ? String(parsed.mint).trim() : "");
  const mintDisplay = (() => {
    if (!mintText) return null;
    try {
      return new URL(mintText).host;
    } catch {
      return mintText;
    }
  })();
  const isExternalized = isCashuTokenExternalizedState(row?.state);
  const isIssued = isCashuTokenIssuedState(row?.state);
  const isReserved = isCashuTokenReservedState(row?.state);
  const isPending = String(row?.state ?? "") === "pending";
  const isOwnToken = isCashuTokenAcceptedState(row?.state);
  const canReturnToWallet = isCashuTokenUnavailableState(row?.state);
  const shareUrl = buildCashuShareUrl(tokenText);
  const shareMessage = (() => {
    if (!shareUrl) return "";

    if (tokenMeta?.amount && tokenMeta.amount > 0) {
      return t("cashuShareMessageWithAmount")
        .replace("{amount}", formatDisplayedAmountText(tokenMeta.amount))
        .replace("{url}", shareUrl);
    }

    return t("cashuShareMessage").replace("{url}", shareUrl);
  })();

  React.useEffect(() => {
    let cancelled = false;

    const generate = async () => {
      if (!tokenText.trim()) {
        setTokenQr(null);
        return;
      }

      try {
        const QRCode = await import("qrcode");
        const qr = await QRCode.toDataURL(tokenText, {
          errorCorrectionLevel: "M",
          margin: 2,
        });
        if (!cancelled) {
          setTokenQr(qr);
        }
      } catch {
        if (!cancelled) {
          setTokenQr(null);
        }
      }
    };

    void generate();

    return () => {
      cancelled = true;
    };
  }, [tokenText]);

  // Poll the source mint while the user is staring at the QR of an issued
  // token (issue #86): wallet.checkProofsStates is the passive NUT-07
  // query, so it doesn't consume the proofs. Once all proofs flip to
  // SPENT the helper soft-deletes the row and we navigate back to the
  // tokens list — staying on the now-orphan detail page would just
  // render the generic error panel.
  //
  // The helper's identity changes whenever cashuTokensAll updates, so
  // we stash the latest reference in a ref to keep the 10s interval
  // from being torn down + restarted on every churn. Without this the
  // tick was effectively firing every couple of seconds under load.
  const checkSingleIssuedRef = React.useRef(
    checkSingleIssuedCashuTokenIsClaimed,
  );
  React.useEffect(() => {
    checkSingleIssuedRef.current = checkSingleIssuedCashuTokenIsClaimed;
  }, [checkSingleIssuedCashuTokenIsClaimed]);

  React.useEffect(() => {
    if (!isIssued) return;

    let cancelled = false;
    let inFlight = false;
    const tick = async () => {
      if (cancelled || inFlight) return;
      inFlight = true;
      try {
        const claimed = await checkSingleIssuedRef.current(routeId);
        if (claimed && !cancelled) {
          navigateTo({ route: "cashuTokens" });
        }
      } finally {
        inFlight = false;
      }
    };
    void tick();
    const intervalId = window.setInterval(() => {
      void tick();
    }, 10_000);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [isIssued, navigateTo, routeId]);

  // If the row vanished after we had loaded it once (claim detector,
  // manual delete, etc.), bounce back to the tokens list instead of
  // rendering the generic error panel. Critical: do NOT navigate when
  // the row is undefined on the FIRST render — cashuTokensAll is
  // hydrated asynchronously from Evolu and is briefly empty on initial
  // mount, which would otherwise kick the user out before the QR has
  // a chance to render.
  const rowMissing = !row || !tokenMeta;
  const hadRowRef = React.useRef(false);
  if (!rowMissing) hadRowRef.current = true;
  React.useEffect(() => {
    if (!rowMissing) return;
    if (!hadRowRef.current) return;
    navigateTo({ route: "cashuTokens" });
  }, [navigateTo, rowMissing]);

  if (rowMissing) {
    return null;
  }

  const safeRow = row;

  return (
    <section className="panel topup-invoice-panel cashu-token-panel">
      <div className="topup-invoice-head">
        <div className="topup-invoice-balance">
          <WalletBalance ariaLabel={t("cashuToken")} balance={tokenAmount} />
        </div>

        {mintDisplay ? (
          <p className="topup-invoice-mint-note">
            Mint:{" "}
            <span className="relay-url topup-invoice-mint-value">
              {mintDisplay}
            </span>
          </p>
        ) : null}
      </div>

      {String(safeRow.state ?? "") === "error" && (
        <p className="cashu-token-status cashu-token-status-error">
          {String(safeRow.error ?? "").trim() || t("cashuInvalid")}
        </p>
      )}

      {isExternalized && (
        <p className="cashu-token-status">{t("cashuOnNfc")}</p>
      )}

      {isPending && (
        <p className="cashu-token-status">{t("cashuPendingHint")}</p>
      )}

      {tokenQr ? (
        <div className="topup-invoice-qr-shell cashu-token-qr-shell">
          <button
            type="button"
            className="topup-invoice-qr-button cashu-token-qr-button"
            onClick={() => void copyText(tokenText)}
            title={t("copy")}
            aria-label={t("copy")}
          >
            <img
              className="qr topup-invoice-qr cashu-token-qr"
              src={tokenQr}
              alt={t("cashuToken")}
            />
          </button>
        </div>
      ) : null}

      {!isIssued && !isPending && !isReserved ? (
        <div className="settings-row">
          <button
            className="btn-wide"
            onClick={() => void checkAndRefreshCashuToken(routeId)}
            disabled={cashuIsBusy}
          >
            {t("cashuCheckToken")}
          </button>
        </div>
      ) : null}

      {isIssued && canSendToContact ? (
        <div className="settings-row">
          <button
            className="btn-wide"
            onClick={() => void startSendCashuTokenToContact(routeId)}
            disabled={!tokenText.trim()}
          >
            {t("cashuSendToContact")}
          </button>
        </div>
      ) : null}

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
          className="btn-wide secondary"
          onClick={() => void shareTokenText(routeId, shareMessage)}
          disabled={!shareMessage}
        >
          {t("share")}
        </button>
      </div>

      {isOwnToken ? (
        <div className="settings-row">
          <button
            className="btn-wide secondary"
            onClick={() => void reserveCashuToken(routeId)}
            disabled={cashuIsBusy}
          >
            {t("cashuMarkReserved")}
          </button>
        </div>
      ) : null}

      {canWriteToNfc ? (
        <div className="settings-row">
          <button
            className="btn-wide secondary btn-inline-icon"
            onClick={() => void writeToNfc(routeId, tokenText)}
            disabled={!tokenText.trim()}
          >
            <span className="btn-label-icon" aria-hidden="true">
              <NfcIcon />
            </span>
            {t("uploadToNfc")}
          </button>
        </div>
      ) : null}

      {canReturnToWallet ? (
        <div className="settings-row">
          <button
            className="btn-wide secondary"
            onClick={() => void returnCashuTokenToWallet(routeId)}
            disabled={cashuIsBusy}
          >
            {t("cashuReturnToWallet")}
          </button>
        </div>
      ) : null}

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
