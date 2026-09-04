import React from "react";
import { formatMintHost } from "../utils/mint";
import type { Translate } from "../i18n";

interface PaymentMintMeltConfirmModalProps {
  fromMint: string;
  isBusy: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  t: Translate;
  toMint: string;
}

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
            .replace("{fromMint}", formatMintHost(fromMint))
            .replace("{toMint}", formatMintHost(toMint))}
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
