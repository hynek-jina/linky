interface KeypadProps {
  ariaLabel: string;
  decimalKeyEnabled?: boolean;
  disabled: boolean;
  onKeyPress: (key: string) => void;
  translations: {
    clearForm: string;
    decimalPoint: string;
    delete: string;
  };
}

export function Keypad({
  ariaLabel,
  decimalKeyEnabled = false,
  disabled,
  onKeyPress,
  translations,
}: KeypadProps) {
  const keys = [
    "1",
    "2",
    "3",
    "4",
    "5",
    "6",
    "7",
    "8",
    "9",
    decimalKeyEnabled ? "." : "C",
    "0",
    "⌫",
  ];

  return (
    <div className="keypad" role="group" aria-label={ariaLabel}>
      {keys.map((key) => (
        <button
          key={key}
          type="button"
          className={key === "C" || key === "⌫" ? "secondary" : "ghost"}
          onClick={() => onKeyPress(key)}
          disabled={disabled}
          aria-label={
            key === "C"
              ? translations.clearForm
              : key === "."
                ? translations.decimalPoint
                : key === "⌫"
                  ? translations.delete
                  : key
          }
        >
          {key === "." ? translations.decimalPoint : key}
        </button>
      ))}
    </div>
  );
}
