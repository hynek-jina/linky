import { useEffect, useState, type FC } from "react";
import { useAppShellCore } from "../app/context/AppShellContexts";
import { PaymentAmountPanel } from "../components/PaymentAmountPanel";
import {
  fetchLnurlPayPreview,
  getLnurlPayDisplayText,
  inferLightningAddressFromLnurlTarget,
  type LnurlPayPreview,
} from "../lnurlPay";
import { formatMiddleDots, getInitials } from "../utils/formatting";

interface LnAddressPayKnownContact {
  lnAddress?: string | null;
  name?: string | null;
}

interface LnAddressPayPageProps {
  canPayWithCashu: boolean;
  cashuBalance: number;
  cashuIsBusy: boolean;
  displayUnit: string;
  knownContact: LnAddressPayKnownContact | null;
  knownContactPictureUrl: string | null;
  lnAddress: string;
  lnAddressPayAmount: string;
  payLightningAddressWithCashu: (
    lnAddress: string,
    amountSat: number,
  ) => Promise<void>;
  setLnAddressPayAmount: (value: string | ((prev: string) => string)) => void;
  t: (key: string) => string;
}

export const LnAddressPayPage: FC<LnAddressPayPageProps> = ({
  canPayWithCashu,
  cashuBalance,
  cashuIsBusy,
  displayUnit,
  knownContact,
  knownContactPictureUrl,
  lnAddress,
  lnAddressPayAmount,
  payLightningAddressWithCashu,
  setLnAddressPayAmount,
  t,
}) => {
  const { formatDisplayedAmountText } = useAppShellCore();
  const [previewState, setPreviewState] = useState<{
    target: string;
    preview: LnurlPayPreview | null;
    error: string | null;
  }>({ target: "", preview: null, error: null });

  const target = String(lnAddress ?? "").trim();
  const previewLoaded = previewState.target === target;
  const previewLoading = !!target && !previewLoaded;
  const preview = previewLoaded ? previewState.preview : null;
  const previewError = previewLoaded ? previewState.error : null;

  useEffect(() => {
    if (!target) return;
    let cancelled = false;
    fetchLnurlPayPreview(target)
      .then((next) => {
        if (cancelled) return;
        setPreviewState({ target, preview: next, error: null });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const message =
          error instanceof Error ? error.message : String(error ?? "");
        setPreviewState({
          target,
          preview: null,
          error: message || t("lnurlPayLoadFailed"),
        });
      });

    return () => {
      cancelled = true;
    };
  }, [target, t]);

  const isFixedAmount =
    preview !== null && preview.minSendableSat === preview.maxSendableSat;
  const fixedAmountSat = isFixedAmount ? preview.minSendableSat : null;

  useEffect(() => {
    if (fixedAmountSat === null) return;
    const next = String(fixedAmountSat);
    setLnAddressPayAmount((current) => (current === next ? current : next));
  }, [fixedAmountSat, setLnAddressPayAmount]);

  const amountSat = Number.parseInt(lnAddressPayAmount.trim(), 10);
  const displayTarget = formatMiddleDots(getLnurlPayDisplayText(lnAddress), 36);
  const inferredLightningAddress =
    inferLightningAddressFromLnurlTarget(lnAddress);
  const displayAddress = formatMiddleDots(
    String(
      knownContact?.lnAddress ?? inferredLightningAddress ?? displayTarget,
    ),
    36,
  );
  const canCoverAnything = cashuBalance > 0;
  const availableAmountText = `${t("availablePrefix")} ${formatDisplayedAmountText(
    cashuBalance,
  )}`;

  const minSendableSat = preview?.minSendableSat ?? null;
  const maxSendableSat = preview?.maxSendableSat ?? null;

  const amountBelowRange =
    minSendableSat !== null &&
    Number.isFinite(amountSat) &&
    amountSat > 0 &&
    amountSat < minSendableSat;
  const amountAboveRange =
    maxSendableSat !== null &&
    Number.isFinite(amountSat) &&
    amountSat > maxSendableSat;

  const invalid =
    !canPayWithCashu ||
    !Number.isFinite(amountSat) ||
    amountSat <= 0 ||
    amountSat > cashuBalance ||
    previewLoading ||
    previewError !== null ||
    amountBelowRange ||
    amountAboveRange;

  let submitTitle: string | undefined;
  if (amountSat > cashuBalance) {
    submitTitle = t("payInsufficient");
  } else if (amountBelowRange && minSendableSat !== null) {
    submitTitle = t("lnurlPayAmountTooLow").replace(
      "{min}",
      String(minSendableSat),
    );
  } else if (amountAboveRange && maxSendableSat !== null) {
    submitTitle = t("lnurlPayAmountTooHigh").replace(
      "{max}",
      String(maxSendableSat),
    );
  }

  const renderNotices = (): React.ReactNode => {
    if (previewLoading) {
      return <p className="muted">{t("lnurlPayLoading")}</p>;
    }
    if (previewError) {
      return (
        <p className="muted">
          {t("lnurlPayLoadFailed")}: {previewError}
        </p>
      );
    }
    if (!preview) return null;

    const descriptionLine = preview.description ? (
      <p className="muted">{preview.description}</p>
    ) : null;

    if (isFixedAmount) {
      return (
        <>
          {descriptionLine}
          <p className="muted">
            {t("lnurlPayFixedHint").replace(
              "{amount}",
              String(preview.minSendableSat),
            )}
          </p>
        </>
      );
    }

    return (
      <>
        {descriptionLine}
        <p className="muted">
          {t("lnurlPayRangeHint")
            .replace("{min}", String(preview.minSendableSat))
            .replace("{max}", String(preview.maxSendableSat))}
        </p>
      </>
    );
  };

  return (
    <PaymentAmountPanel
      amount={lnAddressPayAmount}
      cashuIsBusy={cashuIsBusy || previewLoading}
      displayUnit={displayUnit}
      header={
        <div className="contact-header">
          {knownContact ? (
            <div className="contact-avatar is-large" aria-hidden="true">
              {knownContactPictureUrl ? (
                <img
                  src={knownContactPictureUrl}
                  alt=""
                  loading="lazy"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <span className="contact-avatar-fallback">
                  {getInitials(String(knownContact.name ?? ""))}
                </span>
              )}
            </div>
          ) : null}
          <div className="contact-header-text">
            {knownContact?.name ? <h3>{knownContact.name}</h3> : null}
            <p className="muted">{displayAddress}</p>
            <p className="muted">
              <button
                type="button"
                className="copyable available-amount-button muted"
                disabled={!canCoverAnything}
                onClick={() => {
                  if (!canCoverAnything) return;
                  setLnAddressPayAmount(String(cashuBalance));
                }}
              >
                {availableAmountText}
              </button>
            </p>
          </div>
        </div>
      }
      notices={renderNotices()}
      onAmountChange={setLnAddressPayAmount}
      onSubmit={() => {
        if (invalid) return;
        void payLightningAddressWithCashu(lnAddress, amountSat);
      }}
      submitDisabled={invalid}
      submitTitle={submitTitle}
      t={t}
    />
  );
};
