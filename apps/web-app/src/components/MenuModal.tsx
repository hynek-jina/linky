import React from "react";
import { useNavigation } from "../hooks/useRouting";
import type { Lang } from "../i18n";

interface MenuModalProps {
  closeMenu: () => void;
  lang: Lang;
  openFeedbackContact: () => void;
  setLang: (lang: Lang) => void;
  setUseBitcoinSymbol: (value: boolean) => void;
  t: (key: string) => string;
  useBitcoinSymbol: boolean;
}

export function MenuModal({
  closeMenu,
  lang,
  openFeedbackContact,
  setLang,
  setUseBitcoinSymbol,
  t,
  useBitcoinSymbol,
}: MenuModalProps): React.ReactElement {
  const navigateTo = useNavigation();
  return (
    <div
      className="menu-modal-overlay"
      role="dialog"
      aria-modal="false"
      aria-label={t("menu")}
      onClick={closeMenu}
    >
      <div className="menu-modal-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="settings-row">
          <div className="settings-left">
            <span className="settings-icon" aria-hidden="true">
              🌐
            </span>
            <span className="settings-label">{t("language")}</span>
          </div>
          <div className="settings-right">
            <select
              className="select"
              value={lang}
              onChange={(e) => setLang(e.target.value as Lang)}
              aria-label={t("language")}
            >
              <option value="cs">{t("czech")}</option>
              <option value="en">{t("english")}</option>
            </select>
          </div>
        </div>

        <div className="settings-row">
          <div className="settings-left">
            <span className="settings-icon" aria-hidden="true">
              ₿
            </span>
            <span className="settings-label">{t("unit")}</span>
          </div>
          <div className="settings-right">
            <label className="switch">
              <input
                className="switch-input"
                type="checkbox"
                aria-label={t("unitUseBitcoin")}
                checked={useBitcoinSymbol}
                onChange={(e) => setUseBitcoinSymbol(e.target.checked)}
              />
            </label>
          </div>
        </div>

        <button
          type="button"
          className="settings-row settings-link"
          onClick={() => {
            closeMenu();
            navigateTo({ route: "advanced" });
          }}
          aria-label={t("advanced")}
          title={t("advanced")}
          data-guide="open-advanced"
        >
          <div className="settings-left">
            <span className="settings-icon" aria-hidden="true">
              ⚙️
            </span>
            <span className="settings-label">{t("advanced")}</span>
          </div>
          <div className="settings-right">
            <span className="settings-chevron" aria-hidden="true">
              &gt;
            </span>
          </div>
        </button>

        <button
          type="button"
          className="settings-row settings-link"
          onClick={() => {
            closeMenu();
            openFeedbackContact();
          }}
          aria-label={t("feedback")}
          title={t("feedback")}
        >
          <div className="settings-left">
            <span className="settings-icon" aria-hidden="true">
              💬
            </span>
            <span className="settings-label">{t("feedback")}</span>
          </div>
          <div className="settings-right">
            <span className="settings-chevron" aria-hidden="true">
              &gt;
            </span>
          </div>
        </button>
      </div>
    </div>
  );
}
