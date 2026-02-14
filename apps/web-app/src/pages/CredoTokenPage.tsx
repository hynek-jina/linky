import { type FC, useState } from "react";
import type { ContactRowLike, CredoTokenRow } from "../app/types/appTypes";
import type { CredoTokenId } from "../evolu";
import {
  formatDurationShort,
  formatInteger,
  formatShortNpub,
} from "../utils/formatting";

interface CredoTokenPageProps {
  contacts: readonly ContactRowLike[];
  credoTokensAll: readonly CredoTokenRow[];
  displayUnit: string;
  getCredoRemainingAmount: (
    row: Pick<CredoTokenRow, "amount" | "settledAmount">,
  ) => number;
  routeId: CredoTokenId;
  t: (key: string) => string;
}

export const CredoTokenPage: FC<CredoTokenPageProps> = ({
  contacts,
  credoTokensAll,
  displayUnit,
  getCredoRemainingAmount,
  routeId,
  t,
}) => {
  // Must call all hooks before any conditional returns
  const [nowSec] = useState(() => Math.floor(Date.now() / 1000));

  const row = credoTokensAll.find(
    (tkn) => tkn.id === routeId && !tkn.isDeleted,
  );

  if (!row) {
    return (
      <section className="panel">
        <p className="muted">{t("errorPrefix")}</p>
      </section>
    );
  }

  const amount = getCredoRemainingAmount(row);
  const direction = String(row.direction ?? "");
  const isOwe = direction === "out";
  const issuer = String(row.issuer ?? "").trim();
  const recipient = String(row.recipient ?? "").trim();
  const counterpartyNpub = isOwe ? recipient : issuer;
  const counterparty = counterpartyNpub
    ? contacts.find((c) => String(c.npub ?? "").trim() === counterpartyNpub)
    : null;
  const displayName = counterparty?.name
    ? String(counterparty.name ?? "").trim()
    : counterpartyNpub
      ? formatShortNpub(counterpartyNpub)
      : null;
  const expiresAtSec = Number(row.expiresAtSec ?? 0) || 0;
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
