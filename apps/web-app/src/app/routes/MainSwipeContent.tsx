import React from "react";
import { BottomTabBar } from "../../components/BottomTabBar";
import { BankPaymentOfferBanner } from "../../components/BankPaymentOfferBanner";
import { ContactAddIcon } from "../../components/icons";
import { ContactsChecklist } from "../../components/ContactsChecklist";
import { ContactsPage } from "../../pages/ContactsPage";
import { WalletPage } from "../../pages/WalletPage";
import type { Route } from "../../types/route";
import {
  useAppShellCore,
  useMainSwipeRoutes,
} from "../context/AppShellContexts";
import { useMainSwipeProgress } from "../lib/mainSwipeProgressStore";
import { useShowProfileQrOnTilt } from "../hooks/useShowProfileQrOnTilt";
import type {
  ContactRowLike,
  ContactsGuideKey,
  LocalNostrMessage,
} from "../types/appTypes";

export interface MainSwipeRouteProps {
  activeGroup: string | null;
  bottomTabActive: "contacts" | "wallet" | null;
  canAddContact: boolean;
  cashuBalance: number;
  cashuTotalBalance: number;
  bankPaymentOfferMessages: readonly LocalNostrMessage[];
  chatOwnPubkeyHex: string | null;
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
  contactFilterOptions: Array<{ count: number; label: string; value: string }>;
  contactsToolbarStyle: React.CSSProperties;
  conversationsLabel: string;
  dismissContactsOnboarding: () => void;
  handleMainSwipeScroll:
    | ((event: React.UIEvent<HTMLDivElement>) => void)
    | undefined;
  handleMainSwipeTabChange: (target: "contacts" | "wallet") => void;
  mainSwipeRef: React.RefObject<HTMLDivElement | null>;
  openNewContactPage: () => void;
  openProfileQr: () => void;
  openWalletScan: () => void;
  otherContactsLabel: string;
  nostrPictureByNpub: Readonly<Record<string, string | null>>;
  renderContactCard: (contact: ContactRowLike) => React.ReactNode;
  route: Route;
  scanIsOpen: boolean;
  setActiveGroup: (group: string | null) => void;
  setContactsSearch: (value: string) => void;
  showContactsOnboarding: boolean;
  showWalletWarning: boolean;
  showGroupFilter: boolean;
  showProfileQrOnTiltEnabled: boolean;
  startContactsGuide: (task: ContactsGuideKey) => void;
  t: (key: string) => string;
  visibleContacts: {
    conversations: ContactRowLike[];
    others: ContactRowLike[];
    pinned: ContactRowLike[];
  };
  dismissWalletWarning: () => void;
}

const isContactsGuideKey = (value: string): value is ContactsGuideKey =>
  value === "add_contact" ||
  value === "topup" ||
  value === "pay" ||
  value === "message" ||
  value === "backup_keys";

// Per-frame swipe progress subscribers are isolated in these two small
// components so drag updates re-render only the tab bar and the FAB, not the
// whole swipe content with both pages.
interface MainSwipeBottomTabBarProps {
  activeTab: "contacts" | "wallet" | null;
  contactsLabel: string;
  onTabChange: (tab: "contacts" | "wallet") => void;
  t: (key: string) => string;
  walletLabel: string;
}

const MainSwipeBottomTabBar = ({
  activeTab,
  contactsLabel,
  onTabChange,
  t,
  walletLabel,
}: MainSwipeBottomTabBarProps): React.ReactElement => {
  const { isDragging, progress } = useMainSwipeProgress();
  return (
    <BottomTabBar
      activeTab={activeTab}
      activeProgress={progress}
      contactsLabel={contactsLabel}
      disableIndicatorTransition={isDragging}
      onTabChange={onTabChange}
      t={t}
      walletLabel={walletLabel}
    />
  );
};

interface MainSwipeFabProps {
  canAddContact: boolean;
  label: string;
  onClick: () => void;
}

const MainSwipeFab = ({
  canAddContact,
  label,
  onClick,
}: MainSwipeFabProps): React.ReactElement => {
  const { isDragging, progress } = useMainSwipeProgress();
  return (
    <button
      type="button"
      className={`contacts-fab main-swipe-fab${canAddContact ? "" : " is-disabled"}${isDragging ? " is-interactive" : ""}`}
      onClick={onClick}
      aria-disabled={!canAddContact}
      aria-label={label}
      title={label}
      data-guide="contact-add-button"
      style={{
        transform: `translateX(${-progress * 100}%)`,
        opacity: Math.max(0, 1 - progress * 1.1),
        pointerEvents: progress < 0.5 ? "auto" : "none",
      }}
    >
      <ContactAddIcon className="contacts-fab-svgIcon" />
    </button>
  );
};

export const MainSwipeContent = (): React.ReactElement => {
  const { mainSwipeProps } = useMainSwipeRoutes();
  const {
    activeGroup,
    bottomTabActive,
    canAddContact,
    cashuBalance,
    cashuTotalBalance,
    bankPaymentOfferMessages,
    chatOwnPubkeyHex,
    contactsOnboardingCelebrating,
    contactsOnboardingTasks,
    contactsSearch,
    contactsSearchInputRef,
    contactFilterOptions,
    contactsToolbarStyle,
    conversationsLabel,
    dismissContactsOnboarding,
    dismissWalletWarning,
    handleMainSwipeScroll,
    handleMainSwipeTabChange,
    mainSwipeRef,
    openNewContactPage,
    openProfileQr,
    openWalletScan,
    otherContactsLabel,
    nostrPictureByNpub,
    renderContactCard,
    route,
    scanIsOpen,
    setActiveGroup,
    setContactsSearch,
    showContactsOnboarding,
    showWalletWarning,
    showGroupFilter,
    showProfileQrOnTiltEnabled,
    startContactsGuide,
    t,
    visibleContacts,
  } = mainSwipeProps;
  const { formatDisplayedAmountText } = useAppShellCore();

  useShowProfileQrOnTilt({
    enabled:
      showProfileQrOnTiltEnabled &&
      (route.kind === "contacts" || route.kind === "wallet") &&
      !scanIsOpen,
    onShowProfileQr: openProfileQr,
  });

  return (
    <>
      <div
        className="main-swipe"
        ref={mainSwipeRef}
        onScroll={handleMainSwipeScroll}
      >
        <div
          className="main-swipe-page main-swipe-contacts-page"
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
            filterOptions={contactFilterOptions}
            visibleContacts={visibleContacts}
            conversationsLabel={conversationsLabel}
            otherContactsLabel={otherContactsLabel}
            renderContactCard={renderContactCard}
            bottomTabActive={bottomTabActive}
            canAddContact={canAddContact}
            openNewContactPage={openNewContactPage}
            showBottomTabBar={false}
            showFab={false}
            t={t}
          />
        </div>
        <div className="main-swipe-page" aria-hidden={route.kind !== "wallet"}>
          <WalletPage
            cashuBalance={cashuBalance}
            cashuTotalBalance={cashuTotalBalance}
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
      <BankPaymentOfferBanner
        contacts={mainSwipeProps.contacts}
        formatDisplayedAmountText={formatDisplayedAmountText}
        messages={bankPaymentOfferMessages}
        myPubkeyHex={chatOwnPubkeyHex}
        nostrPictureByNpub={nostrPictureByNpub}
        t={t}
      />
      <MainSwipeBottomTabBar
        activeTab={bottomTabActive}
        contactsLabel={t("contactsTitle")}
        onTabChange={handleMainSwipeTabChange}
        t={t}
        walletLabel={t("wallet")}
      />
      <MainSwipeFab
        canAddContact={canAddContact}
        label={t("addContact")}
        onClick={openNewContactPage}
      />
    </>
  );
};
