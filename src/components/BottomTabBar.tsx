import React from "react";
import { useNavigation } from "../hooks/useRouting";
import { BottomTab } from "./BottomTab";

interface BottomTabBarProps {
  activeTab: "contacts" | "wallet" | null;
  contactsLabel: string;
  t: (key: string) => string;
  walletLabel: string;
}

export function BottomTabBar({
  activeTab,
  contactsLabel,
  t,
  walletLabel,
}: BottomTabBarProps): React.ReactElement {
  const navigateTo = useNavigation();
  return (
    <div className="contacts-qr-bar" role="region">
      <div className="bottom-tabs-bar" role="tablist" aria-label={t("list")}>
        <div className="bottom-tabs">
          <BottomTab
            icon="contacts"
            label={contactsLabel}
            isActive={activeTab === "contacts"}
            onClick={() => navigateTo({ route: "contacts" })}
          />
          <BottomTab
            icon="wallet"
            label={walletLabel}
            isActive={activeTab === "wallet"}
            onClick={() => navigateTo({ route: "wallet" })}
          />
        </div>
      </div>
      <div className="contacts-qr-inner"></div>
    </div>
  );
}
