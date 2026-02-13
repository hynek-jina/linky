import { type FC, useState } from "react";
import type { CredoTokenId } from "../evolu";
import {
  formatDurationShort,
  formatInteger,
  formatShortNpub,
} from "../utils/formatting";

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
  contacts: readonly Contact[];
  credoTokensAll: readonly Record<string, unknown>[];
  displayUnit: string;
  getCredoRemainingAmount: (row: Record<string, unknown>) => number;
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
  const typedRow = row as unknown as CredoTokenRow;
  const direction = String(typedRow?.direction ?? "");
  const isOwe = direction === "out";
  const issuer = String(typedRow?.issuer ?? "").trim();
  const recipient = String(typedRow?.recipient ?? "").trim();
  const counterpartyNpub = isOwe ? recipient : issuer;
  const counterparty = counterpartyNpub
    ? contacts.find((c) => String(c.npub ?? "").trim() === counterpartyNpub)
    : null;
  const displayName = counterparty?.name
    ? String(counterparty.name ?? "").trim()
    : counterpartyNpub
      ? formatShortNpub(counterpartyNpub)
      : null;
  const expiresAtSec = Number(typedRow?.expiresAtSec ?? 0) || 0;
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
