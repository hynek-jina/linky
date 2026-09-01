import React from "react";

interface SettingsLinkRowProps {
  className?: string;
  dataGuide?: string;
  disabled?: boolean;
  icon: React.ReactNode;
  label: React.ReactNode;
  onClick: () => void;
  tail?: React.ReactNode;
}

export function SettingsLinkRow({
  className = "",
  dataGuide,
  disabled,
  icon,
  label,
  onClick,
  tail,
}: SettingsLinkRowProps) {
  return (
    <button
      type="button"
      className={`settings-row settings-link${className ? ` ${className}` : ""}`}
      onClick={onClick}
      disabled={disabled}
      data-guide={dataGuide}
    >
      <span className="settings-left">
        <span className="settings-icon" aria-hidden="true">
          {icon}
        </span>
        <span className="settings-label">{label}</span>
      </span>
      <span className="settings-right">
        {tail}
        <span className="settings-chevron" aria-hidden="true">
          &gt;
        </span>
      </span>
    </button>
  );
}

interface SettingsToggleRowProps {
  checked: boolean;
  disabled?: boolean;
  icon: React.ReactNode;
  label: string;
  onChange: (checked: boolean) => void;
}

export function SettingsToggleRow({
  checked,
  disabled,
  icon,
  label,
  onChange,
}: SettingsToggleRowProps) {
  return (
    <div className="settings-row">
      <div className="settings-left">
        <span className="settings-icon" aria-hidden="true">
          {icon}
        </span>
        <span className="settings-label">{label}</span>
      </div>
      <label className="switch">
        <input
          className="switch-input"
          type="checkbox"
          aria-label={label}
          checked={checked}
          disabled={disabled}
          onChange={(event) => onChange(event.target.checked)}
        />
      </label>
    </div>
  );
}
