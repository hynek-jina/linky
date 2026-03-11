import type { FC, ReactNode } from "react";
import { useAppShellCore } from "../app/context/AppShellContexts";
import { AmountDisplay } from "./AmountDisplay";
import { Keypad } from "./Keypad";

interface PaymentAmountPanelProps {
  amount: string;
  cashuIsBusy: boolean;
  displayUnit: string;
  header: ReactNode;
  notices?: ReactNode | undefined;
  onAmountChange: React.Dispatch<React.SetStateAction<string>>;
  onSubmit: () => void;
  sendGuideId?: string | undefined;
  stepGuideId?: string | undefined;
  submitDisabled: boolean;
  submitTitle?: string | undefined;
  t: (key: string) => string;
}

export const PaymentAmountPanel: FC<PaymentAmountPanelProps> = ({
  amount,
  cashuIsBusy,
  displayUnit,
  header,
  notices,
  onAmountChange,
  onSubmit,
  sendGuideId,
  stepGuideId,
  submitDisabled,
  submitTitle,
  t,
}) => {
  const { applyAmountInputKey } = useAppShellCore();

  return (
    <section className="panel">
      {header}
      {notices}

      <div {...(stepGuideId ? { "data-guide": stepGuideId } : {})}>
        <AmountDisplay amount={amount} />

        <Keypad
          ariaLabel={`${t("payAmount")} (${displayUnit})`}
          disabled={cashuIsBusy}
          onKeyPress={(key: string) => {
            if (cashuIsBusy) return;
            onAmountChange((value) => applyAmountInputKey(value, key));
          }}
          translations={{
            clearForm: t("clearForm"),
            delete: t("delete"),
          }}
        />

        <div className="actions">
          <button
            className="btn-wide"
            onClick={onSubmit}
            disabled={cashuIsBusy || submitDisabled}
            title={submitTitle}
            {...(sendGuideId ? { "data-guide": sendGuideId } : {})}
          >
            <span className="btn-label-with-icon">
              <span className="btn-label-icon" aria-hidden="true">
                ₿
              </span>
              <span>{t("paySend")}</span>
            </span>
          </button>
        </div>
      </div>
    </section>
  );
};
