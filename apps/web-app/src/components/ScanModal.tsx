import React from "react";
import { useNavigation } from "../hooks/useRouting";
import {
  GalleryIcon,
  IssueTokenIcon,
  KeyboardIcon,
  PasteIcon,
  SwitchCameraIcon,
  TopupIcon,
} from "./icons";

interface ScanModalProps {
  closeScan: () => void;
  cycleScanCamera: () => void;
  onIssueToken: () => void;
  onPickScanImage: () => void;
  onScanImageSelected: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onTypePayment: () => void;
  onTypeManually: () => void;
  pasteScanValue: () => Promise<void>;
  scanCameraLabel: string | null;
  scanCanSwitchCamera: boolean;
  scanEntryPoint: "contacts" | "receive" | "send" | null;
  scanImageInputRef: React.RefObject<HTMLInputElement | null>;
  scanVideoRef: React.RefObject<HTMLVideoElement | null>;
  showTypeAction: boolean;
  showWalletActions: boolean;
  t: (key: string) => string;
}

export function ScanModal({
  closeScan,
  cycleScanCamera,
  onIssueToken,
  onPickScanImage,
  onScanImageSelected,
  onTypePayment,
  onTypeManually,
  pasteScanValue,
  scanCameraLabel,
  scanCanSwitchCamera,
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

        <div className="scan-video-wrap">
          <video ref={scanVideoRef} className="scan-video" />
          {scanCanSwitchCamera ? (
            <button
              type="button"
              className="scan-camera-switch"
              onClick={cycleScanCamera}
              aria-label={t("scanSwitchCamera")}
              title={scanCameraLabel ?? t("scanSwitchCamera")}
            >
              <SwitchCameraIcon aria-hidden="true" />
              <span>{t("scanSwitchCamera")}</span>
            </button>
          ) : null}
        </div>
        <input
          ref={scanImageInputRef}
          type="file"
          accept="image/*"
          hidden
          onChange={onScanImageSelected}
        />

        <div className="scan-footer">
          {isSendScan ? (
            <button
              type="button"
              className="scan-manual-entry-btn"
              onClick={onTypePayment}
            >
              {t("manualPayOpen")}
            </button>
          ) : null}
          <div className="scan-footer-actions">
            {showTypeAction ? (
              <button
                type="button"
                className="scan-action-btn"
                onClick={onTypeManually}
                aria-label={t("scanTypeManually")}
                title={t("scanTypeManually")}
              >
                <KeyboardIcon className="scan-action-btn-icon" />
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
              <PasteIcon className="scan-action-btn-icon" />
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
                  <TopupIcon className="scan-action-btn-icon" />
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
                  <GalleryIcon className="scan-action-btn-icon" />
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
                    <IssueTokenIcon className="scan-action-btn-icon" />
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
                  <GalleryIcon className="scan-action-btn-icon" />
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
