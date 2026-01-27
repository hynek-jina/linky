import { MintButton } from "../components/MintButton";

interface MintIcon {
  url: string | null;
  host: string | null;
  failed: boolean;
}

interface MintsPageProps {
  defaultMintUrl: string | null;
  defaultMintUrlDraft: string;
  setDefaultMintUrlDraft: (value: string) => void;
  normalizeMintUrl: (url: string) => string;
  MAIN_MINT_URL: string;
  PRESET_MINTS: readonly string[];
  getMintIconUrl: (mint: unknown) => MintIcon;
  applyDefaultMintSelection: (mint: string) => Promise<void>;
  hasMintOverrideRef: React.RefObject<boolean>;
  t: (key: string) => string;
}

export function MintsPage({
  defaultMintUrl,
  defaultMintUrlDraft,
  setDefaultMintUrlDraft,
  normalizeMintUrl,
  MAIN_MINT_URL,
  PRESET_MINTS,
  getMintIconUrl,
  applyDefaultMintSelection,
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

  return (
    <section className="panel">
      <div className="settings-row" style={{ marginBottom: 6 }}>
        <div className="settings-left">
          <label className="muted">{t("selectedMint")}</label>
        </div>
      </div>

      <div className="settings-row" style={{ marginBottom: 10 }}>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 8,
          }}
        >
          {buttonMints.map((mint) => {
            const isSelected = normalizeMintUrl(mint) === selectedMint;
            const label = stripped(mint);
            const fallbackLetter = (
              label.match(/[a-z]/i)?.[0] ?? "?"
            ).toUpperCase();
            return (
              <MintButton
                key={mint}
                mint={mint}
                getMintIconUrl={getMintIconUrl}
                isSelected={isSelected}
                label={label}
                fallbackLetter={fallbackLetter}
                onClick={() => void applyDefaultMintSelection(mint)}
              />
            );
          })}
        </div>
      </div>

      <label htmlFor="defaultMintUrl">{t("setCustomMint")}</label>
      <input
        id="defaultMintUrl"
        value={defaultMintUrlDraft}
        onChange={(e) => setDefaultMintUrlDraft(e.target.value)}
        placeholder="https://…"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
      />

      <div className="panel-header" style={{ marginTop: 14 }}>
        {canSave ? (
          <button
            type="button"
            onClick={async () => {
              await applyDefaultMintSelection(defaultMintUrlDraft);
            }}
          >
            {t("saveChanges")}
          </button>
        ) : null}
      </div>
    </section>
  );
}
