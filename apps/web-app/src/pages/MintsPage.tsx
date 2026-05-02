import type { MintUrlInput } from "../app/types/appTypes";
import { MintButton } from "../components/MintButton";
import { isTestMintUrl } from "../utils/mint";

interface MintIcon {
  failed: boolean;
  host: string | null;
  origin: string | null;
  url: string | null;
}

interface MintsPageProps {
  MAIN_MINT_URL: string;
  PRESET_MINTS: readonly string[];
  applyDefaultMintSelection: (mint: string) => Promise<void>;
  cashuIsBusy: boolean;
  cashuMeltToMainMintButtonLabel: string | null;
  defaultMintUrl: string | null;
  defaultMintUrlDraft: string;
  getMintIconUrl: (mint: MintUrlInput) => MintIcon;
  meltLargestForeignMintToMainMint: () => Promise<void>;
  normalizeMintUrl: (url: string) => string;
  setDefaultMintUrlDraft: (value: string) => void;
  t: (key: string) => string;
}

export function MintsPage({
  MAIN_MINT_URL,
  PRESET_MINTS,
  applyDefaultMintSelection,
  cashuIsBusy,
  cashuMeltToMainMintButtonLabel,
  defaultMintUrl,
  defaultMintUrlDraft,
  getMintIconUrl,
  meltLargestForeignMintToMainMint,
  normalizeMintUrl,
  setDefaultMintUrlDraft,
  t,
}: MintsPageProps) {
  const selectedMint =
    normalizeMintUrl(defaultMintUrl ?? MAIN_MINT_URL) || MAIN_MINT_URL;
  const stripped = (value: string) => value.replace(/^https?:\/\//i, "");
  const draftValue = String(defaultMintUrlDraft ?? "").trim();
  const cleanedDraft = normalizeMintUrl(draftValue);
  const isDraftValid = (() => {
    if (!cleanedDraft) return false;
    try {
      new URL(cleanedDraft);
      return true;
    } catch {
      return false;
    }
  })();
  const canSave =
    Boolean(draftValue) && isDraftValid && cleanedDraft !== selectedMint;

  const buttonMints = (() => {
    const set = new Set<string>(PRESET_MINTS);
    if (selectedMint) set.add(selectedMint);
    return Array.from(set.values());
  })();
  const standardMints = buttonMints.filter((mint) => !isTestMintUrl(mint));
  const testMints = buttonMints.filter((mint) => isTestMintUrl(mint));

  const renderMintButton = (mint: string) => {
    const isSelected = normalizeMintUrl(mint) === selectedMint;
    const label = stripped(mint);
    const fallbackLetter = (label.match(/[a-z]/i)?.[0] ?? "?").toUpperCase();
    const isTestMint = isTestMintUrl(mint);

    return (
      <MintButton
        key={mint}
        mint={mint}
        getMintIconUrl={getMintIconUrl}
        isSelected={isSelected}
        isTestMint={isTestMint}
        label={label}
        badgeLabel={isTestMint ? t("testMintBadge") : ""}
        fallbackLetter={fallbackLetter}
        disabled={cashuIsBusy}
        onClick={() => void applyDefaultMintSelection(mint)}
      />
    );
  };

  return (
    <section className="panel">
      <div className="settings-row" style={{ marginBottom: 6 }}>
        <div className="settings-left">
          <label className="muted">{t("selectedMint")}</label>
        </div>
      </div>

      <div className="settings-row" style={{ marginBottom: 10 }}>
        <div className="mint-choice-list">
          <div className="mint-choice-group">
            {standardMints.map((mint) => renderMintButton(mint))}
          </div>
          {testMints.length > 0 ? (
            <div className="mint-choice-test-group">
              <div className="mint-choice-group">
                {testMints.map((mint) => renderMintButton(mint))}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <label htmlFor="defaultMintUrl">{t("setCustomMint")}</label>
      <input
        id="defaultMintUrl"
        value={defaultMintUrlDraft}
        onChange={(e) => setDefaultMintUrlDraft(e.target.value)}
        placeholder="https://…"
        disabled={cashuIsBusy}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
      />

      <div className="panel-header" style={{ marginTop: 14 }}>
        {canSave ? (
          <button
            type="button"
            disabled={cashuIsBusy}
            onClick={async () => {
              await applyDefaultMintSelection(defaultMintUrlDraft);
            }}
          >
            {t("saveChanges")}
          </button>
        ) : null}
      </div>

      {cashuMeltToMainMintButtonLabel ? (
        <div className="panel-header" style={{ marginTop: 12 }}>
          <button
            type="button"
            className="secondary"
            disabled={cashuIsBusy}
            onClick={() => void meltLargestForeignMintToMainMint()}
          >
            {cashuMeltToMainMintButtonLabel}
          </button>
        </div>
      ) : null}
    </section>
  );
}
