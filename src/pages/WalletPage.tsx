import React from "react";
import { useNavigation } from "../hooks/useRouting";
import { WalletWarning } from "../components/WalletWarning";
import { WalletBalance } from "../components/WalletBalance";
import { WalletActionButton } from "../components/WalletActionButton";
import { BottomTabBar } from "../components/BottomTabBar";

interface WalletPageProps {
  bottomTabActive: "wallet" | "contacts" | null;
  cashuBalance: number;
  displayUnit: string;
  formatInteger: (value: number) => string;
  openScan: () => void;
  scanIsOpen: boolean;
  t: (key: string) => string;
}

export const WalletPage: React.FC<WalletPageProps> = ({
  bottomTabActive,
  cashuBalance,
  displayUnit,
  formatInteger,
  openScan,
  scanIsOpen,
  t,
}) => {
  const navigateTo = useNavigation();
  return (
    <section className="panel panel-plain wallet-panel">
      <WalletWarning t={t} />
      <div className="panel-header">
        <div className="wallet-hero">
          <WalletBalance
            balance={cashuBalance}
            displayUnit={displayUnit}
            formatInteger={formatInteger}
            ariaLabel={t("cashuBalance")}
          />
          <button
            type="button"
            className="wallet-tokens-link"
            onClick={() => navigateTo({ route: "cashuTokenNew" })}
          >
            {t("tokens")}
          </button>
          <div className="wallet-actions">
            <WalletActionButton
              icon="topup"
              label={t("walletReceive")}
              onClick={() => navigateTo({ route: "topup" })}
              dataGuide="wallet-topup"
            />
            <WalletActionButton
              icon="send"
              label={t("walletSend")}
              onClick={openScan}
              disabled={scanIsOpen}
            />
          </div>
        </div>
      </div>
      <BottomTabBar
        activeTab={bottomTabActive}
        contactsLabel={t("contactsTitle")}
        t={t}
        walletLabel={t("wallet")}
      />
    </section>
  );
};
