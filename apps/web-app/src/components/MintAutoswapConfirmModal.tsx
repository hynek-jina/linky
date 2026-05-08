import React from "react";

interface MintAutoswapConfirmModalProps {
  fromMint: string;
  onClose: () => void;
  onConfirm: () => void;
  t: (key: string) => string;
  toMint: string;
}

export function MintAutoswapConfirmModal({
  fromMint,
  onClose,
  onConfirm,
  t,
  toMint,
}: MintAutoswapConfirmModalProps): React.ReactElement {
  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={t("mintAutoswapChangeWarningTitle")}
      onClick={onClose}
    >
      <div className="modal-sheet" onClick={(event) => event.stopPropagation()}>
        <div className="modal-title">{t("mintAutoswapChangeWarningTitle")}</div>
        <div className="modal-body">
          {t("mintAutoswapChangeWarning")
            .replace("{fromMint}", fromMint)
            .replace("{toMint}", toMint)}
        </div>
        <div className="modal-actions">
          <button className="btn-wide" onClick={onConfirm}>
            {t("mintAutoswapChangeWarningKeep")}
          </button>
          <button className="btn-wide secondary" onClick={onClose}>
            {t("mintAutoswapChangeWarningDisable")}
          </button>
        </div>
      </div>
    </div>
  );
}
