interface KeypadProps {
  ariaLabel: string;
  disabled: boolean;
  onKeyPress: (key: string) => void;
  translations: {
    clearForm: string;
    delete: string;
  };
}

export function Keypad({
  ariaLabel,
  disabled,
  onKeyPress,
  translations,
}: KeypadProps) {
  return (
    <div className="keypad" role="group" aria-label={ariaLabel}>
      {(
        ["1", "2", "3", "4", "5", "6", "7", "8", "9", "C", "0", "⌫"] as const
      ).map((key) => (
        <button
          key={key}
          type="button"
          className={key === "C" || key === "⌫" ? "secondary" : "ghost"}
          onClick={() => onKeyPress(key)}
          disabled={disabled}
          aria-label={
            key === "C"
              ? translations.clearForm
              : key === "⌫"
                ? translations.delete
                : key
          }
        >
          {key}
        </button>
      ))}
    </div>
  );
}
