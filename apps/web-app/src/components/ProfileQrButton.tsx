import React from "react";

interface ProfileQrButtonProps {
  copyLabel: string;
  onCopy: () => void;
  qrAlt: string;
  qrSrc: string;
}

export function ProfileQrButton({
  copyLabel,
  onCopy,
  qrAlt,
  qrSrc,
}: ProfileQrButtonProps): React.ReactElement {
  return (
    <button
      type="button"
      className="profile-qr-button"
      onClick={onCopy}
      title={copyLabel}
      aria-label={copyLabel}
    >
      <img className="qr profile-qr-image" src={qrSrc} alt={qrAlt} />
      <span className="profile-qr-copyBadge" aria-hidden="true">
        ⧉
      </span>
    </button>
  );
}
