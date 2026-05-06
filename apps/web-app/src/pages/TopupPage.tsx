import type { FC } from "react";
import {
  useAppShellActions,
  useAppShellCore,
} from "../app/context/AppShellContexts";
import { AmountDisplay } from "../components/AmountDisplay";
import { Keypad } from "../components/Keypad";
import { useNavigation } from "../hooks/useRouting";
import { formatShortNpub, getInitials } from "../utils/formatting";

interface TopupPageProps {
  currentNpub: string | null;
  displayUnit: string;
  effectiveProfileName: string | null;
  effectiveProfilePicture: string | null;
  setTopupAmount: (value: string | ((prev: string) => string)) => void;
  t: (key: string) => string;
  topupAmount: string;
  topupInvoiceIsBusy: boolean;
}

export const TopupPage: FC<TopupPageProps> = ({
  currentNpub,
  displayUnit,
  effectiveProfileName,
  effectiveProfilePicture,
  setTopupAmount,
  t,
  topupAmount,
  topupInvoiceIsBusy,
}) => {
  const { applyAmountInputKey } = useAppShellCore();
  const { openReceiveScan, pasteScanValue } = useAppShellActions();
  const navigateTo = useNavigation();
  const amountSat = Number.parseInt(topupAmount.trim(), 10);
  const invalid =
    !currentNpub ||
    !Number.isFinite(amountSat) ||
    amountSat <= 0 ||
    topupInvoiceIsBusy;

  return (
    <section className="panel">
      <div className="contact-header">
        <div className="contact-avatar is-large" aria-hidden="true">
          {effectiveProfilePicture ? (
            <img
              src={effectiveProfilePicture}
              alt=""
              loading="lazy"
              referrerPolicy="no-referrer"
            />
          ) : (
            <span className="contact-avatar-fallback">
              {getInitials(
                effectiveProfileName ??
                  (currentNpub ? formatShortNpub(currentNpub) : ""),
              )}
            </span>
          )}
        </div>
        <div className="contact-header-text">
          <h3>
            {effectiveProfileName ??
              (currentNpub ? formatShortNpub(currentNpub) : t("appTitle"))}
          </h3>
        </div>
      </div>

      <AmountDisplay amount={topupAmount} cycleOnClick />

      <Keypad
        ariaLabel={`${t("payAmount")} (${displayUnit})`}
        disabled={topupInvoiceIsBusy}
        onKeyPress={(key: string) => {
          if (topupInvoiceIsBusy) return;
          setTopupAmount((v) => applyAmountInputKey(v, key));
        }}
        translations={{
          clearForm: t("clearForm"),
          delete: t("delete"),
        }}
      />

      <div className="actions">
        <button
          className="btn-wide"
          onClick={() => {
            if (invalid) return;
            navigateTo({ route: "topupInvoice" });
          }}
          disabled={invalid}
          data-guide="topup-show-invoice"
        >
          {t("topupShowInvoice")}
        </button>

        <div className="topup-secondary-actions">
          <button
            type="button"
            className="btn-wide secondary"
            onClick={() => navigateTo({ route: "topupNoAmount" })}
          >
            <span className="btn-label-with-icon">
              <span className="btn-label-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" width="18" height="18">
                  <circle
                    cx="12"
                    cy="12"
                    r="7"
                    stroke="currentColor"
                    strokeWidth="1.8"
                  />
                  <path
                    d="M7 12h10"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                  />
                  <path
                    d="M12 7v10"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                  />
                </svg>
              </span>
              <span>{t("topupNoAmount")}</span>
            </span>
          </button>
          <button
            type="button"
            className="btn-wide secondary"
            onClick={() => void pasteScanValue()}
          >
            <span className="btn-label-with-icon">
              <span className="btn-label-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" width="18" height="18">
                  <rect
                    x="5"
                    y="4"
                    width="11"
                    height="13"
                    rx="2.2"
                    stroke="currentColor"
                    strokeWidth="1.8"
                  />
                  <rect
                    x="8"
                    y="7"
                    width="11"
                    height="13"
                    rx="2.2"
                    stroke="currentColor"
                    strokeWidth="1.8"
                  />
                </svg>
              </span>
              <span>{t("paste")}</span>
            </span>
          </button>
          <button
            type="button"
            className="btn-wide secondary"
            onClick={openReceiveScan}
          >
            <span className="btn-label-with-icon">
              <span className="btn-label-icon" aria-hidden="true">
                <span className="contacts-qr-scanIcon" />
              </span>
              <span>{t("scan")}</span>
            </span>
          </button>
        </div>
      </div>
    </section>
  );
};
