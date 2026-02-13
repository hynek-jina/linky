import { useNavigation } from "../hooks/useRouting";

interface NostrRelayRowProps {
  state: string;
  url: string;
}

export function NostrRelayRow({ state, url }: NostrRelayRowProps) {
  const navigateTo = useNavigation();
  const dotClass =
    state === "connected" ? "status-dot connected" : "status-dot disconnected";

  return (
    <button
      type="button"
      className="settings-row settings-link"
      onClick={() => navigateTo({ route: "nostrRelay", id: url })}
    >
      <div className="settings-left">
        <span className="relay-url">{url}</span>
      </div>
      <div className="settings-right">
        <span className={dotClass} aria-label={state} title={state} />
        <span className="settings-chevron" aria-hidden="true">
          &gt;
        </span>
      </div>
    </button>
  );
}
