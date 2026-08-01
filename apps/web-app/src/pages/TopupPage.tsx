import type { FC } from "react";
import { ScanLine } from "lucide-react";
import {
  useAppShellActions,
  useAppShellCore,
} from "../app/context/AppShellContexts";
import { AmountDisplay } from "../components/AmountDisplay";
import { NoAmountIcon, PasteIcon } from "../components/icons";
import { Keypad } from "../components/Keypad";
import { useNavigation } from "../hooks/useRouting";

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
                <NoAmountIcon size={18} />
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
                <PasteIcon size={18} />
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
                <ScanLine size={18} />
              </span>
              <span>{t("scan")}</span>
            </span>
          </button>
        </div>
      </div>
    </section>
  );
};
