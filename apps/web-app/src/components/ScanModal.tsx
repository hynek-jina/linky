import React from "react";

interface ScanModalProps {
  closeScan: () => void;
  onTypeManually: () => void;
  pasteScanValue: () => Promise<void>;
  scanVideoRef: React.RefObject<HTMLVideoElement | null>;
  showTypeAction: boolean;
  t: (key: string) => string;
}

export function ScanModal({
  closeScan,
  onTypeManually,
  pasteScanValue,
  scanVideoRef,
  showTypeAction,
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
          <div className="scan-footer-actions">
            {showTypeAction ? (
              <button
                type="button"
                className="scan-action-btn"
                onClick={onTypeManually}
                aria-label={t("scanTypeManually")}
                title={t("scanTypeManually")}
              >
                <svg
                  aria-hidden="true"
                  className="scan-action-btn-icon"
                  viewBox="0 0 24 24"
                  fill="none"
                >
                  <rect
                    x="3"
                    y="6"
                    width="18"
                    height="12"
                    rx="2.5"
                    stroke="currentColor"
                    strokeWidth="1.8"
                  />
                  <path
                    d="M7 10h.01M10 10h.01M13 10h.01M16 10h.01M8 14h8"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                  />
                </svg>
                <span className="scan-action-btn-label">
                  {t("scanTypeManually")}
                </span>
              </button>
            ) : null}
            <button
              type="button"
              className="scan-action-btn"
              onClick={() => void pasteScanValue()}
              aria-label={t("paste")}
              title={t("paste")}
            >
              <svg
                aria-hidden="true"
                className="scan-action-btn-icon"
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
              <span className="scan-action-btn-label">{t("paste")}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
