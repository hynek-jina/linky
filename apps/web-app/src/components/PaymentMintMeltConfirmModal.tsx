import React from "react";

interface PaymentMintMeltConfirmModalProps {
  fromMint: string;
  isBusy: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  t: (key: string) => string;
  toMint: string;
}

const formatMint = (mint: string): string => {
  try {
    return new URL(mint).host || mint;
  } catch {
    return mint.replace(/^https?:\/\//i, "");
  }
};

export function PaymentMintMeltConfirmModal({
  fromMint,
  isBusy,
  onClose,
  onConfirm,
  t,
  toMint,
}: PaymentMintMeltConfirmModalProps): React.ReactElement {
  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={t("cashuPaymentMeltTitle")}
      onClick={onClose}
    >
      <div className="modal-sheet" onClick={(event) => event.stopPropagation()}>
        <div className="modal-title">{t("cashuPaymentMeltTitle")}</div>
        <div className="modal-body">
          {t("cashuPaymentMeltBody")
            .replace("{fromMint}", formatMint(fromMint))
            .replace("{toMint}", formatMint(toMint))}
        </div>
        <div className="modal-actions">
          <button
            className="btn-wide"
            disabled={isBusy}
            onClick={() => void onConfirm()}
          >
            {t("cashuPaymentMeltConfirm")}
          </button>
          <button
            className="btn-wide secondary"
            disabled={isBusy}
            onClick={onClose}
          >
            {t("payCancel")}
          </button>
        </div>
      </div>
    </div>
  );
}
