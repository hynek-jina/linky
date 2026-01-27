import React from "react";

interface NostrRelayNewPageProps {
  newRelayUrl: string;
  canSaveNewRelay: boolean;
  setNewRelayUrl: (url: string) => void;
  saveNewRelay: () => void;
  t: (key: string) => string;
}

export function NostrRelayNewPage({
  newRelayUrl,
  canSaveNewRelay,
  setNewRelayUrl,
  saveNewRelay,
  t,
}: NostrRelayNewPageProps): React.ReactElement {
  return (
    <section className="panel">
      <label htmlFor="relayUrl">{t("relayUrl")}</label>
      <input
        id="relayUrl"
        value={newRelayUrl}
        onChange={(e) => setNewRelayUrl(e.target.value)}
        placeholder="wss://..."
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
      />

      <div className="panel-header" style={{ marginTop: 14 }}>
        {canSaveNewRelay ? (
          <button onClick={saveNewRelay}>{t("saveChanges")}</button>
        ) : null}
      </div>
    </section>
  );
}
