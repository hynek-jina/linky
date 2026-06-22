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
  cashuBalanceAfterMelt: number;
  cashuIsBusy: boolean;
  effectiveMyLightningAddress: string | null;
  makeNip98AuthHeader: Nip98AuthHeaderFactory;
  ownedLightningAddresses: readonly string[];
  ownedLightningAddressesLoading: boolean;
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
  cashuBalanceAfterMelt,
  cashuIsBusy,
  effectiveMyLightningAddress,
  makeNip98AuthHeader,
  ownedLightningAddresses,
  ownedLightningAddressesLoading,
  payLightningInvoiceWithCashu,
  saveClaimedLightningAddress,
  serverBaseUrl,
  t,
}: ProfileLightningAddressClaimPageProps): React.ReactElement {
  const navigateTo = useNavigation();
  const [usernameInput, setUsernameInput] = React.useState("");
  const [activatingLightningAddress, setActivatingLightningAddress] =
    React.useState<string | null>(null);
  const [isChecking, setIsChecking] = React.useState(false);
  const [isConfirming, setIsConfirming] = React.useState(false);
  const [isVerifyingExistingAddress, setIsVerifyingExistingAddress] =
    React.useState(false);
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
  const normalizedEffectiveMyLightningAddress = React.useMemo(
    () =>
      String(effectiveMyLightningAddress ?? "")
        .trim()
        .toLowerCase(),
    [effectiveMyLightningAddress],
  );
  const visibleOwnedLightningAddresses = React.useMemo(() => {
    const seen = new Set<string>();
    const addresses: string[] = [];

    for (const candidate of ownedLightningAddresses) {
      const normalized = String(candidate ?? "")
        .trim()
        .toLowerCase();
      if (!normalized || seen.has(normalized)) continue;
      seen.add(normalized);
      addresses.push(normalized);
    }

    return addresses;
  }, [ownedLightningAddresses]);
  const hasOwnedLightningAddresses = visibleOwnedLightningAddresses.length > 0;

  React.useEffect(() => {
    setSubmissionError(null);
  }, [normalizedUsername]);

  React.useEffect(() => {
    if (
      ownedLightningAddressesLoading ||
      hasOwnedLightningAddresses ||
      !normalizedUsername ||
      validationIssue
    ) {
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
  }, [
    hasOwnedLightningAddresses,
    makeNip98AuthHeader,
    normalizedUsername,
    ownedLightningAddressesLoading,
    serverBaseUrl,
    validationIssue,
  ]);

  const availablePreview = previewResult?.preview ?? null;
  const canVerifyExistingAddress =
    previewResult?.kind === "already_set" &&
    Boolean(desiredLightningAddress) &&
    !validationIssue;
  const quotedAmount = availablePreview?.invoice.amountSat ?? null;
  const insufficientBalance =
    quotedAmount !== null && Number.isFinite(quotedAmount)
      ? quotedAmount > Math.max(cashuBalance, cashuBalanceAfterMelt)
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
    if (ownedLightningAddressesLoading) {
      return t("claimOwnLightningAddressChecking");
    }
    if (hasOwnedLightningAddresses) {
      return t("claimOwnLightningAddressOwnedHint");
    }
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

  const handleVerifyExistingAddress = React.useCallback(async () => {
    if (!canVerifyExistingAddress || !desiredLightningAddress) return;
    if (isVerifyingExistingAddress) return;

    setSubmissionError(null);
    setIsVerifyingExistingAddress(true);
    try {
      const saved = await saveClaimedLightningAddress(desiredLightningAddress);
      if (!saved) return;
      navigateTo({ route: "profileEdit" });
    } finally {
      setIsVerifyingExistingAddress(false);
    }
  }, [
    canVerifyExistingAddress,
    desiredLightningAddress,
    isVerifyingExistingAddress,
    navigateTo,
    saveClaimedLightningAddress,
  ]);

  const handleVerifyLightningAddress = React.useCallback(
    async (lightningAddress: string) => {
      const normalized = String(lightningAddress ?? "")
        .trim()
        .toLowerCase();
      if (!normalized || isVerifyingExistingAddress) return;

      setSubmissionError(null);
      setIsVerifyingExistingAddress(true);
      try {
        const saved = await saveClaimedLightningAddress(normalized);
        if (!saved) return;
        navigateTo({ route: "profileEdit" });
      } finally {
        setIsVerifyingExistingAddress(false);
      }
    },
    [isVerifyingExistingAddress, navigateTo, saveClaimedLightningAddress],
  );

  const handleActivateOwnedLightningAddress = React.useCallback(
    async (lightningAddress: string) => {
      const normalized = String(lightningAddress ?? "")
        .trim()
        .toLowerCase();
      if (!normalized) return;
      if (
        activatingLightningAddress ||
        normalized === normalizedEffectiveMyLightningAddress
      ) {
        return;
      }

      setSubmissionError(null);
      setActivatingLightningAddress(normalized);
      try {
        const saved = await saveClaimedLightningAddress(normalized);
        if (!saved) return;
        navigateTo({ route: "profileEdit" });
      } finally {
        setActivatingLightningAddress(null);
      }
    },
    [
      activatingLightningAddress,
      navigateTo,
      normalizedEffectiveMyLightningAddress,
      saveClaimedLightningAddress,
    ],
  );

  return (
    <section className="panel">
      <div className="panel-header" style={{ marginBottom: 12 }}>
        <strong>{t("claimOwnLightningAddressTitle")}</strong>
      </div>

      {visibleOwnedLightningAddresses.length > 0 ? (
        <div style={{ marginBottom: 16 }}>
          <p className="muted" style={{ marginBottom: 8, marginTop: 0 }}>
            {t("claimOwnLightningAddressOwned")}
          </p>
          {visibleOwnedLightningAddresses.map((lightningAddress) => {
            const isActive =
              lightningAddress === normalizedEffectiveMyLightningAddress;
            const isActivating =
              activatingLightningAddress === lightningAddress;

            return (
              <div className="settings-row" key={lightningAddress}>
                <div className="settings-left">
                  <span className="settings-label">
                    {formatShortLightningAddress(lightningAddress)}
                  </span>
                </div>
                <div className="settings-right">
                  <button
                    className="secondary"
                    disabled={
                      isActive ||
                      isActivating ||
                      isConfirming ||
                      isVerifyingExistingAddress
                    }
                    onClick={() => {
                      void handleActivateOwnedLightningAddress(
                        lightningAddress,
                      );
                    }}
                  >
                    {isActive
                      ? t("claimOwnLightningAddressActive")
                      : t("claimOwnLightningAddressActivate")}
                  </button>
                  {isActive ? (
                    <button
                      className="secondary"
                      disabled={
                        isActivating ||
                        isConfirming ||
                        isVerifyingExistingAddress
                      }
                      onClick={() => {
                        void handleVerifyLightningAddress(lightningAddress);
                      }}
                    >
                      {t("claimOwnLightningAddressVerifyExisting")}
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      {effectiveMyLightningAddress ? (
        <p className="muted" style={{ marginTop: 0 }}>
          {t("claimOwnLightningAddressCurrent")}:{" "}
          {formatShortLightningAddress(effectiveMyLightningAddress)}
        </p>
      ) : null}

      <div className="settings-row" style={{ marginTop: 12 }}>
        <div className="settings-left">
          <span className="settings-label">{availabilityMessage}</span>
        </div>
      </div>

      {!ownedLightningAddressesLoading && !hasOwnedLightningAddresses ? (
        <>
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

          {availablePreview ? (
            <div className="panel-header" style={{ marginTop: 16 }}>
              <button
                disabled={
                  activatingLightningAddress !== null ||
                  cashuIsBusy ||
                  isChecking ||
                  isConfirming ||
                  isVerifyingExistingAddress ||
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
          ) : null}

          {canVerifyExistingAddress ? (
            <div className="panel-header" style={{ marginTop: 12 }}>
              <button
                className="secondary"
                disabled={
                  activatingLightningAddress !== null ||
                  cashuIsBusy ||
                  isChecking ||
                  isConfirming ||
                  isVerifyingExistingAddress
                }
                onClick={() => {
                  void handleVerifyExistingAddress();
                }}
              >
                {t("claimOwnLightningAddressVerifyExisting")}
              </button>
            </div>
          ) : null}
        </>
      ) : null}

      {submissionError ? (
        <p className="muted" style={{ marginTop: 12 }}>
          {submissionError}
        </p>
      ) : null}
    </section>
  );
}
