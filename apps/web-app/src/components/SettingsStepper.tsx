import { Minus, Plus } from "lucide-react";
import React from "react";

interface SettingsStepperProps {
  ariaLabel: string;
  decreaseLabel: string;
  increaseLabel: string;
  max: number;
  min: number;
  onChange: (value: number) => void;
  step: number;
  value: number;
  valueText?: string;
}

export const SettingsStepper: React.FC<SettingsStepperProps> = ({
  ariaLabel,
  decreaseLabel,
  increaseLabel,
  max,
  min,
  onChange,
  step,
  value,
  valueText,
}) => (
  <div className="settings-stepper" aria-label={ariaLabel}>
    <button
      type="button"
      className="settings-stepper-button"
      disabled={value <= min}
      onClick={() => onChange(Math.max(min, value - step))}
      aria-label={decreaseLabel}
    >
      <Minus size={16} />
    </button>
    <span className="settings-stepper-value">{valueText ?? String(value)}</span>
    <button
      type="button"
      className="settings-stepper-button"
      disabled={value >= max}
      onClick={() => onChange(Math.min(max, value + step))}
      aria-label={increaseLabel}
    >
      <Plus size={16} />
    </button>
  </div>
);
