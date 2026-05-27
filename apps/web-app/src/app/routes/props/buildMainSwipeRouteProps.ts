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
  contactsToolbarStyle: MainSwipeRoutesProps["mainSwipeProps"]["contactsToolbarStyle"];
  conversationsLabel: MainSwipeRoutesProps["mainSwipeProps"]["conversationsLabel"];
  dismissContactsOnboarding: MainSwipeRoutesProps["mainSwipeProps"]["dismissContactsOnboarding"];
  dismissWalletWarning: MainSwipeRoutesProps["mainSwipeProps"]["dismissWalletWarning"];
  groupNames: MainSwipeRoutesProps["mainSwipeProps"]["groupNames"];
  handleMainSwipePointerCancel: MainSwipeRoutesProps["mainSwipeProps"]["handleMainSwipePointerCancel"];
  handleMainSwipePointerDown: MainSwipeRoutesProps["mainSwipeProps"]["handleMainSwipePointerDown"];
  handleMainSwipePointerMove: MainSwipeRoutesProps["mainSwipeProps"]["handleMainSwipePointerMove"];
  handleMainSwipePointerUp: MainSwipeRoutesProps["mainSwipeProps"]["handleMainSwipePointerUp"];
  handleMainSwipeScroll: MainSwipeRoutesProps["mainSwipeProps"]["handleMainSwipeScroll"];
  handleMainSwipeTouchCancel: MainSwipeRoutesProps["mainSwipeProps"]["handleMainSwipeTouchCancel"];
  handleMainSwipeTouchEnd: MainSwipeRoutesProps["mainSwipeProps"]["handleMainSwipeTouchEnd"];
  handleMainSwipeTouchMove: MainSwipeRoutesProps["mainSwipeProps"]["handleMainSwipeTouchMove"];
  handleMainSwipeTouchStart: MainSwipeRoutesProps["mainSwipeProps"]["handleMainSwipeTouchStart"];
  handleMainSwipeTabChange: MainSwipeRoutesProps["mainSwipeProps"]["handleMainSwipeTabChange"];
  isMainSwipeDragging: MainSwipeRoutesProps["mainSwipeProps"]["isMainSwipeDragging"];
  mainSwipeProgress: MainSwipeRoutesProps["mainSwipeProps"]["mainSwipeProgress"];
  mainSwipeRef: MainSwipeRoutesProps["mainSwipeProps"]["mainSwipeRef"];
  NO_GROUP_FILTER: MainSwipeRoutesProps["mainSwipeProps"]["NO_GROUP_FILTER"];
  openNewContactPage: MainSwipeRoutesProps["mainSwipeProps"]["openNewContactPage"];
  openScan: MainSwipeRoutesProps["mainSwipeProps"]["openScan"];
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
  showNoGroupFilter: MainSwipeRoutesProps["mainSwipeProps"]["showNoGroupFilter"];
  statusFilterCurrencies: MainSwipeRoutesProps["mainSwipeProps"]["statusFilterCurrencies"];
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
  contactsToolbarStyle,
  conversationsLabel,
  dismissContactsOnboarding,
  dismissWalletWarning,
  groupNames,
  handleMainSwipePointerCancel,
  handleMainSwipePointerDown,
  handleMainSwipePointerMove,
  handleMainSwipePointerUp,
  handleMainSwipeScroll,
  handleMainSwipeTouchCancel,
  handleMainSwipeTouchEnd,
  handleMainSwipeTouchMove,
  handleMainSwipeTouchStart,
  handleMainSwipeTabChange,
  isMainSwipeDragging,
  mainSwipeProgress,
  mainSwipeRef,
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
      contactsToolbarStyle,
      conversationsLabel,
      dismissContactsOnboarding,
      dismissWalletWarning,
      groupNames,
      handleMainSwipePointerCancel,
      handleMainSwipePointerDown,
      handleMainSwipePointerMove,
      handleMainSwipePointerUp,
      handleMainSwipeScroll,
      handleMainSwipeTouchCancel,
      handleMainSwipeTouchEnd,
      handleMainSwipeTouchMove,
      handleMainSwipeTouchStart,
      handleMainSwipeTabChange,
      isMainSwipeDragging,
      mainSwipeProgress,
      mainSwipeRef,
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
    },
  };
};
