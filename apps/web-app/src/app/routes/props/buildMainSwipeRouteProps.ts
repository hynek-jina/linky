import type { MainSwipeRoutesProps } from "../AppRouteContent";

interface BuildMainSwipeRoutePropsParams {
  activeGroup: MainSwipeRoutesProps["mainSwipeProps"]["activeGroup"];
  bottomTabActive: MainSwipeRoutesProps["mainSwipeProps"]["bottomTabActive"];
  canAddContact: MainSwipeRoutesProps["mainSwipeProps"]["canAddContact"];
  cashuBalance: MainSwipeRoutesProps["mainSwipeProps"]["cashuBalance"];
  cashuTotalBalance: MainSwipeRoutesProps["mainSwipeProps"]["cashuTotalBalance"];
  contacts: MainSwipeRoutesProps["mainSwipeProps"]["contacts"];
  contactsOnboardingCelebrating: MainSwipeRoutesProps["mainSwipeProps"]["contactsOnboardingCelebrating"];
  contactsOnboardingTasks: MainSwipeRoutesProps["mainSwipeProps"]["contactsOnboardingTasks"];
  contactsSearch: MainSwipeRoutesProps["mainSwipeProps"]["contactsSearch"];
  contactsSearchInputRef: MainSwipeRoutesProps["mainSwipeProps"]["contactsSearchInputRef"];
  contactFilterOptions: MainSwipeRoutesProps["mainSwipeProps"]["contactFilterOptions"];
  contactsToolbarStyle: MainSwipeRoutesProps["mainSwipeProps"]["contactsToolbarStyle"];
  conversationsLabel: MainSwipeRoutesProps["mainSwipeProps"]["conversationsLabel"];
  dismissContactsOnboarding: MainSwipeRoutesProps["mainSwipeProps"]["dismissContactsOnboarding"];
  dismissWalletWarning: MainSwipeRoutesProps["mainSwipeProps"]["dismissWalletWarning"];
  handleMainSwipeScroll: MainSwipeRoutesProps["mainSwipeProps"]["handleMainSwipeScroll"];
  handleMainSwipeTabChange: MainSwipeRoutesProps["mainSwipeProps"]["handleMainSwipeTabChange"];
  isMainSwipeDragging: MainSwipeRoutesProps["mainSwipeProps"]["isMainSwipeDragging"];
  mainSwipeProgress: MainSwipeRoutesProps["mainSwipeProps"]["mainSwipeProgress"];
  mainSwipeRef: MainSwipeRoutesProps["mainSwipeProps"]["mainSwipeRef"];
  closeProfileQr: MainSwipeRoutesProps["mainSwipeProps"]["closeProfileQr"];
  openNewContactPage: MainSwipeRoutesProps["mainSwipeProps"]["openNewContactPage"];
  openProfileQr: MainSwipeRoutesProps["mainSwipeProps"]["openProfileQr"];
  openWalletScan: MainSwipeRoutesProps["mainSwipeProps"]["openWalletScan"];
  otherContactsLabel: MainSwipeRoutesProps["mainSwipeProps"]["otherContactsLabel"];
  renderContactCard: MainSwipeRoutesProps["mainSwipeProps"]["renderContactCard"];
  route: MainSwipeRoutesProps["mainSwipeProps"]["route"];
  scanIsOpen: MainSwipeRoutesProps["mainSwipeProps"]["scanIsOpen"];
  setActiveGroup: MainSwipeRoutesProps["mainSwipeProps"]["setActiveGroup"];
  setContactsSearch: MainSwipeRoutesProps["mainSwipeProps"]["setContactsSearch"];
  showContactsOnboarding: MainSwipeRoutesProps["mainSwipeProps"]["showContactsOnboarding"];
  showWalletWarning: MainSwipeRoutesProps["mainSwipeProps"]["showWalletWarning"];
  showGroupFilter: MainSwipeRoutesProps["mainSwipeProps"]["showGroupFilter"];
  showProfileQrOnTiltEnabled: MainSwipeRoutesProps["mainSwipeProps"]["showProfileQrOnTiltEnabled"];
  startContactsGuide: MainSwipeRoutesProps["mainSwipeProps"]["startContactsGuide"];
  t: MainSwipeRoutesProps["mainSwipeProps"]["t"];
  visibleContacts: MainSwipeRoutesProps["mainSwipeProps"]["visibleContacts"];
}

export const buildMainSwipeRouteProps = ({
  activeGroup,
  bottomTabActive,
  canAddContact,
  cashuBalance,
  cashuTotalBalance,
  contacts,
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
  isMainSwipeDragging,
  mainSwipeProgress,
  mainSwipeRef,
  closeProfileQr,
  openNewContactPage,
  openProfileQr,
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
  showProfileQrOnTiltEnabled,
  startContactsGuide,
  t,
  visibleContacts,
}: BuildMainSwipeRoutePropsParams): MainSwipeRoutesProps => {
  return {
    mainSwipeProps: {
      activeGroup,
      bottomTabActive,
      canAddContact,
      cashuBalance,
      cashuTotalBalance,
      contacts,
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
      isMainSwipeDragging,
      mainSwipeProgress,
      mainSwipeRef,
      closeProfileQr,
      openNewContactPage,
      openProfileQr,
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
      showProfileQrOnTiltEnabled,
      startContactsGuide,
      t,
      visibleContacts,
    },
  };
};
