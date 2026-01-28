import React from "react";
import { BottomTab } from "./BottomTab";

interface BottomTabBarProps {
  activeTab: "contacts" | "wallet" | null;
  contactsLabel: string;
  navigateToContacts: () => void;
  navigateToWallet: () => void;
  t: (key: string) => string;
  walletLabel: string;
}

export function BottomTabBar({
  activeTab,
  contactsLabel,
  navigateToContacts,
  navigateToWallet,
  t,
  walletLabel,
}: BottomTabBarProps): React.ReactElement {
  return (
    <div className="contacts-qr-bar" role="region">
      <div className="bottom-tabs-bar" role="tablist" aria-label={t("list")}>
        <div className="bottom-tabs">
          <BottomTab
            icon="contacts"
            label={contactsLabel}
            isActive={activeTab === "contacts"}
            onClick={navigateToContacts}
          />
          <BottomTab
            icon="wallet"
            label={walletLabel}
            isActive={activeTab === "wallet"}
            onClick={navigateToWallet}
          />
        </div>
      </div>
      <div className="contacts-qr-inner"></div>
    </div>
  );
}
