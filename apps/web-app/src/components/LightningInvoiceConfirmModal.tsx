import React from "react";
import { WalletBalance } from "../components/WalletBalance";
import type { LightningInvoicePreview } from "../utils/lightningInvoice";

interface LightningInvoiceConfirmModalProps {
  cashuBalance: number;
  cashuIsBusy: boolean;
  confirmation: LightningInvoicePreview;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  t: (key: string) => string;
}

const formatRemainingLifetime = (
  remainingSeconds: number | null,
): string | null => {
  if (
    !Number.isFinite(remainingSeconds) ||
    remainingSeconds === null ||
    remainingSeconds < 0
  ) {
    return null;
  }

  const totalSeconds = Math.max(0, Math.floor(remainingSeconds));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
};

export function LightningInvoiceConfirmModal({
  cashuBalance,
  cashuIsBusy,
  confirmation,
  onClose,
  onConfirm,
  t,
}: LightningInvoiceConfirmModalProps): React.ReactElement {
  const [nowMs, setNowMs] = React.useState(() => Date.now());

  React.useEffect(() => {
    if (confirmation.expiresAtSec === null) return;

    const intervalId = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [confirmation.expiresAtSec]);

  const expiresLabel = formatRemainingLifetime(
    confirmation.expiresAtSec === null
      ? null
      : confirmation.expiresAtSec - nowMs / 1000,
  );
  const insufficientBalance =
    confirmation.amountSat !== null && confirmation.amountSat > cashuBalance;

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={t("pay")}
      onClick={onClose}
    >
      <div
        className="modal-sheet lightning-invoice-confirm-sheet"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="lightning-invoice-confirm-summary">
          <div className="lightning-invoice-confirm-amount">
            {confirmation.amountSat === null ? (
              <div className="lightning-invoice-confirm-unknown-amount">
                {t("lightningInvoiceConfirmUnknownAmount")}
              </div>
            ) : (
              <WalletBalance
                ariaLabel={t("pay")}
                balance={confirmation.amountSat}
              />
            )}
          </div>

          <div className="lightning-invoice-confirm-meta">
            {confirmation.description ? (
              <div className="lightning-invoice-confirm-description">
                {confirmation.description}
              </div>
            ) : null}

            {expiresLabel ? (
              <div className="lightning-invoice-confirm-expiry muted">
                {expiresLabel}
              </div>
            ) : null}
          </div>
        </div>

        <div className="modal-actions">
          <button
            className="btn-wide"
            onClick={() => {
              void onConfirm();
            }}
            disabled={cashuIsBusy || insufficientBalance}
            title={insufficientBalance ? t("payInsufficient") : undefined}
          >
            {t("paySend")}
          </button>
          <button
            className="btn-wide secondary"
            onClick={onClose}
            disabled={cashuIsBusy}
          >
            {t("payCancel")}
          </button>
        </div>
      </div>
    </div>
  );
}
