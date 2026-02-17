import type { MainSwipeRoutesProps } from "../AppRouteContent";

interface BuildMainSwipeRoutePropsParams {
  activeGroup: MainSwipeRoutesProps["mainSwipeProps"]["activeGroup"];
  bottomTabActive: MainSwipeRoutesProps["mainSwipeProps"]["bottomTabActive"];
  canAddContact: MainSwipeRoutesProps["mainSwipeProps"]["canAddContact"];
  cashuBalance: MainSwipeRoutesProps["mainSwipeProps"]["cashuBalance"];
  contacts: MainSwipeRoutesProps["mainSwipeProps"]["contacts"];
  contactsOnboardingCelebrating: MainSwipeRoutesProps["mainSwipeProps"]["contactsOnboardingCelebrating"];
  contactsOnboardingTasks: MainSwipeRoutesProps["mainSwipeProps"]["contactsOnboardingTasks"];
  contactsSearch: MainSwipeRoutesProps["mainSwipeProps"]["contactsSearch"];
  contactsSearchInputRef: MainSwipeRoutesProps["mainSwipeProps"]["contactsSearchInputRef"];
  contactsToolbarStyle: MainSwipeRoutesProps["mainSwipeProps"]["contactsToolbarStyle"];
  conversationsLabel: MainSwipeRoutesProps["mainSwipeProps"]["conversationsLabel"];
  displayUnit: MainSwipeRoutesProps["mainSwipeProps"]["displayUnit"];
  dismissContactsOnboarding: MainSwipeRoutesProps["mainSwipeProps"]["dismissContactsOnboarding"];
  groupNames: MainSwipeRoutesProps["mainSwipeProps"]["groupNames"];
  handleMainSwipeScroll: MainSwipeRoutesProps["mainSwipeProps"]["handleMainSwipeScroll"];
  mainSwipeProgress: MainSwipeRoutesProps["mainSwipeProps"]["mainSwipeProgress"];
  mainSwipeRef: MainSwipeRoutesProps["mainSwipeProps"]["mainSwipeRef"];
  mainSwipeScrollY: MainSwipeRoutesProps["mainSwipeProps"]["mainSwipeScrollY"];
  NO_GROUP_FILTER: MainSwipeRoutesProps["mainSwipeProps"]["NO_GROUP_FILTER"];
  openNewContactPage: MainSwipeRoutesProps["mainSwipeProps"]["openNewContactPage"];
  openScan: MainSwipeRoutesProps["mainSwipeProps"]["openScan"];
  otherContactsLabel: MainSwipeRoutesProps["mainSwipeProps"]["otherContactsLabel"];
  renderContactCard: MainSwipeRoutesProps["mainSwipeProps"]["renderContactCard"];
  route: MainSwipeRoutesProps["mainSwipeProps"]["route"];
  scanIsOpen: MainSwipeRoutesProps["mainSwipeProps"]["scanIsOpen"];
  setActiveGroup: MainSwipeRoutesProps["mainSwipeProps"]["setActiveGroup"];
  setContactsSearch: MainSwipeRoutesProps["mainSwipeProps"]["setContactsSearch"];
  showContactsOnboarding: MainSwipeRoutesProps["mainSwipeProps"]["showContactsOnboarding"];
  showGroupFilter: MainSwipeRoutesProps["mainSwipeProps"]["showGroupFilter"];
  showNoGroupFilter: MainSwipeRoutesProps["mainSwipeProps"]["showNoGroupFilter"];
  startContactsGuide: MainSwipeRoutesProps["mainSwipeProps"]["startContactsGuide"];
  t: MainSwipeRoutesProps["mainSwipeProps"]["t"];
  visibleContacts: MainSwipeRoutesProps["mainSwipeProps"]["visibleContacts"];
}

export const buildMainSwipeRouteProps = ({
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
}: BuildMainSwipeRoutePropsParams): MainSwipeRoutesProps => {
  return {
    mainSwipeProps: {
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
    },
  };
};
