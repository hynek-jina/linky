import type { AppRouteContentProps } from "../AppRouteContent";

type PeopleRouteProps = Pick<
  AppRouteContentProps,
  | "chatProps"
  | "contactEditProps"
  | "contactNewProps"
  | "contactPayProps"
  | "contactProps"
  | "mainSwipeProps"
  | "profileProps"
>;

interface BuildPeopleRoutePropsParams {
  activeGroup: AppRouteContentProps["mainSwipeProps"]["activeGroup"];
  allowPromisesEnabled: AppRouteContentProps["chatProps"]["allowPromisesEnabled"];
  cashuBalance: AppRouteContentProps["chatProps"]["cashuBalance"];
  cashuIsBusy: AppRouteContentProps["chatProps"]["cashuIsBusy"];
  chatDraft: AppRouteContentProps["chatProps"]["chatDraft"];
  chatMessageElByIdRef: AppRouteContentProps["chatProps"]["chatMessageElByIdRef"];
  chatMessages: AppRouteContentProps["chatProps"]["chatMessages"];
  chatMessagesRef: AppRouteContentProps["chatProps"]["chatMessagesRef"];
  chatSendIsBusy: AppRouteContentProps["chatProps"]["chatSendIsBusy"];
  contactEditsSavable: AppRouteContentProps["contactEditProps"]["contactEditsSavable"];
  contactPayMethod: AppRouteContentProps["contactPayProps"]["contactPayMethod"];
  contacts: AppRouteContentProps["mainSwipeProps"]["contacts"];
  contactsOnboardingCelebrating: AppRouteContentProps["mainSwipeProps"]["contactsOnboardingCelebrating"];
  contactsOnboardingTasks: AppRouteContentProps["mainSwipeProps"]["contactsOnboardingTasks"];
  contactsSearch: AppRouteContentProps["mainSwipeProps"]["contactsSearch"];
  contactsSearchInputRef: AppRouteContentProps["mainSwipeProps"]["contactsSearchInputRef"];
  contactsToolbarStyle: AppRouteContentProps["mainSwipeProps"]["contactsToolbarStyle"];
  conversationsLabel: AppRouteContentProps["mainSwipeProps"]["conversationsLabel"];
  copyText: AppRouteContentProps["profileProps"]["copyText"];
  currentNpub: AppRouteContentProps["profileProps"]["currentNpub"];
  derivedProfile: AppRouteContentProps["profileProps"]["derivedProfile"];
  dismissContactsOnboarding: AppRouteContentProps["mainSwipeProps"]["dismissContactsOnboarding"];
  displayUnit: AppRouteContentProps["mainSwipeProps"]["displayUnit"];
  editingId: AppRouteContentProps["contactEditProps"]["editingId"];
  effectiveMyLightningAddress: AppRouteContentProps["profileProps"]["effectiveMyLightningAddress"];
  effectiveProfileName: AppRouteContentProps["profileProps"]["effectiveProfileName"];
  effectiveProfilePicture: AppRouteContentProps["profileProps"]["effectiveProfilePicture"];
  feedbackContactNpub: AppRouteContentProps["chatProps"]["feedbackContactNpub"];
  form: AppRouteContentProps["contactEditProps"]["form"];
  getCashuTokenMessageInfo: AppRouteContentProps["chatProps"]["getCashuTokenMessageInfo"];
  getCredoAvailableForContact: AppRouteContentProps["chatProps"]["getCredoAvailableForContact"];
  getCredoTokenMessageInfo: AppRouteContentProps["chatProps"]["getCredoTokenMessageInfo"];
  getMintIconUrl: AppRouteContentProps["chatProps"]["getMintIconUrl"];
  groupNames: AppRouteContentProps["contactEditProps"]["groupNames"];
  handleMainSwipeScroll: AppRouteContentProps["mainSwipeProps"]["handleMainSwipeScroll"];
  handleSaveContact: AppRouteContentProps["contactEditProps"]["handleSaveContact"];
  isProfileEditing: AppRouteContentProps["profileProps"]["isProfileEditing"];
  isSavingContact: AppRouteContentProps["contactEditProps"]["isSavingContact"];
  lang: AppRouteContentProps["chatProps"]["lang"];
  mainSwipeProgress: AppRouteContentProps["mainSwipeProps"]["mainSwipeProgress"];
  mainSwipeRef: AppRouteContentProps["mainSwipeProps"]["mainSwipeRef"];
  mainSwipeScrollY: AppRouteContentProps["mainSwipeProps"]["mainSwipeScrollY"];
  myProfileQr: AppRouteContentProps["profileProps"]["myProfileQr"];
  NO_GROUP_FILTER: AppRouteContentProps["mainSwipeProps"]["NO_GROUP_FILTER"];
  nostrPictureByNpub: AppRouteContentProps["chatProps"]["nostrPictureByNpub"];
  onPickProfilePhoto: AppRouteContentProps["profileProps"]["onPickProfilePhoto"];
  onProfilePhotoSelected: AppRouteContentProps["profileProps"]["onProfilePhotoSelected"];
  openContactPay: AppRouteContentProps["chatProps"]["openContactPay"];
  openNewContactPage: AppRouteContentProps["mainSwipeProps"]["openNewContactPage"];
  openScan: AppRouteContentProps["mainSwipeProps"]["openScan"];
  otherContactsLabel: AppRouteContentProps["mainSwipeProps"]["otherContactsLabel"];
  payAmount: AppRouteContentProps["contactPayProps"]["payAmount"];
  paySelectedContact: AppRouteContentProps["contactPayProps"]["paySelectedContact"];
  payWithCashuEnabled: AppRouteContentProps["chatProps"]["payWithCashuEnabled"];
  pendingDeleteId: AppRouteContentProps["contactEditProps"]["pendingDeleteId"];
  profileEditLnAddress: AppRouteContentProps["profileProps"]["profileEditLnAddress"];
  profileEditName: AppRouteContentProps["profileProps"]["profileEditName"];
  profileEditPicture: AppRouteContentProps["profileProps"]["profileEditPicture"];
  profileEditsSavable: AppRouteContentProps["profileProps"]["profileEditsSavable"];
  profilePhotoInputRef: AppRouteContentProps["profileProps"]["profilePhotoInputRef"];
  promiseTotalCapSat: AppRouteContentProps["contactPayProps"]["promiseTotalCapSat"];
  renderContactCard: AppRouteContentProps["mainSwipeProps"]["renderContactCard"];
  requestDeleteCurrentContact: AppRouteContentProps["contactEditProps"]["requestDeleteCurrentContact"];
  resetEditedContactFieldFromNostr: AppRouteContentProps["contactEditProps"]["resetEditedContactFieldFromNostr"];
  route: AppRouteContentProps["route"];
  saveProfileEdits: AppRouteContentProps["profileProps"]["saveProfileEdits"];
  scanIsOpen: AppRouteContentProps["contactNewProps"]["scanIsOpen"];
  selectedContact: AppRouteContentProps["chatProps"]["selectedContact"];
  sendChatMessage: AppRouteContentProps["chatProps"]["sendChatMessage"];
  setActiveGroup: AppRouteContentProps["mainSwipeProps"]["setActiveGroup"];
  setChatDraft: AppRouteContentProps["chatProps"]["setChatDraft"];
  setContactPayMethod: AppRouteContentProps["contactPayProps"]["setContactPayMethod"];
  setContactsSearch: AppRouteContentProps["mainSwipeProps"]["setContactsSearch"];
  setForm: AppRouteContentProps["contactEditProps"]["setForm"];
  setMintIconUrlByMint: AppRouteContentProps["chatProps"]["setMintIconUrlByMint"];
  setPayAmount: AppRouteContentProps["contactPayProps"]["setPayAmount"];
  setProfileEditLnAddress: AppRouteContentProps["profileProps"]["setProfileEditLnAddress"];
  setProfileEditName: AppRouteContentProps["profileProps"]["setProfileEditName"];
  setProfileEditPicture: AppRouteContentProps["profileProps"]["setProfileEditPicture"];
  showContactsOnboarding: AppRouteContentProps["mainSwipeProps"]["showContactsOnboarding"];
  showGroupFilter: AppRouteContentProps["mainSwipeProps"]["showGroupFilter"];
  showNoGroupFilter: AppRouteContentProps["mainSwipeProps"]["showNoGroupFilter"];
  startContactsGuide: AppRouteContentProps["mainSwipeProps"]["startContactsGuide"];
  t: AppRouteContentProps["chatProps"]["t"];
  totalCredoOutstandingOut: AppRouteContentProps["contactPayProps"]["totalCredoOutstandingOut"];
  visibleContacts: AppRouteContentProps["mainSwipeProps"]["visibleContacts"];
  bottomTabActive: AppRouteContentProps["mainSwipeProps"]["bottomTabActive"];
}

export const buildPeopleRouteProps = ({
  activeGroup,
  allowPromisesEnabled,
  bottomTabActive,
  cashuBalance,
  cashuIsBusy,
  chatDraft,
  chatMessageElByIdRef,
  chatMessages,
  chatMessagesRef,
  chatSendIsBusy,
  contactEditsSavable,
  contactPayMethod,
  contacts,
  contactsOnboardingCelebrating,
  contactsOnboardingTasks,
  contactsSearch,
  contactsSearchInputRef,
  contactsToolbarStyle,
  conversationsLabel,
  copyText,
  currentNpub,
  derivedProfile,
  dismissContactsOnboarding,
  displayUnit,
  editingId,
  effectiveMyLightningAddress,
  effectiveProfileName,
  effectiveProfilePicture,
  feedbackContactNpub,
  form,
  getCashuTokenMessageInfo,
  getCredoAvailableForContact,
  getCredoTokenMessageInfo,
  getMintIconUrl,
  groupNames,
  handleMainSwipeScroll,
  handleSaveContact,
  isProfileEditing,
  isSavingContact,
  lang,
  mainSwipeProgress,
  mainSwipeRef,
  mainSwipeScrollY,
  myProfileQr,
  NO_GROUP_FILTER,
  nostrPictureByNpub,
  onPickProfilePhoto,
  onProfilePhotoSelected,
  openContactPay,
  openNewContactPage,
  openScan,
  otherContactsLabel,
  payAmount,
  paySelectedContact,
  payWithCashuEnabled,
  pendingDeleteId,
  profileEditLnAddress,
  profileEditName,
  profileEditPicture,
  profileEditsSavable,
  profilePhotoInputRef,
  promiseTotalCapSat,
  renderContactCard,
  requestDeleteCurrentContact,
  resetEditedContactFieldFromNostr,
  route,
  saveProfileEdits,
  scanIsOpen,
  selectedContact,
  sendChatMessage,
  setActiveGroup,
  setChatDraft,
  setContactPayMethod,
  setContactsSearch,
  setForm,
  setMintIconUrlByMint,
  setPayAmount,
  setProfileEditLnAddress,
  setProfileEditName,
  setProfileEditPicture,
  showContactsOnboarding,
  showGroupFilter,
  showNoGroupFilter,
  startContactsGuide,
  t,
  totalCredoOutstandingOut,
  visibleContacts,
}: BuildPeopleRoutePropsParams): PeopleRouteProps => {
  return {
    chatProps: {
      selectedContact,
      chatMessages,
      chatMessagesRef,
      chatDraft,
      setChatDraft,
      chatSendIsBusy,
      cashuBalance,
      cashuIsBusy,
      payWithCashuEnabled,
      allowPromisesEnabled,
      feedbackContactNpub,
      lang,
      nostrPictureByNpub,
      setMintIconUrlByMint,
      chatMessageElByIdRef,
      getCashuTokenMessageInfo,
      getCredoTokenMessageInfo,
      getMintIconUrl,
      getCredoAvailableForContact,
      sendChatMessage,
      openContactPay,
      t,
    },
    contactEditProps: {
      selectedContact,
      form,
      setForm,
      groupNames,
      editingId,
      contactEditsSavable,
      pendingDeleteId,
      handleSaveContact,
      isSavingContact,
      requestDeleteCurrentContact,
      resetEditedContactFieldFromNostr,
      t,
    },
    contactNewProps: {
      form,
      setForm,
      groupNames,
      scanIsOpen,
      handleSaveContact,
      isSavingContact,
      openScan,
      t,
    },
    contactPayProps: {
      selectedContact,
      nostrPictureByNpub,
      cashuBalance,
      totalCredoOutstandingOut,
      promiseTotalCapSat,
      cashuIsBusy,
      payWithCashuEnabled,
      allowPromisesEnabled,
      contactPayMethod,
      setContactPayMethod,
      payAmount,
      setPayAmount,
      displayUnit,
      getCredoAvailableForContact,
      paySelectedContact,
      t,
    },
    contactProps: {
      selectedContact,
      nostrPictureByNpub,
      cashuBalance,
      cashuIsBusy,
      payWithCashuEnabled,
      allowPromisesEnabled,
      feedbackContactNpub,
      getCredoAvailableForContact,
      openContactPay,
      t,
    },
    mainSwipeProps: {
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
      groupNames,
      mainSwipeProgress,
      mainSwipeRef,
      mainSwipeScrollY,
      NO_GROUP_FILTER,
      otherContactsLabel,
      route,
      scanIsOpen,
      showContactsOnboarding,
      showGroupFilter,
      showNoGroupFilter,
      t,
      visibleContacts,
      dismissContactsOnboarding,
      handleMainSwipeScroll,
      openNewContactPage,
      openScan,
      renderContactCard,
      setActiveGroup,
      setContactsSearch,
      startContactsGuide,
    },
    profileProps: {
      currentNpub,
      isProfileEditing,
      profileEditPicture,
      effectiveProfilePicture,
      effectiveProfileName,
      profileEditName,
      profileEditLnAddress,
      derivedProfile,
      profileEditsSavable,
      myProfileQr,
      effectiveMyLightningAddress,
      profilePhotoInputRef,
      setProfileEditPicture,
      setProfileEditName,
      setProfileEditLnAddress,
      onProfilePhotoSelected,
      onPickProfilePhoto,
      saveProfileEdits,
      copyText,
      t,
    },
  };
};
