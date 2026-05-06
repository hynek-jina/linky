import React from "react";
import { useNavigation } from "../hooks/useRouting";

interface ScanModalProps {
  closeScan: () => void;
  onIssueToken: () => void;
  onPickScanImage: () => void;
  onScanImageSelected: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onTypeManually: () => void;
  pasteScanValue: () => Promise<void>;
  scanEntryPoint: "contacts" | "receive" | "send" | null;
  scanImageInputRef: React.RefObject<HTMLInputElement | null>;
  scanVideoRef: React.RefObject<HTMLVideoElement | null>;
  showTypeAction: boolean;
  showWalletActions: boolean;
  t: (key: string) => string;
}

export function ScanModal({
  closeScan,
  onIssueToken,
  onPickScanImage,
  onScanImageSelected,
  onTypeManually,
  pasteScanValue,
  scanEntryPoint,
  scanImageInputRef,
  scanVideoRef,
  showTypeAction,
  showWalletActions,
  t,
}: ScanModalProps): React.ReactElement {
  const navigateTo = useNavigation();
  const isReceiveScan = scanEntryPoint === "receive";
  const isSendScan = scanEntryPoint === "send";
  const handleClose = React.useCallback(() => {
    closeScan();
    if (isReceiveScan) {
      navigateTo({ route: "wallet" });
    }
  }, [closeScan, isReceiveScan, navigateTo]);
  const title =
    scanEntryPoint === "contacts"
      ? t("contactsScanContactQr")
      : scanEntryPoint === "receive"
        ? t("walletReceive")
        : scanEntryPoint === "send"
          ? t("walletSend")
          : t("scan");

  return (
    <div className="scan-overlay" role="dialog" aria-label={title}>
      <div className="scan-sheet">
        <div className="scan-header">
          <div className="scan-title">{title}</div>
          <button
            className="topbar-btn"
            onClick={handleClose}
            aria-label={t("close")}
            title={t("close")}
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>

        <video ref={scanVideoRef} className="scan-video" />
        <input
          ref={scanImageInputRef}
          type="file"
          accept="image/*"
          hidden
          onChange={onScanImageSelected}
        />

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
            {isReceiveScan ? (
              <>
                <button
                  type="button"
                  className="scan-action-btn"
                  onClick={() => {
                    closeScan();
                    navigateTo({ route: "topup" });
                  }}
                  aria-label={t("topupSetAmount")}
                  title={t("topupSetAmount")}
                >
                  <svg
                    aria-hidden="true"
                    className="scan-action-btn-icon"
                    viewBox="0 0 24 24"
                    fill="none"
                  >
                    <path
                      d="M12 3v10"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                    />
                    <path
                      d="M8 9l4 4 4-4"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M4 14h16v6H4v-6Z"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <span className="scan-action-btn-label">
                    {t("topupSetAmount")}
                  </span>
                </button>
                <button
                  type="button"
                  className="scan-action-btn"
                  onClick={onPickScanImage}
                  aria-label={t("scanGallery")}
                  title={t("scanGallery")}
                >
                  <svg
                    aria-hidden="true"
                    className="scan-action-btn-icon"
                    viewBox="0 0 24 24"
                    fill="none"
                  >
                    <rect
                      x="3"
                      y="5"
                      width="18"
                      height="14"
                      rx="2.5"
                      stroke="currentColor"
                      strokeWidth="1.8"
                    />
                    <circle cx="9" cy="10" r="1.6" fill="currentColor" />
                    <path
                      d="M6 16l4-4 3 3 3-2 2 3"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <span className="scan-action-btn-label">
                    {t("scanGallery")}
                  </span>
                </button>
              </>
            ) : showWalletActions || isSendScan ? (
              <>
                {isSendScan ? (
                  <button
                    type="button"
                    className="scan-action-btn"
                    onClick={onIssueToken}
                    aria-label={t("cashuEmit")}
                    title={t("cashuEmit")}
                  >
                    <svg
                      aria-hidden="true"
                      className="scan-action-btn-icon"
                      viewBox="0 0 24 24"
                      fill="none"
                    >
                      <path
                        d="M12 4v16"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                      />
                      <path
                        d="M4 12h16"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                      />
                      <circle
                        cx="12"
                        cy="12"
                        r="8"
                        stroke="currentColor"
                        strokeWidth="1.8"
                      />
                    </svg>
                    <span className="scan-action-btn-label">
                      {t("cashuEmit")}
                    </span>
                  </button>
                ) : null}
                <button
                  type="button"
                  className="scan-action-btn"
                  onClick={onPickScanImage}
                  aria-label={t("scanGallery")}
                  title={t("scanGallery")}
                >
                  <svg
                    aria-hidden="true"
                    className="scan-action-btn-icon"
                    viewBox="0 0 24 24"
                    fill="none"
                  >
                    <rect
                      x="3"
                      y="5"
                      width="18"
                      height="14"
                      rx="2.5"
                      stroke="currentColor"
                      strokeWidth="1.8"
                    />
                    <circle cx="9" cy="10" r="1.6" fill="currentColor" />
                    <path
                      d="M6 16l4-4 3 3 3-2 2 3"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <span className="scan-action-btn-label">
                    {t("scanGallery")}
                  </span>
                </button>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
