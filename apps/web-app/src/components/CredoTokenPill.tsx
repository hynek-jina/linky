interface CredoTokenPillProps {
  amount: number;
  ariaLabel: string;
  avatar: string | null;
  formatInteger: (n: number) => string;
  onClick: () => void;
  token: unknown;
}

export function CredoTokenPill({
  amount,
  ariaLabel,
  avatar,
  formatInteger,
  onClick,
  token,
}: CredoTokenPillProps) {
  return (
    <button
      key={String((token as unknown as { id?: unknown }).id ?? "")}
      className="pill pill-credo"
      onClick={onClick}
      style={{ cursor: "pointer" }}
      aria-label={ariaLabel}
    >
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        {avatar ? (
          <img
            src={avatar}
            alt=""
            width={14}
            height={14}
            style={{
              borderRadius: 9999,
              objectFit: "cover",
            }}
            loading="lazy"
            referrerPolicy="no-referrer"
          />
        ) : null}
        <span>{formatInteger(amount)}</span>
      </span>
    </button>
  );
}
