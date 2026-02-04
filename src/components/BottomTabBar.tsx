import React from "react";
import { useNavigation } from "../hooks/useRouting";
import { BottomTab } from "./BottomTab";

interface BottomTabBarProps {
  activeTab: "contacts" | "wallet" | null;
  activeProgress?: number;
  contactsLabel: string;
  t: (key: string) => string;
  walletLabel: string;
}

export function BottomTabBar({
  activeTab,
  activeProgress,
  contactsLabel,
  t,
  walletLabel,
}: BottomTabBarProps): React.ReactElement {
  const navigateTo = useNavigation();
  const tabsRef = React.useRef<HTMLDivElement | null>(null);
  const contactsTabRef = React.useRef<HTMLButtonElement | null>(null);
  const walletTabRef = React.useRef<HTMLButtonElement | null>(null);
  const [tabMetrics, setTabMetrics] = React.useState<{
    contactsLeft: number;
    contactsWidth: number;
    walletLeft: number;
    walletWidth: number;
    ready: boolean;
  }>({
    contactsLeft: 0,
    contactsWidth: 0,
    walletLeft: 0,
    walletWidth: 0,
    ready: false,
  });

  const clampProgress = (value: number) => {
    if (!Number.isFinite(value)) return 0;
    return Math.min(1, Math.max(0, value));
  };

  const progress =
    activeProgress !== undefined
      ? clampProgress(activeProgress)
      : activeTab === "wallet"
        ? 1
        : 0;

  const measureTabs = React.useCallback(() => {
    const container = tabsRef.current;
    const contacts = contactsTabRef.current;
    const wallet = walletTabRef.current;
    if (!container || !contacts || !wallet) return;
    const containerRect = container.getBoundingClientRect();
    const contactsRect = contacts.getBoundingClientRect();
    const walletRect = wallet.getBoundingClientRect();
    setTabMetrics({
      contactsLeft: contactsRect.left - containerRect.left,
      contactsWidth: contactsRect.width,
      walletLeft: walletRect.left - containerRect.left,
      walletWidth: walletRect.width,
      ready: true,
    });
  }, []);

  React.useLayoutEffect(() => {
    measureTabs();
  }, [measureTabs, contactsLabel, walletLabel]);

  React.useEffect(() => {
    if (typeof ResizeObserver === "undefined") return;
    const container = tabsRef.current;
    const contacts = contactsTabRef.current;
    const wallet = walletTabRef.current;
    if (!container || !contacts || !wallet) return;
    const observer = new ResizeObserver(() => {
      measureTabs();
    });
    observer.observe(container);
    observer.observe(contacts);
    observer.observe(wallet);
    return () => observer.disconnect();
  }, [measureTabs]);

  const indicatorLeft =
    tabMetrics.contactsLeft +
    (tabMetrics.walletLeft - tabMetrics.contactsLeft) * progress;
  const indicatorWidth =
    tabMetrics.contactsWidth +
    (tabMetrics.walletWidth - tabMetrics.contactsWidth) * progress;

  return (
    <div className="contacts-qr-bar" role="region">
      <div className="bottom-tabs-bar" role="tablist" aria-label={t("list")}>
        <div
          className={
            tabMetrics.ready ? "bottom-tabs" : "bottom-tabs no-indicator"
          }
          ref={tabsRef}
        >
          <div
            className="bottom-tabs-indicator"
            aria-hidden="true"
            style={
              tabMetrics.ready
                ? {
                    transform: `translateX(${indicatorLeft}px)`,
                    width: `${indicatorWidth}px`,
                  }
                : undefined
            }
          />
          <BottomTab
            icon="contacts"
            label={contactsLabel}
            isActive={activeTab === "contacts"}
            onClick={() => navigateTo({ route: "contacts" })}
            buttonRef={contactsTabRef}
          />
          <BottomTab
            icon="wallet"
            label={walletLabel}
            isActive={activeTab === "wallet"}
            onClick={() => navigateTo({ route: "wallet" })}
            buttonRef={walletTabRef}
          />
        </div>
      </div>
      <div className="contacts-qr-inner"></div>
    </div>
  );
}
