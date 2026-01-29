interface MintIcon {
  failed: boolean;
  host: string | null;
  url: string | null;
}

interface MintButtonProps {
  fallbackLetter: string;
  getMintIconUrl: (mint: unknown) => MintIcon;
  isSelected: boolean;
  label: string;
  mint: string;
  onClick: () => void;
}

export function MintButton({
  fallbackLetter,
  getMintIconUrl,
  isSelected,
  label,
  mint,
  onClick,
}: MintButtonProps) {
  const icon = getMintIconUrl(mint);

  return (
    <button
      key={mint}
      type="button"
      className="ghost"
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        border: isSelected ? "1px solid #22c55e" : undefined,
        boxShadow: isSelected ? "0 0 0 1px rgba(34,197,94,0.35)" : undefined,
      }}
    >
      {icon.url ? (
        <img
          src={icon.url}
          alt=""
          width={14}
          height={14}
          style={{
            borderRadius: 9999,
            objectFit: "cover",
          }}
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = "none";
          }}
        />
      ) : (
        <span
          aria-hidden="true"
          style={{
            width: 14,
            height: 14,
            borderRadius: 9999,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 9,
            background: "rgba(148,163,184,0.25)",
            color: "#e2e8f0",
          }}
        >
          {fallbackLetter}
        </span>
      )}
      {label}
    </button>
  );
}
