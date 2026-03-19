import React from "react";

interface ScanModalProps {
  closeScan: () => void;
  pasteScanValue: () => Promise<void>;
  scanVideoRef: React.RefObject<HTMLVideoElement | null>;
  t: (key: string) => string;
}

export function ScanModal({
  closeScan,
  pasteScanValue,
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

        <div className="scan-footer">
          <button
            type="button"
            className="scan-paste-btn"
            onClick={() => void pasteScanValue()}
            aria-label={t("paste")}
            title={t("paste")}
          >
            <svg
              aria-hidden="true"
              className="scan-paste-btn-icon"
              viewBox="0 0 24 24"
              fill="none"
            >
              <rect
                x="5"
                y="4"
                width="11"
                height="13"
                rx="2.2"
                stroke="currentColor"
                strokeWidth="1.8"
              />
              <rect
                x="8"
                y="7"
                width="11"
                height="13"
                rx="2.2"
                stroke="currentColor"
                strokeWidth="1.8"
              />
            </svg>
            <span className="scan-paste-btn-label">{t("paste")}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
