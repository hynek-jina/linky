import React from "react";
import { Bitcoin, Languages, Settings } from "lucide-react";
import { useNavigation } from "../hooks/useRouting";
import { FeedbackIcon } from "./icons";

interface MenuModalProps {
  closeMenu: () => void;
  openFeedbackContact: () => void;
  t: (key: string) => string;
}

export function MenuModal({
  closeMenu,
  openFeedbackContact,
  t,
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
        <button
          type="button"
          className="settings-row settings-link"
          onClick={() => {
            closeMenu();
            navigateTo({ route: "settingsLanguage" });
          }}
          aria-label={t("language")}
          title={t("language")}
        >
          <div className="settings-left">
            <span className="settings-icon" aria-hidden="true">
              <Languages size={18} />
            </span>
            <span className="settings-label">{t("language")}</span>
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
            navigateTo({ route: "settingsUnits" });
          }}
          aria-label={t("unit")}
          title={t("unit")}
        >
          <div className="settings-left">
            <span className="settings-icon" aria-hidden="true">
              <Bitcoin size={18} />
            </span>
            <span className="settings-label">{t("unit")}</span>
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
            navigateTo({ route: "advanced" });
          }}
          aria-label={t("advanced")}
          title={t("advanced")}
          data-guide="open-advanced"
        >
          <div className="settings-left">
            <span className="settings-icon" aria-hidden="true">
              <Settings size={18} />
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
              <FeedbackIcon size={18} />
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
