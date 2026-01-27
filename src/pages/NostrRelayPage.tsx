import React from "react";

interface NostrRelayPageProps {
  selectedRelayUrl: string | null;
  pendingRelayDeleteUrl: string | null;
  requestDeleteSelectedRelay: () => void;
  t: (key: string) => string;
}

export function NostrRelayPage({
  selectedRelayUrl,
  pendingRelayDeleteUrl,
  requestDeleteSelectedRelay,
  t,
}: NostrRelayPageProps): React.ReactElement {
  return (
    <section className="panel">
      {selectedRelayUrl ? (
        <>
          <div className="settings-row">
            <div className="settings-left">
              <span className="relay-url">{selectedRelayUrl}</span>
            </div>
          </div>

          <div className="settings-row">
            <button
              className={
                pendingRelayDeleteUrl === selectedRelayUrl
                  ? "btn-wide danger"
                  : "btn-wide"
              }
              onClick={requestDeleteSelectedRelay}
            >
              {t("delete")}
            </button>
          </div>
        </>
      ) : (
        <p className="lede">{t("errorPrefix")}</p>
      )}
    </section>
  );
}
