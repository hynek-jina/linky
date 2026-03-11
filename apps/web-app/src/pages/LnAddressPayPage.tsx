import type { FC } from "react";
import { useAppShellCore } from "../app/context/AppShellContexts";
import { PaymentAmountPanel } from "../components/PaymentAmountPanel";
import {
  getLnurlPayDisplayText,
  inferLightningAddressFromLnurlTarget,
} from "../lnurlPay";
import { formatMiddleDots, getInitials } from "../utils/formatting";

interface LnAddressPayKnownContact {
  lnAddress?: string | null;
  name?: string | null;
}

interface LnAddressPayPageProps {
  canPayWithCashu: boolean;
  cashuBalance: number;
  cashuIsBusy: boolean;
  displayUnit: string;
  knownContact: LnAddressPayKnownContact | null;
  knownContactPictureUrl: string | null;
  lnAddress: string;
  lnAddressPayAmount: string;
  payLightningAddressWithCashu: (
    lnAddress: string,
    amountSat: number,
  ) => Promise<void>;
  setLnAddressPayAmount: (value: string | ((prev: string) => string)) => void;
  t: (key: string) => string;
}

export const LnAddressPayPage: FC<LnAddressPayPageProps> = ({
  canPayWithCashu,
  cashuBalance,
  cashuIsBusy,
  displayUnit,
  knownContact,
  knownContactPictureUrl,
  lnAddress,
  lnAddressPayAmount,
  payLightningAddressWithCashu,
  setLnAddressPayAmount,
  t,
}) => {
  const { formatDisplayedAmountText } = useAppShellCore();
  const amountSat = Number.parseInt(lnAddressPayAmount.trim(), 10);
  const displayTarget = formatMiddleDots(getLnurlPayDisplayText(lnAddress), 36);
  const inferredLightningAddress =
    inferLightningAddressFromLnurlTarget(lnAddress);
  const displayAddress = formatMiddleDots(
    String(
      knownContact?.lnAddress ?? inferredLightningAddress ?? displayTarget,
    ),
    36,
  );
  const invalid =
    !canPayWithCashu ||
    !Number.isFinite(amountSat) ||
    amountSat <= 0 ||
    amountSat > cashuBalance;

  return (
    <PaymentAmountPanel
      amount={lnAddressPayAmount}
      cashuIsBusy={cashuIsBusy}
      displayUnit={displayUnit}
      header={
        <div className="contact-header">
          {knownContact ? (
            <div className="contact-avatar is-large" aria-hidden="true">
              {knownContactPictureUrl ? (
                <img
                  src={knownContactPictureUrl}
                  alt=""
                  loading="lazy"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <span className="contact-avatar-fallback">
                  {getInitials(String(knownContact.name ?? ""))}
                </span>
              )}
            </div>
          ) : null}
          <div className="contact-header-text">
            {knownContact?.name ? <h3>{knownContact.name}</h3> : null}
            <p className="muted">{displayAddress}</p>
            <p className="muted">
              {t("availablePrefix")} {formatDisplayedAmountText(cashuBalance)}
            </p>
          </div>
        </div>
      }
      notices={
        !canPayWithCashu ? (
          <p className="muted">{t("payInsufficient")}</p>
        ) : undefined
      }
      onAmountChange={setLnAddressPayAmount}
      onSubmit={() => {
        if (invalid) return;
        void payLightningAddressWithCashu(lnAddress, amountSat);
      }}
      submitDisabled={invalid}
      submitTitle={amountSat > cashuBalance ? t("payInsufficient") : undefined}
      t={t}
    />
  );
};
