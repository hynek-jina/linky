import { PaymentHistoryRow } from "../components/PaymentHistoryRow";

interface PaymentEvent {
  id?: unknown;
  createdAtSec?: unknown;
  direction?: unknown;
  status?: unknown;
  amount?: unknown;
  fee?: unknown;
  mint?: unknown;
  error?: unknown;
}

interface PaymentsHistoryPageProps {
  paymentEvents: unknown[];
  lang: string;
  formatInteger: (value: number) => string;
  displayUnit: string;
  t: (key: string) => string;
}

export function PaymentsHistoryPage({
  paymentEvents,
  lang,
  formatInteger,
  displayUnit,
  t,
}: PaymentsHistoryPageProps) {
  return (
    <section className="panel">
      {paymentEvents.length === 0 ? (
        <p className="muted">{t("paymentsHistoryEmpty")}</p>
      ) : (
        <div>
          {paymentEvents.map((ev) => {
            const eventId = String(
              (ev as unknown as { id?: unknown }).id ?? "",
            );
            const createdAtSec =
              Number(
                (ev as unknown as { createdAtSec?: unknown }).createdAtSec ?? 0,
              ) || 0;
            const timeLabel = createdAtSec
              ? new Intl.DateTimeFormat(lang === "cs" ? "cs-CZ" : "en-US", {
                  dateStyle: "short",
                  timeStyle: "short",
                }).format(new Date(createdAtSec * 1000))
              : "";

            return (
              <div key={eventId || timeLabel}>
                <PaymentHistoryRow
                  event={ev as PaymentEvent}
                  locale={lang === "cs" ? "cs-CZ" : "en-US"}
                  formatInteger={formatInteger}
                  displayUnit={displayUnit}
                  translations={{
                    paymentsHistoryFailed: t("paymentsHistoryFailed"),
                    paymentsHistoryIncoming: t("paymentsHistoryIncoming"),
                    paymentsHistoryOutgoing: t("paymentsHistoryOutgoing"),
                    paymentsHistoryFee: t("paymentsHistoryFee"),
                  }}
                />
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
