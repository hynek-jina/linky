interface PaymentEvent {
  amount?: unknown;
  createdAtSec?: unknown;
  direction?: unknown;
  error?: unknown;
  fee?: unknown;
  id?: unknown;
  mint?: unknown;
  status?: unknown;
}

interface PaymentHistoryRowProps {
  displayUnit: string;
  event: PaymentEvent;
  formatInteger: (n: number) => string;
  locale: string;
  translations: {
    paymentsHistoryFailed: string;
    paymentsHistoryIncoming: string;
    paymentsHistoryOutgoing: string;
    paymentsHistoryFee: string;
  };
}

export function PaymentHistoryRow({
  displayUnit,
  event,
  formatInteger,
  locale,
  translations,
}: PaymentHistoryRowProps) {
  const createdAtSec =
    Number(
      (event as unknown as { createdAtSec?: unknown }).createdAtSec ?? 0,
    ) || 0;
  const direction = String(
    (event as unknown as { direction?: unknown }).direction ?? "",
  ).trim();
  const status = String(
    (event as unknown as { status?: unknown }).status ?? "",
  ).trim();
  const amount =
    Number((event as unknown as { amount?: unknown }).amount ?? 0) || 0;
  const fee = Number((event as unknown as { fee?: unknown }).fee ?? 0) || 0;
  const mintText = String(
    (event as unknown as { mint?: unknown }).mint ?? "",
  ).trim();
  const errorText = String(
    (event as unknown as { error?: unknown }).error ?? "",
  ).trim();

  const timeLabel = createdAtSec
    ? new Intl.DateTimeFormat(locale, {
        dateStyle: "short",
        timeStyle: "short",
      }).format(new Date(createdAtSec * 1000))
    : "";

  const mintDisplay = (() => {
    if (!mintText) return null;
    try {
      return new URL(mintText).host;
    } catch {
      return mintText;
    }
  })();

  const isError = status === "error";
  const directionIcon = isError ? "⚠️" : direction === "in" ? "↘︎" : "↗︎";
  const directionLabel = isError
    ? translations.paymentsHistoryFailed
    : direction === "in"
      ? translations.paymentsHistoryIncoming
      : translations.paymentsHistoryOutgoing;

  return (
    <div
      className="settings-row"
      style={{
        alignItems: "flex-start",
        display: "grid",
        gridTemplateColumns: "20px 1fr auto",
        columnGap: 10,
      }}
    >
      <span
        role="img"
        aria-label={directionLabel}
        style={{
          gridColumn: "1",
          fontSize: 14,
          lineHeight: "18px",
          marginTop: 2,
        }}
      >
        {directionIcon}
      </span>
      <div className="settings-left" style={{ minWidth: 0, gridColumn: "2" }}>
        <div
          className="muted"
          style={{
            marginTop: 1,
            lineHeight: 1.25,
            fontSize: 11,
          }}
        >
          {timeLabel}
          {mintDisplay ? ` · ${mintDisplay}` : ""}
        </div>
        {isError && errorText ? (
          <div
            className="muted"
            style={{
              marginTop: 4,
              lineHeight: 1.25,
              fontSize: 11,
            }}
          >
            {errorText}
          </div>
        ) : null}
      </div>

      <div
        className="settings-right"
        style={{
          textAlign: "right",
          minWidth: 80,
          gridColumn: "3",
        }}
      >
        <div
          style={{
            fontWeight: 800,
            color: "#e2e8f0",
            fontSize: 13,
            lineHeight: 1.2,
          }}
        >
          {amount > 0 ? `${formatInteger(amount)} ${displayUnit}` : "—"}
        </div>
        <div
          className="muted"
          style={{
            marginTop: 2,
            fontSize: 11,
            lineHeight: 1.2,
          }}
        >
          {fee > 0
            ? `${translations.paymentsHistoryFee}: ${formatInteger(fee)} ${displayUnit}`
            : ""}
        </div>
      </div>
    </div>
  );
}
