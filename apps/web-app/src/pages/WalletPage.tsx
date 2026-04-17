import React from "react";
import { BottomTabBar } from "../components/BottomTabBar";
import { WalletActionButton } from "../components/WalletActionButton";
import { WalletBalance } from "../components/WalletBalance";
import { WalletWarning } from "../components/WalletWarning";
import { useNavigation } from "../hooks/useRouting";

interface WalletPageProps {
  bottomTabActive: "wallet" | "contacts" | null;
  cashuBalance: number;
  dismissWalletWarning: () => void;
  openScan: () => void;
  scanIsOpen: boolean;
  showWalletWarning: boolean;
  showBottomTabBar?: boolean;
  t: (key: string) => string;
}

export const WalletPage: React.FC<WalletPageProps> = ({
  bottomTabActive,
  cashuBalance,
  dismissWalletWarning,
  openScan,
  scanIsOpen,
  showWalletWarning,
  showBottomTabBar = true,
  t,
}) => {
  const navigateTo = useNavigation();
  return (
    <section className="panel panel-plain wallet-panel">
      <WalletWarning
        dismissed={!showWalletWarning}
        onDismiss={dismissWalletWarning}
        t={t}
      />
      <div className="panel-header">
        <div className="wallet-hero">
          <WalletBalance balance={cashuBalance} ariaLabel={t("cashuBalance")} />
          <button
            type="button"
            className="wallet-tokens-link"
            onClick={() => navigateTo({ route: "cashuTokens" })}
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
      {showBottomTabBar ? (
        <BottomTabBar
          activeTab={bottomTabActive}
          contactsLabel={t("contactsTitle")}
          t={t}
          walletLabel={t("wallet")}
        />
      ) : null}
    </section>
  );
};
