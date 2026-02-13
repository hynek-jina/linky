interface WalletActionButtonProps {
  dataGuide?: string;
  disabled?: boolean;
  icon: "topup" | "send";
  label: string;
  onClick: () => void;
}

export function WalletActionButton({
  dataGuide,
  disabled = false,
  icon,
  label,
  onClick,
}: WalletActionButtonProps) {
  const iconContent =
    icon === "topup" ? (
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M12 3v10"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path
          d="M8 9l4 4 4-4"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M4 14h16v6H4v-6Z"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinejoin="round"
        />
      </svg>
    ) : (
      <span className="contacts-qr-scanIcon" />
    );

  return (
    <button
      className="contacts-qr-btn secondary"
      onClick={onClick}
      disabled={disabled}
      {...(dataGuide ? { "data-guide": dataGuide } : {})}
    >
      <span className="contacts-qr-btn-icon" aria-hidden="true">
        {iconContent}
      </span>
      <span className="contacts-qr-btn-label">{label}</span>
    </button>
  );
}
