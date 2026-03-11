import type { FC } from "react";
import { useState } from "react";
import { useAppShellCore } from "../app/context/AppShellContexts";
import { AmountDisplay } from "../components/AmountDisplay";
import { Keypad } from "../components/Keypad";
import { useNavigation } from "../hooks/useRouting";

interface AdvancedAutoPayLimitPageProps {
  lightningInvoiceAutoPayLimit: number;
  setLightningInvoiceAutoPayLimit: (value: number) => void;
  t: (key: string) => string;
}

export const AdvancedAutoPayLimitPage: FC<AdvancedAutoPayLimitPageProps> = ({
  lightningInvoiceAutoPayLimit,
  setLightningInvoiceAutoPayLimit,
  t,
}) => {
  const { applyAmountInputKey, displayUnit } = useAppShellCore();
  const navigateTo = useNavigation();
  const [amount, setAmount] = useState<string>(() =>
    lightningInvoiceAutoPayLimit > 0
      ? String(lightningInvoiceAutoPayLimit)
      : "",
  );
  const amountSat = Number.parseInt(amount.trim(), 10);
  const invalid = !Number.isFinite(amountSat) || amountSat <= 0;

  return (
    <section className="panel">
      <AmountDisplay amount={amount} />

      <Keypad
        ariaLabel={`${t("payAmount")} (${displayUnit})`}
        disabled={false}
        onKeyPress={(key: string) => {
          setAmount((value) => applyAmountInputKey(value, key));
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
            setLightningInvoiceAutoPayLimit(amountSat);
            navigateTo({ route: "advanced" });
          }}
          disabled={invalid}
        >
          {t("saveChanges")}
        </button>
      </div>
    </section>
  );
};
