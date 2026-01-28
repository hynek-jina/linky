interface NostrRelayRowProps {
  onNavigate: (url: string) => void;
  state: string;
  url: string;
}

export function NostrRelayRow({ url, state, onNavigate }: NostrRelayRowProps) {
  const dotClass =
    state === "connected" ? "status-dot connected" : "status-dot disconnected";

  return (
    <button
      type="button"
      className="settings-row settings-link"
      onClick={() => onNavigate(url)}
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
