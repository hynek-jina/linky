import React from "react";
import { WalletWarning } from "../components/WalletWarning";
import { WalletBalance } from "../components/WalletBalance";
import { WalletActionButton } from "../components/WalletActionButton";
import { BottomTabBar } from "../components/BottomTabBar";

interface WalletPageProps {
  bottomTabActive: "wallet" | "contacts" | null;
  cashuBalance: number;
  displayUnit: string;
  formatInteger: (value: number) => string;
  navigateToCashuTokenNew: () => void;
  navigateToContacts: () => void;
  navigateToTopup: () => void;
  navigateToWallet: () => void;
  openScan: () => void;
  scanIsOpen: boolean;
  t: (key: string) => string;
}

export const WalletPage: React.FC<WalletPageProps> = ({
  bottomTabActive,
  cashuBalance,
  displayUnit,
  formatInteger,
  navigateToCashuTokenNew,
  navigateToContacts,
  navigateToTopup,
  navigateToWallet,
  openScan,
  scanIsOpen,
  t,
}) => {
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
            onClick={navigateToCashuTokenNew}
          >
            {t("tokens")}
          </button>
          <div className="wallet-actions">
            <WalletActionButton
              icon="topup"
              label={t("walletReceive")}
              onClick={navigateToTopup}
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
        navigateToContacts={navigateToContacts}
        navigateToWallet={navigateToWallet}
        t={t}
        walletLabel={t("wallet")}
      />
    </section>
  );
};
