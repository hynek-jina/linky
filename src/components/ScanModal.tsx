import React from "react";

interface ScanModalProps {
  closeScan: () => void;
  scanVideoRef: React.RefObject<HTMLVideoElement>;
  t: (key: string) => string;
}

export function ScanModal({
  closeScan,
  scanVideoRef,
  t,
}: ScanModalProps): React.ReactElement {
  return (
    <div className="scan-overlay" role="dialog" aria-label={t("scan")}>
      <div className="scan-sheet">
        <div className="scan-header">
          <div className="scan-title">{t("scan")}</div>
          <button
            className="topbar-btn"
            onClick={closeScan}
            aria-label={t("close")}
            title={t("close")}
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>

        <video ref={scanVideoRef} className="scan-video" />

        <div className="scan-hints" aria-label={t("scan")}>
          {t("scanHintInvoice")}, {t("scanHintContact")},{" "}
          {t("scanHintWithdraw")}
        </div>
      </div>
    </div>
  );
}
