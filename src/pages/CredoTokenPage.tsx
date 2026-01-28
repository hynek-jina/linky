import type { FC } from "react";
import type { CredoTokenId } from "../evolu";

interface CredoTokenRow {
  id: CredoTokenId;
  direction?: string | null;
  issuer?: string | null;
  recipient?: string | null;
  expiresAtSec?: number | null;
  isDeleted?: boolean;
}

interface Contact {
  npub?: string | null;
  name?: string | null;
}

interface CredoTokenPageProps {
  credoTokensAll: readonly any[];
  routeId: CredoTokenId;
  contacts: readonly Contact[];
  displayUnit: string;
  getCredoRemainingAmount: (row: any) => number;
  formatShortNpub: (npub: string) => string;
  formatInteger: (val: number) => string;
  formatDurationShort: (sec: number) => string;
  t: (key: string) => string;
}

const CredoTokenPage: FC<CredoTokenPageProps> = ({
  credoTokensAll,
  routeId,
  contacts,
  displayUnit,
  getCredoRemainingAmount,
  formatShortNpub,
  formatInteger,
  formatDurationShort,
  t,
}) => {
  const row = credoTokensAll.find(
    (tkn) =>
      String(tkn?.id ?? "") === String(routeId as unknown as string) &&
      !tkn?.isDeleted,
  );

  if (!row) {
    return (
      <section className="panel">
        <p className="muted">{t("errorPrefix")}</p>
      </section>
    );
  }

  const amount = getCredoRemainingAmount(row);
  const direction = String((row as CredoTokenRow)?.direction ?? "");
  const isOwe = direction === "out";
  const issuer = String((row as CredoTokenRow)?.issuer ?? "").trim();
  const recipient = String((row as CredoTokenRow)?.recipient ?? "").trim();
  const counterpartyNpub = isOwe ? recipient : issuer;
  const counterparty = counterpartyNpub
    ? contacts.find((c) => String(c.npub ?? "").trim() === counterpartyNpub)
    : null;
  const displayName = counterparty?.name
    ? String(counterparty.name ?? "").trim()
    : counterpartyNpub
      ? formatShortNpub(counterpartyNpub)
      : null;
  const expiresAtSec = Number((row as CredoTokenRow)?.expiresAtSec ?? 0) || 0;
  const nowSec = Math.floor(Date.now() / 1000);
  const remainingSec = expiresAtSec - nowSec;
  const expiryLabel =
    remainingSec <= 0
      ? t("credoExpired")
      : t("credoExpiresIn").replace(
          "{time}",
          formatDurationShort(remainingSec),
        );

  return (
    <section className="panel">
      <p className="muted" style={{ margin: "0 0 10px" }}>
        {isOwe ? t("credoOwe") : t("credoPromisedToMe")}
      </p>
      <div className="settings-row">
        <div className="settings-left">
          <span className="settings-label">{displayName ?? t("appTitle")}</span>
        </div>
        <div className="settings-right">
          <span className="badge-box">
            {(isOwe ? "-" : "") + formatInteger(amount)} {displayUnit}
          </span>
        </div>
      </div>
      <p className="muted">{expiryLabel}</p>
    </section>
  );
};

export default CredoTokenPage;
