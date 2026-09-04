import type { MainSwipeRoutesProps } from "../AppRouteContent";

interface BuildMainSwipeRoutePropsParams {
  activeGroup: MainSwipeRoutesProps["mainSwipeProps"]["activeGroup"];
  bottomTabActive: MainSwipeRoutesProps["mainSwipeProps"]["bottomTabActive"];
  canAddContact: MainSwipeRoutesProps["mainSwipeProps"]["canAddContact"];
  cashuTotalBalance: MainSwipeRoutesProps["mainSwipeProps"]["cashuTotalBalance"];
  bankPaymentOfferMessages: MainSwipeRoutesProps["mainSwipeProps"]["bankPaymentOfferMessages"];
  contactsOnboardingCelebrating: MainSwipeRoutesProps["mainSwipeProps"]["contactsOnboardingCelebrating"];
  contactsOnboardingTasks: MainSwipeRoutesProps["mainSwipeProps"]["contactsOnboardingTasks"];
  contactsSearch: MainSwipeRoutesProps["mainSwipeProps"]["contactsSearch"];
  contactsSearchInputRef: MainSwipeRoutesProps["mainSwipeProps"]["contactsSearchInputRef"];
  contactFilterOptions: MainSwipeRoutesProps["mainSwipeProps"]["contactFilterOptions"];
  conversationsLabel: MainSwipeRoutesProps["mainSwipeProps"]["conversationsLabel"];
  dismissContactsOnboarding: MainSwipeRoutesProps["mainSwipeProps"]["dismissContactsOnboarding"];
  dismissWalletWarning: MainSwipeRoutesProps["mainSwipeProps"]["dismissWalletWarning"];
  handleMainSwipeTabChange: MainSwipeRoutesProps["mainSwipeProps"]["handleMainSwipeTabChange"];
  mainSwipeRef: MainSwipeRoutesProps["mainSwipeProps"]["mainSwipeRef"];
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
  cashuTotalBalance,
  bankPaymentOfferMessages,
  contactsOnboardingCelebrating,
  contactsOnboardingTasks,
  contactsSearch,
  contactsSearchInputRef,
  contactFilterOptions,
  conversationsLabel,
  dismissContactsOnboarding,
  dismissWalletWarning,
  handleMainSwipeTabChange,
  mainSwipeRef,
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
      cashuTotalBalance,
      bankPaymentOfferMessages,
      contactsOnboardingCelebrating,
      contactsOnboardingTasks,
      contactsSearch,
      contactsSearchInputRef,
      contactFilterOptions,
      conversationsLabel,
      dismissContactsOnboarding,
      dismissWalletWarning,
      handleMainSwipeTabChange,
      mainSwipeRef,
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
