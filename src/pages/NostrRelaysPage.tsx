import React from "react";
import { NostrRelayRow } from "../components/NostrRelayRow";

interface NostrRelaysPageProps {
  relayUrls: string[];
  relayStatusByUrl: Record<string, "connected" | "checking" | "disconnected">;
  navigateToNostrRelay: (url: string) => void;
  t: (key: string) => string;
}

export function NostrRelaysPage({
  relayUrls,
  relayStatusByUrl,
  navigateToNostrRelay,
  t,
}: NostrRelaysPageProps): React.ReactElement {
  return (
    <section className="panel">
      {relayUrls.length === 0 ? (
        <p className="lede">{t("noContactsYet")}</p>
      ) : (
        <div>
          {relayUrls.map((url) => {
            const state = relayStatusByUrl[url] ?? "checking";
            return (
              <NostrRelayRow
                key={url}
                url={url}
                state={state}
                onNavigate={navigateToNostrRelay}
              />
            );
          })}
        </div>
      )}
    </section>
  );
}
