import React from "react";

interface SaveContactPromptModalProps {
  amountSat: number;
  displayUnit: string;
  formatInteger: (value: number) => string;
  lnAddress: string;
  navigateToNewContact: () => void;
  onClose: () => void;
  setContactNewPrefill: (prefill: {
    lnAddress: string;
    npub: string | null;
    suggestedName: string | null;
  }) => void;
  t: (key: string) => string;
}

export function SaveContactPromptModal({
  amountSat,
  displayUnit,
  formatInteger,
  lnAddress,
  navigateToNewContact,
  onClose,
  setContactNewPrefill,
  t,
}: SaveContactPromptModalProps): React.ReactElement {
  const handleSave = () => {
    const ln = String(lnAddress ?? "").trim();

    const npub = (() => {
      const lower = ln.toLowerCase();
      if (!lower.endsWith("@npub.cash")) return null;
      const left = ln.slice(0, -"@npub.cash".length).trim();
      return left || null;
    })();

    onClose();
    setContactNewPrefill({
      lnAddress: ln,
      npub,
      suggestedName: null,
    });
    navigateToNewContact();
  };

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={t("saveContactPromptTitle")}
    >
      <div className="modal-sheet">
        <div className="modal-title">{t("saveContactPromptTitle")}</div>
        <div className="modal-body">
          {t("saveContactPromptBody")
            .replace("{amount}", formatInteger(amountSat))
            .replace("{unit}", displayUnit)
            .replace("{lnAddress}", lnAddress)}
        </div>
        <div className="modal-actions">
          <button className="btn-wide" onClick={handleSave}>
            {t("saveContactPromptSave")}
          </button>
          <button className="btn-wide secondary" onClick={onClose}>
            {t("saveContactPromptSkip")}
          </button>
        </div>
      </div>
    </div>
  );
}
