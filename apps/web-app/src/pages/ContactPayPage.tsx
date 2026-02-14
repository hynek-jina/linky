import type { FC } from "react";
import { AmountDisplay } from "../components/AmountDisplay";
import { Keypad } from "../components/Keypad";
import type { ContactId } from "../evolu";
import { formatInteger, getInitials } from "../utils/formatting";
import { normalizeNpubIdentifier } from "../utils/nostrNpub";

interface Contact {
  id: ContactId;
  name?: string | null;
  lnAddress?: string | null;
  npub?: string | null;
}

interface ContactPayPageProps {
  allowPromisesEnabled: boolean;
  cashuBalance: number;
  cashuIsBusy: boolean;
  contactPayMethod: "lightning" | "cashu" | null;
  displayUnit: string;
  getCredoAvailableForContact: (npub: string) => number;
  nostrPictureByNpub: Record<string, string | null>;
  payAmount: string;
  paySelectedContact: () => Promise<void>;
  payWithCashuEnabled: boolean;
  promiseTotalCapSat: number;
  selectedContact: Contact | null;
  setContactPayMethod: React.Dispatch<
    React.SetStateAction<"lightning" | "cashu" | null>
  >;
  setPayAmount: (value: string | ((prev: string) => string)) => void;
  t: (key: string) => string;
  totalCredoOutstandingOut: number;
}

export const ContactPayPage: FC<ContactPayPageProps> = ({
  allowPromisesEnabled,
  cashuBalance,
  cashuIsBusy,
  contactPayMethod,
  displayUnit,
  getCredoAvailableForContact,
  nostrPictureByNpub,
  payAmount,
  paySelectedContact,
  payWithCashuEnabled,
  promiseTotalCapSat,
  selectedContact,
  setContactPayMethod,
  setPayAmount,
  t,
  totalCredoOutstandingOut,
}) => {
  if (!selectedContact) {
    return (
      <section className="panel">
        <p className="muted">{t("contactNotFound")}</p>
      </section>
    );
  }

  const ln = String(selectedContact.lnAddress ?? "").trim();
  const npub = normalizeNpubIdentifier(selectedContact.npub);
  const url = npub ? nostrPictureByNpub[npub] : null;
  const canUseCashu =
    (payWithCashuEnabled || allowPromisesEnabled) && Boolean(npub);
  const canUseLightning = Boolean(ln);
  const showToggle = canUseCashu && canUseLightning;
  const method =
    contactPayMethod === "lightning" || contactPayMethod === "cashu"
      ? contactPayMethod
      : canUseCashu
        ? "cashu"
        : "lightning";
  const icon = contactPayMethod === "lightning" ? "⚡" : "🥜";

  const amountSat = Number.parseInt(payAmount.trim(), 10);
  const validAmount =
    Number.isFinite(amountSat) && amountSat > 0 ? amountSat : 0;
  const availableCredo = npub ? getCredoAvailableForContact(npub) : 0;
  const useCredo = Math.min(availableCredo, validAmount);
  const remaining = Math.max(0, validAmount - useCredo);
  const promiseAmount =
    method === "cashu" && allowPromisesEnabled
      ? Math.max(0, remaining - cashuBalance)
      : 0;
  const promiseLimitExceeded =
    promiseAmount > 0 &&
    totalCredoOutstandingOut + promiseAmount > promiseTotalCapSat;
  const canCoverAnything =
    cashuBalance > 0 ||
    availableCredo > 0 ||
    (allowPromisesEnabled && method === "cashu");
  const invalid =
    (method === "lightning" ? !ln : !canUseCashu) ||
    !Number.isFinite(amountSat) ||
    amountSat <= 0 ||
    (method === "lightning"
      ? remaining > cashuBalance
      : promiseAmount > 0 && (!allowPromisesEnabled || promiseLimitExceeded));

  return (
    <section className="panel">
      <div className="contact-header">
        <div className="contact-avatar is-large" aria-hidden="true">
          {url ? (
            <img src={url} alt="" loading="lazy" referrerPolicy="no-referrer" />
          ) : (
            <span className="contact-avatar-fallback">
              {getInitials(String(selectedContact.name ?? ""))}
            </span>
          )}
        </div>
        <div className="contact-header-text">
          {selectedContact.name && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10,
              }}
            >
              <h3 style={{ margin: 0 }}>{selectedContact.name}</h3>
              <button
                type="button"
                className={
                  showToggle
                    ? "pay-method-toggle"
                    : "pay-method-toggle is-disabled"
                }
                onClick={() => {
                  if (!showToggle) return;
                  setContactPayMethod((prev) =>
                    prev === "lightning" ? "cashu" : "lightning",
                  );
                }}
                aria-label={
                  contactPayMethod === "lightning" ? "Lightning" : "Cashu"
                }
                title={
                  showToggle
                    ? contactPayMethod === "lightning"
                      ? "Lightning"
                      : "Cashu"
                    : undefined
                }
              >
                {icon}
              </button>
            </div>
          )}
          <p className="muted">
            {t("availablePrefix")} {formatInteger(cashuBalance)} {displayUnit}
            {allowPromisesEnabled ? (
              <>
                {" · "}
                {t("promisedPrefix")} {formatInteger(promiseAmount)}{" "}
                {displayUnit}
              </>
            ) : null}
          </p>
        </div>
      </div>

      {method === "cashu" && !payWithCashuEnabled && !allowPromisesEnabled && (
        <p className="muted">{t("payWithCashuDisabled")}</p>
      )}

      {method === "cashu" && !npub && (
        <p className="muted">{t("chatMissingContactNpub")}</p>
      )}

      {method === "lightning" && !ln && (
        <p className="muted">{t("payMissingLn")}</p>
      )}

      {!canCoverAnything && <p className="muted">{t("payInsufficient")}</p>}

      <div data-guide="pay-step3">
        <AmountDisplay
          amount={payAmount}
          displayUnit={displayUnit}
          formatInteger={formatInteger}
        />

        <Keypad
          ariaLabel={`${t("payAmount")} (${displayUnit})`}
          disabled={cashuIsBusy}
          onKeyPress={(key: string) => {
            if (cashuIsBusy) return;
            if (key === "C") {
              setPayAmount("");
              return;
            }
            if (key === "⌫") {
              setPayAmount((v) => v.slice(0, -1));
              return;
            }
            setPayAmount((v) => {
              const next = (v + key).replace(/^0+(\d)/, "$1");
              return next;
            });
          }}
          translations={{
            clearForm: t("clearForm"),
            delete: t("delete"),
          }}
        />

        <div className="actions">
          <button
            className="btn-wide"
            onClick={() => void paySelectedContact()}
            disabled={cashuIsBusy || invalid}
            title={
              method === "lightning" && remaining > cashuBalance
                ? t("payInsufficient")
                : promiseAmount > 0 &&
                    (!allowPromisesEnabled || promiseLimitExceeded)
                  ? allowPromisesEnabled
                    ? t("payPromiseLimit")
                    : t("payInsufficient")
                  : undefined
            }
            data-guide="pay-send"
          >
            {t("paySend")}
          </button>
        </div>
      </div>
    </section>
  );
};
