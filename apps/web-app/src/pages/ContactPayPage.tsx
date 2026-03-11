import type { FC } from "react";
import { useAppShellCore } from "../app/context/AppShellContexts";
import { PaymentAmountPanel } from "../components/PaymentAmountPanel";
import type { ContactId } from "../evolu";
import { getInitials } from "../utils/formatting";
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
  const { formatDisplayedAmountText } = useAppShellCore();

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
  const icon = method === "lightning" ? "⚡" : "🥜";

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
    <PaymentAmountPanel
      amount={payAmount}
      cashuIsBusy={cashuIsBusy}
      displayUnit={displayUnit}
      header={
        <div className="contact-header">
          <div className="contact-avatar is-large" aria-hidden="true">
            {url ? (
              <img
                src={url}
                alt=""
                loading="lazy"
                referrerPolicy="no-referrer"
              />
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
                  aria-label={method === "lightning" ? "Lightning" : "Cashu"}
                  title={
                    showToggle
                      ? method === "lightning"
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
              {t("availablePrefix")} {formatDisplayedAmountText(cashuBalance)}
            </p>
          </div>
        </div>
      }
      notices={
        <>
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
        </>
      }
      onAmountChange={setPayAmount}
      onSubmit={() => {
        void paySelectedContact();
      }}
      sendGuideId="pay-send"
      stepGuideId="pay-step3"
      submitDisabled={invalid}
      submitTitle={
        method === "lightning" && remaining > cashuBalance
          ? t("payInsufficient")
          : undefined
      }
      t={t}
    />
  );
};
