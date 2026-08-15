import React from "react";
import {
  useAppShellActions,
  useAppShellCore,
} from "../app/context/AppShellContexts";
import {
  DISPLAY_CURRENCIES,
  getDisplayUnitLabel,
} from "../utils/displayAmounts";

export function SettingsPage(): React.ReactElement {
  const {
    allowedDisplayCurrencies,
    decimalAmountInputEnabled,
    displayCurrency,
    lang,
    sendReadReceiptsEnabled,
    t,
  } = useAppShellCore();
  const {
    toggleAllowedDisplayCurrency,
    toggleDecimalAmountInput,
    toggleSendReadReceipts,
  } = useAppShellActions();

  return (
    <section className="panel">
      <p className="muted settings-note">{t("unitManageInfo")}</p>

      {DISPLAY_CURRENCIES.map((currency) => {
        const isEnabled = allowedDisplayCurrencies.includes(currency);
        const isCurrent = displayCurrency === currency;
        const isLastEnabled = isEnabled && allowedDisplayCurrencies.length <= 1;

        return (
          <div className="settings-row" key={currency}>
            <div className="settings-left">
              <span className="settings-label-group">
                <span className="settings-label">
                  {getDisplayUnitLabel(currency, lang)}
                </span>
                {isCurrent ? (
                  <span className="settings-inline-badge">
                    {t("unitCurrent")}
                  </span>
                ) : null}
              </span>
            </div>

            <div className="settings-right">
              <label className="switch">
                <input
                  className="switch-input"
                  type="checkbox"
                  checked={isEnabled}
                  disabled={isLastEnabled}
                  aria-label={`${t("unit")} ${getDisplayUnitLabel(currency, lang)}`}
                  onChange={() => toggleAllowedDisplayCurrency(currency)}
                />
              </label>
            </div>
          </div>
        );
      })}

      <div className="settings-row">
        <div className="settings-left">
          <span className="settings-label-group settings-label-group-stacked">
            <span className="settings-label">{t("decimalInput")}</span>
            <span className="settings-description">
              {t("decimalInputDescription")}
            </span>
          </span>
        </div>

        <div className="settings-right">
          <label className="switch">
            <input
              className="switch-input"
              type="checkbox"
              checked={decimalAmountInputEnabled}
              aria-label={t("decimalInput")}
              onChange={toggleDecimalAmountInput}
            />
          </label>
        </div>
      </div>

      <div className="settings-row">
        <div className="settings-left">
          <span className="settings-label-group settings-label-group-stacked">
            <span className="settings-label">{t("sendReadReceipts")}</span>
            <span className="settings-description">
              {t("sendReadReceiptsDescription")}
            </span>
          </span>
        </div>

        <div className="settings-right">
          <label className="switch">
            <input
              className="switch-input"
              type="checkbox"
              checked={sendReadReceiptsEnabled}
              aria-label={t("sendReadReceipts")}
              onChange={toggleSendReadReceipts}
            />
          </label>
        </div>
      </div>
    </section>
  );
}
