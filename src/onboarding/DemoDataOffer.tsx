import React, { useEffect, useRef } from "react";
import type { I18nKey } from "../i18n";

type TranslateFn = (key: I18nKey) => string;

interface DemoDataOfferProps {
  onAddDemo: () => void;
  onSkip: () => void;
  t: TranslateFn;
}

export const DemoDataOffer: React.FC<DemoDataOfferProps> = ({
  onAddDemo,
  onSkip,
  t,
}) => {
  const addButtonRef = useRef<HTMLButtonElement>(null);

  // Focus the add button when modal opens
  useEffect(() => {
    if (addButtonRef.current) {
      addButtonRef.current.focus();
    }
  }, []);

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onSkip();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onSkip]);

  return (
    <div className="welcome-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="demo-title">
      <div className="welcome-modal-sheet">
        <div className="welcome-modal-icon" aria-hidden="true">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <line x1="19" y1="8" x2="19" y2="14" />
            <line x1="22" y1="11" x2="16" y2="11" />
          </svg>
        </div>

        <h2 id="demo-title" className="welcome-modal-title">
          {t("tourDemoTitle")}
        </h2>

        <p className="welcome-modal-desc">
          {t("tourDemoDesc")}
        </p>

        <div className="welcome-modal-actions">
          <button
            ref={addButtonRef}
            type="button"
            className="btn-wide"
            onClick={onAddDemo}
          >
            {t("tourDemoAdd")}
          </button>

          <button
            type="button"
            className="btn-wide secondary"
            onClick={onSkip}
          >
            {t("tourDemoNo")}
          </button>
        </div>
      </div>
    </div>
  );
};
