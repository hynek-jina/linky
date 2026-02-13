import React from "react";

interface WalletWarningProps {
  t: (key: string) => string;
}

export function WalletWarning({ t }: WalletWarningProps): React.ReactElement {
  return (
    <div className="wallet-warning" role="alert">
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
