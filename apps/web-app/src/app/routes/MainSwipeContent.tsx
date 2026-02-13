import React from "react";
import { BottomTabBar } from "../../components/BottomTabBar";
import { ContactsChecklist } from "../../components/ContactsChecklist";
import { ContactsPage } from "../../pages/ContactsPage";
import { WalletPage } from "../../pages/WalletPage";
import type { ContactsGuideKey } from "../types/appTypes";
import type { Route } from "../../types/route";

interface MainSwipeContentProps {
  activeGroup: string | null;
  bottomTabActive: "contacts" | "wallet" | null;
  cashuBalance: number;
  contacts: readonly unknown[];
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
  displayUnit: string;
  dismissContactsOnboarding: () => void;
  groupNames: string[];
  handleMainSwipeScroll:
    | ((event: React.UIEvent<HTMLDivElement>) => void)
    | undefined;
  mainSwipeProgress: number;
  mainSwipeRef: React.RefObject<HTMLDivElement | null>;
  mainSwipeScrollY: number;
  NO_GROUP_FILTER: string;
  openNewContactPage: () => void;
  openScan: () => void;
  otherContactsLabel: string;
  renderContactCard: (contact: unknown) => React.ReactNode;
  route: Route;
  scanIsOpen: boolean;
  setActiveGroup: (group: string | null) => void;
  setContactsSearch: (value: string) => void;
  showContactsOnboarding: boolean;
  showGroupFilter: boolean;
  showNoGroupFilter: boolean;
  startContactsGuide: (task: ContactsGuideKey) => void;
  t: (key: string) => string;
  visibleContacts: { conversations: unknown[]; others: unknown[] };
}

const isContactsGuideKey = (value: string): value is ContactsGuideKey =>
  value === "add_contact" ||
  value === "topup" ||
  value === "pay" ||
  value === "message" ||
  value === "backup_keys";

export const MainSwipeContent = ({
  activeGroup,
  bottomTabActive,
  cashuBalance,
  contacts,
  contactsOnboardingCelebrating,
  contactsOnboardingTasks,
  contactsSearch,
  contactsSearchInputRef,
  contactsToolbarStyle,
  conversationsLabel,
  displayUnit,
  dismissContactsOnboarding,
  groupNames,
  handleMainSwipeScroll,
  mainSwipeProgress,
  mainSwipeRef,
  mainSwipeScrollY,
  NO_GROUP_FILTER,
  openNewContactPage,
  openScan,
  otherContactsLabel,
  renderContactCard,
  route,
  scanIsOpen,
  setActiveGroup,
  setContactsSearch,
  showContactsOnboarding,
  showGroupFilter,
  showNoGroupFilter,
  startContactsGuide,
  t,
  visibleContacts,
}: MainSwipeContentProps): React.ReactElement => {
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
            contacts={contacts}
            visibleContacts={visibleContacts}
            conversationsLabel={conversationsLabel}
            otherContactsLabel={otherContactsLabel}
            renderContactCard={(contact) => renderContactCard(contact)}
            bottomTabActive={bottomTabActive}
            openNewContactPage={openNewContactPage}
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
            displayUnit={displayUnit}
            openScan={openScan}
            scanIsOpen={scanIsOpen}
            bottomTabActive={bottomTabActive}
            showBottomTabBar={false}
            t={t}
          />
        </div>
      </div>
      <BottomTabBar
        activeTab={bottomTabActive}
        activeProgress={mainSwipeProgress}
        contactsLabel={t("contactsTitle")}
        t={t}
        walletLabel={t("wallet")}
      />
      <button
        type="button"
        className="contacts-fab main-swipe-fab"
        onClick={openNewContactPage}
        aria-label={t("addContact")}
        title={t("addContact")}
        data-guide="contact-add-button"
        style={{
          transform: `translateX(${-mainSwipeProgress * 100}%)`,
          opacity: Math.max(0, 1 - mainSwipeProgress * 1.1),
          pointerEvents: mainSwipeProgress < 0.5 ? "auto" : "none",
        }}
      >
        <span aria-hidden="true">+</span>
      </button>
    </>
  );
};
