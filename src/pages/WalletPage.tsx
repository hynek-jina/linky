import * as React from "react";
import { WalletWarning } from "../components/WalletWarning";
import { WalletBalance } from "../components/WalletBalance";
import { WalletActionButton } from "../components/WalletActionButton";
import { BottomTabBar } from "../components/BottomTabBar";

type WalletPageProps = {
  cashuBalance: number;
  displayUnit: string;
  formatInteger: (value: number) => string;
  navigateToCashuTokenNew: () => void;
  navigateToTopup: () => void;
  openScan: () => void;
  scanIsOpen: boolean;
  bottomTabActive: "wallet" | "contacts" | null;
  navigateToContacts: () => void;
  navigateToWallet: () => void;
  t: (key: string) => string;
};

export const WalletPage: React.FC<WalletPageProps> = ({
  cashuBalance,
  displayUnit,
  formatInteger,
  navigateToCashuTokenNew,
  navigateToTopup,
  openScan,
  scanIsOpen,
  bottomTabActive,
  navigateToContacts,
  navigateToWallet,
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
