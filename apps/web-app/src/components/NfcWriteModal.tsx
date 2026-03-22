import React from "react";
import { NfcIcon } from "./NfcIcon";

interface NfcWriteModalProps {
  kind: "profile" | "token";
  onCancel: () => void;
  t: (key: string) => string;
}

export function NfcWriteModal({
  kind,
  onCancel,
  t,
}: NfcWriteModalProps): React.ReactElement {
  const bodyKey =
    kind === "profile" ? "nfcWriteReadyProfileBody" : "nfcWriteReadyTokenBody";

  return (
    <div
      className="modal-overlay nfc-write-overlay"
      role="dialog"
      aria-modal="true"
      onClick={onCancel}
    >
      <div
        className="modal-sheet nfc-write-sheet"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="nfc-write-stage">
          <div className="nfc-write-iconWrap" aria-hidden="true">
            <NfcIcon />
          </div>
          <div className="modal-title nfc-write-title">
            {t("nfcWriteReadyTitle")}
          </div>
          <p className="modal-body nfc-write-body">{t(bodyKey)}</p>
        </div>

        <div className="modal-actions nfc-write-actions">
          <button className="btn-wide secondary" onClick={onCancel}>
            {t("payCancel")}
          </button>
        </div>
      </div>
    </div>
  );
}
