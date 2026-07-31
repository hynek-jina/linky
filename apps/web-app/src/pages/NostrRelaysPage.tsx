import React from "react";
import { useAppShellCore } from "../app/context/AppShellContexts";
import { useRelaySettingsContext } from "../app/context/SystemSettingsContexts";
import { NostrRelayRow } from "../components/NostrRelayRow";

export function NostrRelaysPage(): React.ReactElement {
  const { relayUrls, relayStatusByUrl } = useRelaySettingsContext();
  const { t } = useAppShellCore();
  return (
    <section className="panel">
      {relayUrls.length === 0 ? (
        <p className="lede">{t("noContactsYet")}</p>
      ) : (
        <div>
          {relayUrls.map((url) => {
            const state = relayStatusByUrl[url] ?? "checking";
            return <NostrRelayRow key={url} url={url} state={state} />;
          })}
        </div>
      )}
    </section>
  );
}
