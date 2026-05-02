import type { PeopleRoutesProps } from "../AppRouteContent";

interface BuildPeopleRoutePropsParams {
  cashuBalance: PeopleRoutesProps["chatProps"]["cashuBalance"];
  cashuIsBusy: PeopleRoutesProps["chatProps"]["cashuIsBusy"];
  chatSelectedContact: PeopleRoutesProps["chatProps"]["selectedContact"];
  chatDraft: PeopleRoutesProps["chatProps"]["chatDraft"];
  chatMessageElByIdRef: PeopleRoutesProps["chatProps"]["chatMessageElByIdRef"];
  chatMessages: PeopleRoutesProps["chatProps"]["chatMessages"];
  chatMessagesRef: PeopleRoutesProps["chatProps"]["chatMessagesRef"];
  chatOwnPubkeyHex: PeopleRoutesProps["chatProps"]["chatOwnPubkeyHex"];
  chatSendIsBusy: PeopleRoutesProps["chatProps"]["chatSendIsBusy"];
  contactEditsSavable: PeopleRoutesProps["contactEditProps"]["contactEditsSavable"];
  contactPaymentIntent: PeopleRoutesProps["contactPayProps"]["contactPaymentIntent"];
  contactPayMethod: PeopleRoutesProps["contactPayProps"]["contactPayMethod"];
  copyText: PeopleRoutesProps["profileProps"]["copyText"];
  currentNpub: PeopleRoutesProps["profileProps"]["currentNpub"];
  cycleProfileAvatarControl: PeopleRoutesProps["profileProps"]["cycleProfileAvatarControl"];
  derivedProfile: PeopleRoutesProps["profileProps"]["derivedProfile"];
  displayUnit: PeopleRoutesProps["contactPayProps"]["displayUnit"];
  editingId: PeopleRoutesProps["contactEditProps"]["editingId"];
  editContext: PeopleRoutesProps["chatProps"]["editContext"];
  effectiveMyLightningAddress: PeopleRoutesProps["profileProps"]["effectiveMyLightningAddress"];
  effectiveProfileName: PeopleRoutesProps["profileProps"]["effectiveProfileName"];
  effectiveProfilePicture: PeopleRoutesProps["profileProps"]["effectiveProfilePicture"];
  feedbackContactNpub: PeopleRoutesProps["chatProps"]["feedbackContactNpub"];
  form: PeopleRoutesProps["contactEditProps"]["form"];
  getCashuTokenMessageInfo: PeopleRoutesProps["chatProps"]["getCashuTokenMessageInfo"];
  getMintIconUrl: PeopleRoutesProps["chatProps"]["getMintIconUrl"];
  groupNames: PeopleRoutesProps["contactEditProps"]["groupNames"];
  handleSaveContact: PeopleRoutesProps["contactEditProps"]["handleSaveContact"];
  isProfileEditing: PeopleRoutesProps["profileProps"]["isProfileEditing"];
  isSavingContact: PeopleRoutesProps["contactEditProps"]["isSavingContact"];
  lang: PeopleRoutesProps["chatProps"]["lang"];
  myProfileQr: PeopleRoutesProps["profileProps"]["myProfileQr"];
  nostrPictureByNpub: PeopleRoutesProps["contactProps"]["nostrPictureByNpub"];
  onCancelEdit: PeopleRoutesProps["chatProps"]["onCancelEdit"];
  onCancelReply: PeopleRoutesProps["chatProps"]["onCancelReply"];
  onAddUnknownContact: PeopleRoutesProps["chatProps"]["onAddUnknownContact"];
  onRemoveUnknownContactChat: PeopleRoutesProps["chatProps"]["onRemoveUnknownContactChat"];
  onCopy: PeopleRoutesProps["chatProps"]["onCopy"];
  onDeclinePaymentRequest: PeopleRoutesProps["chatProps"]["onDeclinePaymentRequest"];
  onEdit: PeopleRoutesProps["chatProps"]["onEdit"];
  onPayPaymentRequest: PeopleRoutesProps["chatProps"]["onPayPaymentRequest"];
  onPickProfilePhoto: PeopleRoutesProps["profileProps"]["onPickProfilePhoto"];
  onProfilePhotoSelected: PeopleRoutesProps["profileProps"]["onProfilePhotoSelected"];
  onReact: PeopleRoutesProps["chatProps"]["onReact"];
  onReply: PeopleRoutesProps["chatProps"]["onReply"];
  openContactPay: PeopleRoutesProps["chatProps"]["openContactPay"];
  openScan: PeopleRoutesProps["contactNewProps"]["openScan"];
  payAmount: PeopleRoutesProps["contactPayProps"]["payAmount"];
  paySelectedContact: PeopleRoutesProps["contactPayProps"]["paySelectedContact"];
  payWithCashuEnabled: PeopleRoutesProps["chatProps"]["payWithCashuEnabled"];
  reactionsByMessageId: PeopleRoutesProps["chatProps"]["reactionsByMessageId"];
  pendingDeleteId: PeopleRoutesProps["contactEditProps"]["pendingDeleteId"];
  profileCustomPictureUrl: PeopleRoutesProps["profileProps"]["profileCustomPictureUrl"];
  profileEditLnAddress: PeopleRoutesProps["profileProps"]["profileEditLnAddress"];
  profileEditName: PeopleRoutesProps["profileProps"]["profileEditName"];
  profileEditPicture: PeopleRoutesProps["profileProps"]["profileEditPicture"];
  profileEditsSavable: PeopleRoutesProps["profileProps"]["profileEditsSavable"];
  profilePhotoInputRef: PeopleRoutesProps["profileProps"]["profilePhotoInputRef"];
  profileSelectedPictureKind: PeopleRoutesProps["profileProps"]["profileSelectedPictureKind"];
  requestDeleteCurrentContact: PeopleRoutesProps["contactEditProps"]["requestDeleteCurrentContact"];
  requestSelectedContact: PeopleRoutesProps["contactPayProps"]["requestSelectedContact"];
  resetEditedContactFieldFromNostr: PeopleRoutesProps["contactEditProps"]["resetEditedContactFieldFromNostr"];
  saveProfileEdits: PeopleRoutesProps["profileProps"]["saveProfileEdits"];
  scanIsOpen: PeopleRoutesProps["contactNewProps"]["scanIsOpen"];
  replyContext: PeopleRoutesProps["chatProps"]["replyContext"];
  selectedContact: PeopleRoutesProps["contactProps"]["selectedContact"];
  sendChatMessage: PeopleRoutesProps["chatProps"]["sendChatMessage"];
  setChatDraft: PeopleRoutesProps["chatProps"]["setChatDraft"];
  setContactPayMethod: PeopleRoutesProps["contactPayProps"]["setContactPayMethod"];
  setForm: PeopleRoutesProps["contactEditProps"]["setForm"];
  setMintIconUrlByMint: PeopleRoutesProps["chatProps"]["setMintIconUrlByMint"];
  setPayAmount: PeopleRoutesProps["contactPayProps"]["setPayAmount"];
  setProfileEditLnAddress: PeopleRoutesProps["profileProps"]["setProfileEditLnAddress"];
  setProfileEditName: PeopleRoutesProps["profileProps"]["setProfileEditName"];
  t: PeopleRoutesProps["chatProps"]["t"];
}

export const buildPeopleRouteProps = ({
  cashuBalance,
  cashuIsBusy,
  chatSelectedContact,
  chatDraft,
  chatMessageElByIdRef,
  chatMessages,
  chatMessagesRef,
  chatOwnPubkeyHex,
  chatSendIsBusy,
  contactEditsSavable,
  contactPaymentIntent,
  contactPayMethod,
  copyText,
  currentNpub,
  cycleProfileAvatarControl,
  derivedProfile,
  displayUnit,
  editingId,
  editContext,
  effectiveMyLightningAddress,
  effectiveProfileName,
  effectiveProfilePicture,
  feedbackContactNpub,
  form,
  getCashuTokenMessageInfo,
  getMintIconUrl,
  groupNames,
  handleSaveContact,
  isProfileEditing,
  isSavingContact,
  lang,
  myProfileQr,
  nostrPictureByNpub,
  onCancelEdit,
  onCancelReply,
  onAddUnknownContact,
  onRemoveUnknownContactChat,
  onCopy,
  onDeclinePaymentRequest,
  onEdit,
  onPayPaymentRequest,
  onPickProfilePhoto,
  onProfilePhotoSelected,
  onReact,
  onReply,
  openContactPay,
  openScan,
  payAmount,
  paySelectedContact,
  payWithCashuEnabled,
  reactionsByMessageId,
  pendingDeleteId,
  profileCustomPictureUrl,
  profileEditLnAddress,
  profileEditName,
  profileEditPicture,
  profileEditsSavable,
  profilePhotoInputRef,
  profileSelectedPictureKind,
  requestDeleteCurrentContact,
  requestSelectedContact,
  resetEditedContactFieldFromNostr,
  saveProfileEdits,
  scanIsOpen,
  replyContext,
  selectedContact,
  sendChatMessage,
  setChatDraft,
  setContactPayMethod,
  setForm,
  setMintIconUrlByMint,
  setPayAmount,
  setProfileEditLnAddress,
  setProfileEditName,
  t,
}: BuildPeopleRoutePropsParams): PeopleRoutesProps => {
  return {
    chatProps: {
      selectedContact: chatSelectedContact,
      chatMessages,
      chatMessagesRef,
      chatOwnPubkeyHex,
      chatDraft,
      setChatDraft,
      chatSendIsBusy,
      editContext,
      replyContext,
      cashuBalance,
      cashuIsBusy,
      payWithCashuEnabled,
      feedbackContactNpub,
      lang,
      reactionsByMessageId,
      setMintIconUrlByMint,
      chatMessageElByIdRef,
      getCashuTokenMessageInfo,
      getMintIconUrl,
      onReply,
      onEdit,
      onReact,
      onCopy,
      onCancelReply,
      onCancelEdit,
      onAddUnknownContact,
      onRemoveUnknownContactChat,
      sendChatMessage,
      openContactPay,
      onPayPaymentRequest,
      onDeclinePaymentRequest,
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
      cashuIsBusy,
      payWithCashuEnabled,
      contactPaymentIntent,
      contactPayMethod,
      setContactPayMethod,
      payAmount,
      setPayAmount,
      displayUnit,
      paySelectedContact,
      requestSelectedContact,
      t,
    },
    contactProps: {
      selectedContact,
      nostrPictureByNpub,
      cashuBalance,
      cashuIsBusy,
      copyText,
      payWithCashuEnabled,
      feedbackContactNpub,
      openContactPay,
      t,
    },
    profileProps: {
      currentNpub,
      cycleProfileAvatarControl,
      isProfileEditing,
      profileCustomPictureUrl,
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
      profileSelectedPictureKind,
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
