import React from "react";
import { isMacBrowserPlatform } from "../platform/passwordManager";

export type WalletWarningBanner =
  | {
      kind: "early-warning";
      onDismiss: () => void;
    }
  | {
      kind: "save-keys";
      body: string;
      onCopy: () => void | Promise<void>;
      onDismiss: () => void;
      onSave: () => void;
      passwordValue: string;
      title: string;
      usernameValue: string;
    };

interface WalletWarningProps {
  banner: WalletWarningBanner | null;
  t: (key: string) => string;
}

const PM_IFRAME_NAME = "linky-pm-sink";

export function WalletWarning({
  banner,
  t,
}: WalletWarningProps): React.ReactElement {
  if (!banner) return <></>;

  if (banner.kind === "save-keys") {
    const saveButtonLabel = isMacBrowserPlatform()
      ? t("onboardingSaveKeysSaveKeychain")
      : t("onboardingSaveKeysSavePasswordManager");

    return (
      <div className="wallet-warning is-save-keys" role="region">
        <button
          type="button"
          className="wallet-warning-close"
          onClick={banner.onDismiss}
          aria-label={t("close")}
          title={t("close")}
        >
          ×
        </button>
        <iframe
          name={PM_IFRAME_NAME}
          className="password-manager-bridge-iframe"
          tabIndex={-1}
          aria-hidden="true"
        />
        <div className="wallet-warning-icon" aria-hidden="true">
          i
        </div>
        <div className="wallet-warning-text">
          <div className="wallet-warning-title">{banner.title}</div>
          <div className="wallet-warning-body">{banner.body}</div>
          <div className="wallet-warning-actions">
            <form
              className="password-manager-bridge"
              action=""
              method="post"
              target={PM_IFRAME_NAME}
              onSubmit={() => banner.onSave()}
              autoComplete="on"
            >
              <input
                className="password-manager-bridge-input"
                type="text"
                name="username"
                value={banner.usernameValue}
                onChange={() => undefined}
                autoComplete="username"
                tabIndex={-1}
                aria-hidden="true"
              />
              <input
                className="password-manager-bridge-input"
                type="password"
                name="password"
                value={banner.passwordValue}
                onChange={() => undefined}
                autoComplete="new-password"
                tabIndex={-1}
                aria-hidden="true"
              />
              <button type="submit">{saveButtonLabel}</button>
            </form>
            <button
              type="button"
              className="secondary"
              onClick={() => void banner.onCopy()}
            >
              {t("copyCurrent")}
            </button>
          </div>
        </div>
      </div>
    );
  }

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
