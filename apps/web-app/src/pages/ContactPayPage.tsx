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
  cashuBalance: number;
  cashuIsBusy: boolean;
  contactPayMethod: "lightning" | "cashu" | null;
  displayUnit: string;
  nostrPictureByNpub: Record<string, string | null>;
  payAmount: string;
  paySelectedContact: () => Promise<void>;
  payWithCashuEnabled: boolean;
  selectedContact: Contact | null;
  setContactPayMethod: React.Dispatch<
    React.SetStateAction<"lightning" | "cashu" | null>
  >;
  setPayAmount: (value: string | ((prev: string) => string)) => void;
  t: (key: string) => string;
}

export const ContactPayPage: FC<ContactPayPageProps> = ({
  cashuBalance,
  cashuIsBusy,
  contactPayMethod,
  displayUnit,
  nostrPictureByNpub,
  payAmount,
  paySelectedContact,
  payWithCashuEnabled,
  selectedContact,
  setContactPayMethod,
  setPayAmount,
  t,
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
  const canUseCashu = payWithCashuEnabled && Boolean(npub);
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
  const remaining = validAmount;
  const canCoverAnything = cashuBalance > 0;
  const invalid =
    (method === "lightning" ? !ln : !canUseCashu) ||
    !Number.isFinite(amountSat) ||
    amountSat <= 0 ||
    remaining > cashuBalance;

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
          </p>
        </div>
      </div>

      {method === "cashu" && !payWithCashuEnabled && (
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
