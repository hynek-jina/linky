import React from "react";
import { useNavigation } from "../hooks/useRouting";
import type { Lang } from "../i18n";
import {
  getDisplayUnitLabel,
  parseDisplayCurrency,
  type DisplayCurrency,
} from "../utils/displayAmounts";

interface MenuModalProps {
  closeMenu: () => void;
  displayCurrency: DisplayCurrency;
  lang: Lang;
  openFeedbackContact: () => void;
  setDisplayCurrency: (currency: DisplayCurrency) => void;
  setLang: (lang: Lang) => void;
  t: (key: string) => string;
}

export function MenuModal({
  closeMenu,
  displayCurrency,
  lang,
  openFeedbackContact,
  setDisplayCurrency,
  setLang,
  t,
}: MenuModalProps): React.ReactElement {
  const navigateTo = useNavigation();

  const handleLangChange = (value: string) => {
    setLang(value === "cs" ? "cs" : "en");
  };

  const handleDisplayCurrencyChange = (value: string) => {
    setDisplayCurrency(parseDisplayCurrency(value) ?? "sat");
  };

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
              onChange={(e) => handleLangChange(e.target.value)}
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
            <select
              className="select"
              value={displayCurrency}
              onChange={(e) => handleDisplayCurrencyChange(e.target.value)}
              aria-label={t("unit")}
            >
              <option value="sat">sat</option>
              <option value="btc">₿</option>
              <option value="czk">{getDisplayUnitLabel("czk", lang)}</option>
              <option value="usd">USD</option>
            </select>
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
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M7 18.5H6C4.343 18.5 3 17.157 3 15.5V7.5C3 5.843 4.343 4.5 6 4.5H18C19.657 4.5 21 5.843 21 7.5V15.5C21 17.157 19.657 18.5 18 18.5H12L8 21V18.5H7Z"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
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
