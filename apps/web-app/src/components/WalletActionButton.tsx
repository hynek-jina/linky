import { TopupIcon } from "./icons";

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
      <TopupIcon size={18} strokeWidth={2} />
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
