import React from "react";
import { flushSync } from "react-dom";
import { useAppShellCore } from "../app/context/AppShellContexts";
import { useNavigation } from "../hooks/useRouting";

interface SaveContactPromptModalProps {
  amountSat: number;
  lnAddress: string;
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
  lnAddress,
  onClose,
  setContactNewPrefill,
  t,
}: SaveContactPromptModalProps): React.ReactElement {
  const { formatDisplayedAmountParts } = useAppShellCore();
  const navigateTo = useNavigation();
  const displayAmount = formatDisplayedAmountParts(amountSat);

  const handleSave = () => {
    const ln = String(lnAddress ?? "").trim();

    const npub = (() => {
      const lower = ln.toLowerCase();
      if (!lower.endsWith("@npub.cash")) return null;
      const left = ln.slice(0, -"@npub.cash".length).trim();
      return left || null;
    })();

    flushSync(() => {
      setContactNewPrefill({
        lnAddress: ln,
        npub,
        suggestedName: null,
      });
    });
    navigateTo({ route: "contactNew" });
    onClose();
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
            .replace(
              "{amount}",
              `${displayAmount.approxPrefix}${displayAmount.amountText}`,
            )
            .replace("{unit}", displayAmount.unitLabel)
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
