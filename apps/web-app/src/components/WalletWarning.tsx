import React from "react";

export interface WalletWarningBanner {
  kind: "early-warning";
  onDismiss: () => void;
}

interface WalletWarningProps {
  banner: WalletWarningBanner | null;
  t: (key: string) => string;
}

export function WalletWarning({
  banner,
  t,
}: WalletWarningProps): React.ReactElement {
  if (!banner) return <></>;

  return (
    <div className="wallet-warning" role="alert">
      <button
        type="button"
        className="wallet-warning-close"
        onClick={banner.onDismiss}
        aria-label={t("close")}
        title={t("close")}
      >
        ×
      </button>
      <div className="wallet-warning-icon" aria-hidden="true">
        ⚠
      </div>
      <div className="wallet-warning-text">
        <div className="wallet-warning-title">
          {t("walletEarlyWarningTitle")}
        </div>
        <div className="wallet-warning-body">{t("walletEarlyWarningBody")}</div>
      </div>
    </div>
  );
}
