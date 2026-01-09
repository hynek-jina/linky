import React, { useEffect, useRef } from "react";
import type { I18nKey } from "../i18n";

type TranslateFn = (key: I18nKey) => string;

interface WelcomeModalProps {
  onStart: () => void;
  onSkip: () => void;
  t: TranslateFn;
}

export const WelcomeModal: React.FC<WelcomeModalProps> = ({
  onStart,
  onSkip,
  t,
}) => {
  const startButtonRef = useRef<HTMLButtonElement>(null);

  // Focus the start button when modal opens
  useEffect(() => {
    if (startButtonRef.current) {
      startButtonRef.current.focus();
    }
  }, []);

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onSkip();
      } else if (e.key === "Enter") {
        onStart();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onStart, onSkip]);

  return (
    <div className="welcome-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="welcome-title">
      <div className="welcome-modal-sheet">
        <div className="welcome-modal-icon" aria-hidden="true">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 16v-4" />
            <path d="M12 8h.01" />
          </svg>
        </div>

        <h2 id="welcome-title" className="welcome-modal-title">
          {t("tourWelcomeTitle")}
        </h2>

        <p className="welcome-modal-desc">
          {t("tourWelcomeDesc")}
        </p>

        <div className="welcome-modal-actions">
          <button
            ref={startButtonRef}
            type="button"
            className="btn-wide"
            onClick={onStart}
          >
            {t("tourStart")}
          </button>

          <button
            type="button"
            className="btn-wide secondary"
            onClick={onSkip}
          >
            {t("tourSkip")}
          </button>
        </div>
      </div>
    </div>
  );
};
