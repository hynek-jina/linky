import React from "react";
import type { LnurlWithdrawPreview } from "../lnurlPay";
import { WalletBalance } from "./WalletBalance";

interface LnurlWithdrawConfirmModalProps {
  confirmation: LnurlWithdrawPreview;
  isBusy: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  t: (key: string) => string;
}

export function LnurlWithdrawConfirmModal({
  confirmation,
  isBusy,
  onClose,
  onConfirm,
  t,
}: LnurlWithdrawConfirmModalProps): React.ReactElement {
  const hasVariableAmount =
    confirmation.minAmountSat !== confirmation.maxAmountSat;

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={t("walletReceive")}
      onClick={onClose}
    >
      <div
        className="modal-sheet lightning-invoice-confirm-sheet"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="lightning-invoice-confirm-summary">
          <div className="lightning-invoice-confirm-amount">
            <WalletBalance
              ariaLabel={t("walletReceive")}
              balance={confirmation.amountSat}
            />
          </div>

          <div className="lightning-invoice-confirm-meta">
            <div className="lightning-invoice-confirm-description">
              {confirmation.description ?? confirmation.target}
            </div>

            {hasVariableAmount ? (
              <div className="lightning-invoice-confirm-expiry muted">
                {t("lnurlWithdrawVariableAmount")}
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
            disabled={isBusy}
          >
            {t("walletReceive")}
          </button>
          <button
            className="btn-wide secondary"
            onClick={onClose}
            disabled={isBusy}
          >
            {t("payCancel")}
          </button>
        </div>
      </div>
    </div>
  );
}
