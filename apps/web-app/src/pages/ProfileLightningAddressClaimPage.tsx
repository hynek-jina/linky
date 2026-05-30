import React from "react";
import { WalletBalance } from "../components/WalletBalance";
import { useNavigation } from "../hooks/useRouting";
import { formatShortLightningAddress } from "../utils/formatting";
import {
  finalizeOwnLightningAddressClaim,
  getOwnLightningAddressFromUsername,
  getOwnLightningUsernameValidationIssue,
  type Nip98AuthHeaderFactory,
  normalizeOwnLightningUsername,
  type OwnLightningClaimAvailableResult,
  requestOwnLightningAddressClaimPreview,
} from "../utils/npubCashUsernameClaim";

interface ProfileLightningAddressClaimPageProps {
  cashuBalance: number;
  cashuIsBusy: boolean;
  effectiveMyLightningAddress: string | null;
  makeNip98AuthHeader: Nip98AuthHeaderFactory;
  payLightningInvoiceWithCashu: (invoice: string) => Promise<boolean>;
  saveClaimedLightningAddress: (lightningAddress: string) => Promise<boolean>;
  serverBaseUrl: string;
  t: (key: string) => string;
}

const CONFIRM_RETRY_DELAY_MS = 1_000;
const CONFIRM_RETRY_LIMIT = 5;

const wait = (ms: number): Promise<void> => {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
};

export function ProfileLightningAddressClaimPage({
  cashuBalance,
  cashuIsBusy,
  effectiveMyLightningAddress,
  makeNip98AuthHeader,
  payLightningInvoiceWithCashu,
  saveClaimedLightningAddress,
  serverBaseUrl,
  t,
}: ProfileLightningAddressClaimPageProps): React.ReactElement {
  const navigateTo = useNavigation();
  const [usernameInput, setUsernameInput] = React.useState("");
  const [isChecking, setIsChecking] = React.useState(false);
  const [isConfirming, setIsConfirming] = React.useState(false);
  const [previewResult, setPreviewResult] = React.useState<null | {
    kind: "already_set" | "available" | "error" | "taken";
    message?: string;
    preview?: OwnLightningClaimAvailableResult;
  }>(null);
  const [submissionError, setSubmissionError] = React.useState<string | null>(
    null,
  );

  const normalizedUsername = React.useMemo(
    () => normalizeOwnLightningUsername(usernameInput),
    [usernameInput],
  );
  const validationIssue = React.useMemo(
    () => getOwnLightningUsernameValidationIssue(normalizedUsername),
    [normalizedUsername],
  );
  const desiredLightningAddress = React.useMemo(
    () => getOwnLightningAddressFromUsername(normalizedUsername),
    [normalizedUsername],
  );

  React.useEffect(() => {
    setSubmissionError(null);
  }, [normalizedUsername]);

  React.useEffect(() => {
    if (!normalizedUsername) {
      setIsChecking(false);
      setPreviewResult(null);
      return;
    }

    if (validationIssue) {
      setIsChecking(false);
      setPreviewResult(null);
      return;
    }

    const controller = new AbortController();
    let cancelled = false;
    const timeoutId = window.setTimeout(() => {
      setIsChecking(true);
      void requestOwnLightningAddressClaimPreview({
        makeNip98AuthHeader,
        serverBaseUrl,
        signal: controller.signal,
        username: normalizedUsername,
      })
        .then((result) => {
          if (cancelled) return;
          if (result.kind === "available") {
            setPreviewResult({ kind: "available", preview: result });
            return;
          }
          if (result.kind === "taken") {
            setPreviewResult({ kind: "taken", message: result.message });
            return;
          }
          if (result.kind === "already_set") {
            setPreviewResult({
              kind: "already_set",
              message: result.message,
            });
            return;
          }
          if (result.kind === "error") {
            setPreviewResult({ kind: "error", message: result.message });
            return;
          }
          setPreviewResult(null);
        })
        .finally(() => {
          if (cancelled) return;
          setIsChecking(false);
        });
    }, 350);

    return () => {
      cancelled = true;
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, [makeNip98AuthHeader, normalizedUsername, serverBaseUrl, validationIssue]);

  const availablePreview = previewResult?.preview ?? null;
  const quotedAmount = availablePreview?.invoice.amountSat ?? null;
  const insufficientBalance =
    quotedAmount !== null && Number.isFinite(quotedAmount)
      ? quotedAmount > cashuBalance
      : false;

  const validationMessage = (() => {
    if (validationIssue === "too_short") {
      return t("claimOwnLightningAddressTooShort");
    }
    if (validationIssue === "invalid_format") {
      return t("claimOwnLightningAddressInvalid");
    }
    return null;
  })();

  const availabilityMessage = (() => {
    if (!normalizedUsername) return t("claimOwnLightningAddressHint");
    if (validationMessage) return validationMessage;
    if (isChecking) return t("claimOwnLightningAddressChecking");
    if (previewResult?.kind === "taken") {
      return t("claimOwnLightningAddressTaken");
    }
    if (previewResult?.kind === "already_set") {
      return t("claimOwnLightningAddressAlreadySet");
    }
    if (previewResult?.kind === "error") {
      return previewResult.message ?? t("claimOwnLightningAddressCheckFailed");
    }
    if (availablePreview) return t("claimOwnLightningAddressAvailable");
    return t("claimOwnLightningAddressHint");
  })();

  const handleConfirm = React.useCallback(async () => {
    if (!availablePreview) return;
    if (isConfirming || cashuIsBusy) return;

    setIsConfirming(true);
    setSubmissionError(null);
    try {
      const paid = await payLightningInvoiceWithCashu(
        availablePreview.invoice.invoice,
      );
      if (!paid) return;

      let finalized = false;
      for (let attempt = 0; attempt < CONFIRM_RETRY_LIMIT; attempt += 1) {
        const result = await finalizeOwnLightningAddressClaim({
          makeNip98AuthHeader,
          paymentToken: availablePreview.paymentToken,
          serverBaseUrl,
          username: availablePreview.username,
        });

        if (result.kind === "success" || result.kind === "already_set") {
          finalized = true;
          break;
        }

        if (result.kind === "unpaid" && attempt + 1 < CONFIRM_RETRY_LIMIT) {
          await wait(CONFIRM_RETRY_DELAY_MS);
          continue;
        }

        setSubmissionError(
          result.kind === "unpaid"
            ? t("claimOwnLightningAddressUnpaid")
            : result.message,
        );
        return;
      }

      if (!finalized) {
        setSubmissionError(t("claimOwnLightningAddressUnpaid"));
        return;
      }

      const saved = await saveClaimedLightningAddress(
        availablePreview.lightningAddress,
      );
      if (!saved) return;

      navigateTo({ route: "profileEdit" });
    } finally {
      setIsConfirming(false);
    }
  }, [
    availablePreview,
    cashuIsBusy,
    isConfirming,
    makeNip98AuthHeader,
    navigateTo,
    payLightningInvoiceWithCashu,
    saveClaimedLightningAddress,
    serverBaseUrl,
    t,
  ]);

  return (
    <section className="panel">
      <div className="panel-header" style={{ marginBottom: 12 }}>
        <strong>{t("claimOwnLightningAddressTitle")}</strong>
      </div>

      {effectiveMyLightningAddress ? (
        <p className="muted" style={{ marginTop: 0 }}>
          {t("claimOwnLightningAddressCurrent")}:{" "}
          {formatShortLightningAddress(effectiveMyLightningAddress)}
        </p>
      ) : null}

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <label htmlFor="profileClaimLightningUsername">
          {t("claimOwnLightningAddressInputLabel")}
        </label>
      </div>

      <input
        id="profileClaimLightningUsername"
        autoCapitalize="none"
        autoCorrect="off"
        inputMode="text"
        onChange={(event) => setUsernameInput(event.target.value)}
        placeholder={t("claimOwnLightningAddressPlaceholder")}
        spellCheck={false}
        value={usernameInput}
      />

      {desiredLightningAddress ? (
        <p className="muted" style={{ marginTop: 8 }}>
          {t("claimOwnLightningAddressDesired")}:{" "}
          {formatShortLightningAddress(desiredLightningAddress)}
        </p>
      ) : null}

      <div className="settings-row" style={{ marginTop: 12 }}>
        <div className="settings-left">
          <span className="settings-label">{availabilityMessage}</span>
        </div>
      </div>

      {availablePreview ? (
        <div style={{ marginTop: 16 }}>
          <div className="settings-row">
            <div className="settings-left">
              <span className="settings-label">
                {t("claimOwnLightningAddressPrice")}
              </span>
            </div>
            <div className="settings-right">
              {quotedAmount === null ? (
                <span className="muted">
                  {t("lightningInvoiceConfirmUnknownAmount")}
                </span>
              ) : (
                <WalletBalance
                  ariaLabel={t("claimOwnLightningAddressPrice")}
                  balance={quotedAmount}
                />
              )}
            </div>
          </div>

          {availablePreview.invoice.description ? (
            <p className="muted" style={{ marginTop: 8 }}>
              {availablePreview.invoice.description}
            </p>
          ) : null}
        </div>
      ) : null}

      {submissionError ? (
        <p className="muted" style={{ marginTop: 12 }}>
          {submissionError}
        </p>
      ) : null}

      <div className="panel-header" style={{ marginTop: 16 }}>
        <button
          disabled={
            !availablePreview ||
            cashuIsBusy ||
            isChecking ||
            isConfirming ||
            insufficientBalance
          }
          onClick={() => {
            void handleConfirm();
          }}
          title={insufficientBalance ? t("payInsufficient") : undefined}
        >
          {t("claimOwnLightningAddressConfirm")}
        </button>
      </div>
    </section>
  );
}
