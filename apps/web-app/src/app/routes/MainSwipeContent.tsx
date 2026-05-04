import React from "react";
import { BottomTabBar } from "../../components/BottomTabBar";
import { ContactAddFabIcon } from "../../components/ContactAddFabIcon";
import { ContactsChecklist } from "../../components/ContactsChecklist";
import { ContactsPage } from "../../pages/ContactsPage";
import { WalletPage } from "../../pages/WalletPage";
import type { Route } from "../../types/route";
import { useMainSwipeRoutes } from "../context/AppShellContexts";
import type { ContactRowLike, ContactsGuideKey } from "../types/appTypes";

export interface MainSwipeRouteProps {
  activeGroup: string | null;
  bottomTabActive: "contacts" | "wallet" | null;
  canAddContact: boolean;
  cashuBalance: number;
  contacts: readonly ContactRowLike[];
  contactsOnboardingCelebrating: boolean;
  contactsOnboardingTasks: {
    done: number;
    percent: number;
    tasks: ReadonlyArray<{ done: boolean; key: string; label: string }>;
    total: number;
  };
  contactsSearch: string;
  contactsSearchInputRef: React.RefObject<HTMLInputElement | null>;
  contactsToolbarStyle: React.CSSProperties;
  conversationsLabel: string;
  dismissContactsOnboarding: () => void;
  groupNames: string[];
  handleMainSwipeScroll:
    | ((event: React.UIEvent<HTMLDivElement>) => void)
    | undefined;
  handleMainSwipeTabChange: (target: "contacts" | "wallet") => void;
  isMainSwipeDragging: boolean;
  mainSwipeProgress: number;
  mainSwipeRef: React.RefObject<HTMLDivElement | null>;
  mainSwipeScrollY: number;
  NO_GROUP_FILTER: string;
  openNewContactPage: () => void;
  openScan: () => void;
  openWalletScan: () => void;
  otherContactsLabel: string;
  renderContactCard: (contact: ContactRowLike) => React.ReactNode;
  route: Route;
  scanIsOpen: boolean;
  setActiveGroup: (group: string | null) => void;
  setContactsSearch: (value: string) => void;
  showContactsOnboarding: boolean;
  showWalletWarning: boolean;
  showGroupFilter: boolean;
  showNoGroupFilter: boolean;
  statusFilterCurrencies: string[];
  startContactsGuide: (task: ContactsGuideKey) => void;
  t: (key: string) => string;
  visibleContacts: {
    conversations: ContactRowLike[];
    others: ContactRowLike[];
  };
  dismissWalletWarning: () => void;
}

const isContactsGuideKey = (value: string): value is ContactsGuideKey =>
  value === "add_contact" ||
  value === "topup" ||
  value === "pay" ||
  value === "message" ||
  value === "backup_keys";

export const MainSwipeContent = (): React.ReactElement => {
  const { mainSwipeProps } = useMainSwipeRoutes();
  const {
    activeGroup,
    bottomTabActive,
    canAddContact,
    cashuBalance,
    contacts,
    contactsOnboardingCelebrating,
    contactsOnboardingTasks,
    contactsSearch,
    contactsSearchInputRef,
    contactsToolbarStyle,
    conversationsLabel,
    dismissContactsOnboarding,
    dismissWalletWarning,
    groupNames,
    handleMainSwipeScroll,
    handleMainSwipeTabChange,
    isMainSwipeDragging,
    mainSwipeProgress,
    mainSwipeRef,
    mainSwipeScrollY,
    NO_GROUP_FILTER,
    openNewContactPage,
    openScan,
    openWalletScan,
    otherContactsLabel,
    renderContactCard,
    route,
    scanIsOpen,
    setActiveGroup,
    setContactsSearch,
    showContactsOnboarding,
    showWalletWarning,
    showGroupFilter,
    showNoGroupFilter,
    statusFilterCurrencies,
    startContactsGuide,
    t,
    visibleContacts,
  } = mainSwipeProps;

  return (
    <>
      <div
        className="main-swipe"
        ref={mainSwipeRef}
        onScroll={handleMainSwipeScroll}
      >
        <div
          className="main-swipe-page"
          aria-hidden={route.kind !== "contacts"}
        >
          <ContactsPage
            onboardingContent={
              showContactsOnboarding ? (
                <ContactsChecklist
                  contactsOnboardingCelebrating={contactsOnboardingCelebrating}
                  dismissContactsOnboarding={dismissContactsOnboarding}
                  onShowHow={(key) => {
                    if (!isContactsGuideKey(key)) return;
                    startContactsGuide(key);
                  }}
                  progressPercent={contactsOnboardingTasks.percent}
                  t={t}
                  tasks={contactsOnboardingTasks.tasks}
                  tasksCompleted={contactsOnboardingTasks.done}
                  tasksTotal={contactsOnboardingTasks.total}
                />
              ) : null
            }
            contactsToolbarStyle={contactsToolbarStyle}
            contactsSearchInputRef={contactsSearchInputRef}
            contactsSearch={contactsSearch}
            setContactsSearch={setContactsSearch}
            showGroupFilter={showGroupFilter}
            activeGroup={activeGroup}
            setActiveGroup={setActiveGroup}
            showNoGroupFilter={showNoGroupFilter}
            noGroupFilterValue={NO_GROUP_FILTER}
            groupNames={groupNames}
            statusFilterCurrencies={statusFilterCurrencies}
            contacts={contacts}
            visibleContacts={visibleContacts}
            conversationsLabel={conversationsLabel}
            otherContactsLabel={otherContactsLabel}
            renderContactCard={renderContactCard}
            bottomTabActive={bottomTabActive}
            canAddContact={canAddContact}
            openNewContactPage={openNewContactPage}
            openScan={openScan}
            showBottomTabBar={false}
            showFab={false}
            t={t}
          />
        </div>
        <div
          className="main-swipe-page"
          aria-hidden={route.kind !== "wallet"}
          style={
            mainSwipeScrollY
              ? { transform: `translateY(${mainSwipeScrollY}px)` }
              : undefined
          }
        >
          <WalletPage
            cashuBalance={cashuBalance}
            openScan={openWalletScan}
            scanIsOpen={scanIsOpen}
            bottomTabActive={bottomTabActive}
            dismissWalletWarning={dismissWalletWarning}
            showWalletWarning={showWalletWarning}
            showBottomTabBar={false}
            t={t}
          />
        </div>
      </div>
      <BottomTabBar
        activeTab={bottomTabActive}
        activeProgress={mainSwipeProgress}
        contactsLabel={t("contactsTitle")}
        disableIndicatorTransition={isMainSwipeDragging}
        onTabChange={handleMainSwipeTabChange}
        t={t}
        walletLabel={t("wallet")}
      />
      <button
        type="button"
        className={`contacts-fab main-swipe-fab${canAddContact ? "" : " is-disabled"}${isMainSwipeDragging ? " is-interactive" : ""}`}
        onClick={openScan}
        aria-disabled={!canAddContact}
        aria-label={t("addContact")}
        title={t("addContact")}
        data-guide="contact-add-button"
        style={{
          transform: `translateX(${-mainSwipeProgress * 100}%)`,
          opacity: Math.max(0, 1 - mainSwipeProgress * 1.1),
          pointerEvents: mainSwipeProgress < 0.5 ? "auto" : "none",
        }}
      >
        <ContactAddFabIcon />
      </button>
    </>
  );
};
