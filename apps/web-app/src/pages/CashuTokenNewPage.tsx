import type { FC, RefObject } from "react";
interface CashuTokenNewPageProps {
  cashuDraft: string;
  cashuDraftRef: RefObject<HTMLTextAreaElement | null>;
  cashuIsBusy: boolean;
  saveCashuFromText: (
    text: string,
    opts: { navigateToTokens?: boolean; navigateToWallet?: boolean },
  ) => Promise<void>;
  setCashuDraft: (value: string) => void;
  t: (key: string) => string;
}

export const CashuTokenNewPage: FC<CashuTokenNewPageProps> = ({
  cashuDraft,
  cashuDraftRef,
  cashuIsBusy,
  saveCashuFromText,
  setCashuDraft,
  t,
}) => {
  return (
    <section className="panel">
      <label>{t("cashuToken")}</label>
      <textarea
        ref={cashuDraftRef}
        value={cashuDraft}
        onChange={(e) => setCashuDraft(e.target.value)}
        onPaste={(e) => {
          const text = e.clipboardData?.getData("text") ?? "";
          const tokenRaw = String(text).trim();
          if (!tokenRaw) return;
          e.preventDefault();
          void saveCashuFromText(tokenRaw, { navigateToTokens: true });
        }}
        placeholder={t("cashuPasteManualHint")}
      />

      <div className="settings-row">
        <button
          className="btn-wide"
          onClick={() =>
            void saveCashuFromText(cashuDraft, { navigateToTokens: true })
          }
          disabled={!cashuDraft.trim() || cashuIsBusy}
        >
          {t("cashuSave")}
        </button>
      </div>
    </section>
  );
};
