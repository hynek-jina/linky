import type { PeopleRoutesProps } from "../AppRouteContent";

interface BuildPeopleRoutePropsParams {
  allowPromisesEnabled: PeopleRoutesProps["chatProps"]["allowPromisesEnabled"];
  cashuBalance: PeopleRoutesProps["chatProps"]["cashuBalance"];
  cashuIsBusy: PeopleRoutesProps["chatProps"]["cashuIsBusy"];
  chatDraft: PeopleRoutesProps["chatProps"]["chatDraft"];
  chatMessageElByIdRef: PeopleRoutesProps["chatProps"]["chatMessageElByIdRef"];
  chatMessages: PeopleRoutesProps["chatProps"]["chatMessages"];
  chatMessagesRef: PeopleRoutesProps["chatProps"]["chatMessagesRef"];
  chatSendIsBusy: PeopleRoutesProps["chatProps"]["chatSendIsBusy"];
  contactEditsSavable: PeopleRoutesProps["contactEditProps"]["contactEditsSavable"];
  contactPayMethod: PeopleRoutesProps["contactPayProps"]["contactPayMethod"];
  copyText: PeopleRoutesProps["profileProps"]["copyText"];
  currentNpub: PeopleRoutesProps["profileProps"]["currentNpub"];
  derivedProfile: PeopleRoutesProps["profileProps"]["derivedProfile"];
  displayUnit: PeopleRoutesProps["contactPayProps"]["displayUnit"];
  editingId: PeopleRoutesProps["contactEditProps"]["editingId"];
  effectiveMyLightningAddress: PeopleRoutesProps["profileProps"]["effectiveMyLightningAddress"];
  effectiveProfileName: PeopleRoutesProps["profileProps"]["effectiveProfileName"];
  effectiveProfilePicture: PeopleRoutesProps["profileProps"]["effectiveProfilePicture"];
  feedbackContactNpub: PeopleRoutesProps["chatProps"]["feedbackContactNpub"];
  form: PeopleRoutesProps["contactEditProps"]["form"];
  getCashuTokenMessageInfo: PeopleRoutesProps["chatProps"]["getCashuTokenMessageInfo"];
  getCredoAvailableForContact: PeopleRoutesProps["chatProps"]["getCredoAvailableForContact"];
  getCredoTokenMessageInfo: PeopleRoutesProps["chatProps"]["getCredoTokenMessageInfo"];
  getMintIconUrl: PeopleRoutesProps["chatProps"]["getMintIconUrl"];
  groupNames: PeopleRoutesProps["contactEditProps"]["groupNames"];
  handleSaveContact: PeopleRoutesProps["contactEditProps"]["handleSaveContact"];
  isProfileEditing: PeopleRoutesProps["profileProps"]["isProfileEditing"];
  isSavingContact: PeopleRoutesProps["contactEditProps"]["isSavingContact"];
  lang: PeopleRoutesProps["chatProps"]["lang"];
  myProfileQr: PeopleRoutesProps["profileProps"]["myProfileQr"];
  nostrPictureByNpub: PeopleRoutesProps["chatProps"]["nostrPictureByNpub"];
  onPickProfilePhoto: PeopleRoutesProps["profileProps"]["onPickProfilePhoto"];
  onProfilePhotoSelected: PeopleRoutesProps["profileProps"]["onProfilePhotoSelected"];
  openContactPay: PeopleRoutesProps["chatProps"]["openContactPay"];
  openScan: PeopleRoutesProps["contactNewProps"]["openScan"];
  payAmount: PeopleRoutesProps["contactPayProps"]["payAmount"];
  paySelectedContact: PeopleRoutesProps["contactPayProps"]["paySelectedContact"];
  payWithCashuEnabled: PeopleRoutesProps["chatProps"]["payWithCashuEnabled"];
  pendingDeleteId: PeopleRoutesProps["contactEditProps"]["pendingDeleteId"];
  profileEditLnAddress: PeopleRoutesProps["profileProps"]["profileEditLnAddress"];
  profileEditName: PeopleRoutesProps["profileProps"]["profileEditName"];
  profileEditPicture: PeopleRoutesProps["profileProps"]["profileEditPicture"];
  profileEditsSavable: PeopleRoutesProps["profileProps"]["profileEditsSavable"];
  profilePhotoInputRef: PeopleRoutesProps["profileProps"]["profilePhotoInputRef"];
  promiseTotalCapSat: PeopleRoutesProps["contactPayProps"]["promiseTotalCapSat"];
  requestDeleteCurrentContact: PeopleRoutesProps["contactEditProps"]["requestDeleteCurrentContact"];
  resetEditedContactFieldFromNostr: PeopleRoutesProps["contactEditProps"]["resetEditedContactFieldFromNostr"];
  saveProfileEdits: PeopleRoutesProps["profileProps"]["saveProfileEdits"];
  scanIsOpen: PeopleRoutesProps["contactNewProps"]["scanIsOpen"];
  selectedContact: PeopleRoutesProps["chatProps"]["selectedContact"];
  sendChatMessage: PeopleRoutesProps["chatProps"]["sendChatMessage"];
  setChatDraft: PeopleRoutesProps["chatProps"]["setChatDraft"];
  setContactPayMethod: PeopleRoutesProps["contactPayProps"]["setContactPayMethod"];
  setForm: PeopleRoutesProps["contactEditProps"]["setForm"];
  setMintIconUrlByMint: PeopleRoutesProps["chatProps"]["setMintIconUrlByMint"];
  setPayAmount: PeopleRoutesProps["contactPayProps"]["setPayAmount"];
  setProfileEditLnAddress: PeopleRoutesProps["profileProps"]["setProfileEditLnAddress"];
  setProfileEditName: PeopleRoutesProps["profileProps"]["setProfileEditName"];
  setProfileEditPicture: PeopleRoutesProps["profileProps"]["setProfileEditPicture"];
  t: PeopleRoutesProps["chatProps"]["t"];
  totalCredoOutstandingOut: PeopleRoutesProps["contactPayProps"]["totalCredoOutstandingOut"];
}

export const buildPeopleRouteProps = ({
  allowPromisesEnabled,
  cashuBalance,
  cashuIsBusy,
  chatDraft,
  chatMessageElByIdRef,
  chatMessages,
  chatMessagesRef,
  chatSendIsBusy,
  contactEditsSavable,
  contactPayMethod,
  copyText,
  currentNpub,
  derivedProfile,
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
  handleSaveContact,
  isProfileEditing,
  isSavingContact,
  lang,
  myProfileQr,
  nostrPictureByNpub,
  onPickProfilePhoto,
  onProfilePhotoSelected,
  openContactPay,
  openScan,
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
  requestDeleteCurrentContact,
  resetEditedContactFieldFromNostr,
  saveProfileEdits,
  scanIsOpen,
  selectedContact,
  sendChatMessage,
  setChatDraft,
  setContactPayMethod,
  setForm,
  setMintIconUrlByMint,
  setPayAmount,
  setProfileEditLnAddress,
  setProfileEditName,
  setProfileEditPicture,
  t,
  totalCredoOutstandingOut,
}: BuildPeopleRoutePropsParams): PeopleRoutesProps => {
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
