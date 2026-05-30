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
  getNpubMessageContactInfo: PeopleRoutesProps["chatProps"]["getNpubMessageContactInfo"];
  groupNames: PeopleRoutesProps["contactEditProps"]["groupNames"];
  handleSaveContact: PeopleRoutesProps["contactEditProps"]["handleSaveContact"];
  isProfileEditing: PeopleRoutesProps["profileProps"]["isProfileEditing"];
  isSavingContact: PeopleRoutesProps["contactEditProps"]["isSavingContact"];
  blockArchivedContact: PeopleRoutesProps["contactEditProps"]["blockArchivedContact"];
  lang: PeopleRoutesProps["chatProps"]["lang"];
  makeNip98AuthHeader: PeopleRoutesProps["profileClaimLightningAddressProps"]["makeNip98AuthHeader"];
  myProfileQr: PeopleRoutesProps["profileProps"]["myProfileQr"];
  nostrPictureByNpub: PeopleRoutesProps["contactProps"]["nostrPictureByNpub"];
  onBlockUnknownContact: PeopleRoutesProps["chatProps"]["onBlockUnknownContact"];
  onCancelEdit: PeopleRoutesProps["chatProps"]["onCancelEdit"];
  onCancelReply: PeopleRoutesProps["chatProps"]["onCancelReply"];
  onAddUnknownContact: PeopleRoutesProps["chatProps"]["onAddUnknownContact"];
  onCopy: PeopleRoutesProps["chatProps"]["onCopy"];
  onDeclinePaymentRequest: PeopleRoutesProps["chatProps"]["onDeclinePaymentRequest"];
  onEdit: PeopleRoutesProps["chatProps"]["onEdit"];
  onOpenNpubContact: PeopleRoutesProps["chatProps"]["onOpenNpubContact"];
  onPayPaymentRequest: PeopleRoutesProps["chatProps"]["onPayPaymentRequest"];
  onPickProfilePhoto: PeopleRoutesProps["profileProps"]["onPickProfilePhoto"];
  onProfilePhotoSelected: PeopleRoutesProps["profileProps"]["onProfilePhotoSelected"];
  onReact: PeopleRoutesProps["chatProps"]["onReact"];
  onReply: PeopleRoutesProps["chatProps"]["onReply"];
  openContactPay: PeopleRoutesProps["chatProps"]["openContactPay"];
  openScan: PeopleRoutesProps["contactNewProps"]["openScan"];
  ownedLightningAddresses: PeopleRoutesProps["profileProps"]["ownedLightningAddresses"];
  payAmount: PeopleRoutesProps["contactPayProps"]["payAmount"];
  payLightningInvoiceWithCashu: PeopleRoutesProps["profileClaimLightningAddressProps"]["payLightningInvoiceWithCashu"];
  paySelectedContact: PeopleRoutesProps["contactPayProps"]["paySelectedContact"];
  payWithCashuEnabled: PeopleRoutesProps["chatProps"]["payWithCashuEnabled"];
  reactionsByMessageId: PeopleRoutesProps["chatProps"]["reactionsByMessageId"];
  selectedContactStatusText: PeopleRoutesProps["contactProps"]["statusText"];
  pendingDeleteId: PeopleRoutesProps["contactEditProps"]["pendingDeleteId"];
  profileClaimLightningAddressServerBaseUrl: PeopleRoutesProps["profileClaimLightningAddressProps"]["serverBaseUrl"];
  profileCustomPictureUrl: PeopleRoutesProps["profileProps"]["profileCustomPictureUrl"];
  profileEditLnAddress: PeopleRoutesProps["profileProps"]["profileEditLnAddress"];
  profileEditName: PeopleRoutesProps["profileProps"]["profileEditName"];
  profileEditPicture: PeopleRoutesProps["profileProps"]["profileEditPicture"];
  profileEditStatus: PeopleRoutesProps["profileProps"]["profileEditStatus"];
  profileEditsSavable: PeopleRoutesProps["profileProps"]["profileEditsSavable"];
  profileStatus: PeopleRoutesProps["profileProps"]["profileStatus"];
  profileStatusCurrencies: PeopleRoutesProps["profileProps"]["profileStatusCurrencies"];
  profileStatusIsSaving: PeopleRoutesProps["profileProps"]["profileStatusIsSaving"];
  profilePhotoInputRef: PeopleRoutesProps["profileProps"]["profilePhotoInputRef"];
  profileSelectedPictureKind: PeopleRoutesProps["profileProps"]["profileSelectedPictureKind"];
  restoreArchivedContact: PeopleRoutesProps["contactEditProps"]["restoreArchivedContact"];
  requestDeleteCurrentContact: PeopleRoutesProps["contactEditProps"]["requestDeleteCurrentContact"];
  requestSelectedContact: PeopleRoutesProps["contactPayProps"]["requestSelectedContact"];
  resetEditedContactFieldFromNostr: PeopleRoutesProps["contactEditProps"]["resetEditedContactFieldFromNostr"];
  saveClaimedLightningAddress: PeopleRoutesProps["profileClaimLightningAddressProps"]["saveClaimedLightningAddress"];
  saveProfileEdits: PeopleRoutesProps["profileProps"]["saveProfileEdits"];
  scanIsOpen: PeopleRoutesProps["contactNewProps"]["scanIsOpen"];
  replyContext: PeopleRoutesProps["chatProps"]["replyContext"];
  selectedProfileStatusCurrencies: PeopleRoutesProps["profileProps"]["selectedProfileStatusCurrencies"];
  selectedContact: PeopleRoutesProps["contactProps"]["selectedContact"];
  sendChatMessage: PeopleRoutesProps["chatProps"]["sendChatMessage"];
  setChatDraft: PeopleRoutesProps["chatProps"]["setChatDraft"];
  setContactPayMethod: PeopleRoutesProps["contactPayProps"]["setContactPayMethod"];
  setForm: PeopleRoutesProps["contactEditProps"]["setForm"];
  setMintIconUrlByMint: PeopleRoutesProps["chatProps"]["setMintIconUrlByMint"];
  setPayAmount: PeopleRoutesProps["contactPayProps"]["setPayAmount"];
  setProfileEditLnAddress: PeopleRoutesProps["profileProps"]["setProfileEditLnAddress"];
  setProfileEditName: PeopleRoutesProps["profileProps"]["setProfileEditName"];
  setProfileEditStatus: PeopleRoutesProps["profileProps"]["setProfileEditStatus"];
  t: PeopleRoutesProps["chatProps"]["t"];
  toggleProfileStatusCurrency: PeopleRoutesProps["profileProps"]["toggleProfileStatusCurrency"];
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
  getNpubMessageContactInfo,
  groupNames,
  handleSaveContact,
  isProfileEditing,
  isSavingContact,
  blockArchivedContact,
  lang,
  makeNip98AuthHeader,
  myProfileQr,
  nostrPictureByNpub,
  onBlockUnknownContact,
  onCancelEdit,
  onCancelReply,
  onAddUnknownContact,
  onCopy,
  onDeclinePaymentRequest,
  onEdit,
  onOpenNpubContact,
  onPayPaymentRequest,
  onPickProfilePhoto,
  onProfilePhotoSelected,
  onReact,
  onReply,
  openContactPay,
  openScan,
  ownedLightningAddresses,
  payAmount,
  payLightningInvoiceWithCashu,
  paySelectedContact,
  payWithCashuEnabled,
  reactionsByMessageId,
  selectedContactStatusText,
  pendingDeleteId,
  profileClaimLightningAddressServerBaseUrl,
  profileCustomPictureUrl,
  profileEditLnAddress,
  profileEditName,
  profileEditPicture,
  profileEditStatus,
  profileEditsSavable,
  profileStatus,
  profileStatusCurrencies,
  profileStatusIsSaving,
  profilePhotoInputRef,
  profileSelectedPictureKind,
  restoreArchivedContact,
  requestDeleteCurrentContact,
  requestSelectedContact,
  resetEditedContactFieldFromNostr,
  saveClaimedLightningAddress,
  saveProfileEdits,
  scanIsOpen,
  replyContext,
  selectedProfileStatusCurrencies,
  selectedContact,
  sendChatMessage,
  setChatDraft,
  setContactPayMethod,
  setForm,
  setMintIconUrlByMint,
  setPayAmount,
  setProfileEditLnAddress,
  setProfileEditName,
  setProfileEditStatus,
  t,
  toggleProfileStatusCurrency,
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
      getNpubMessageContactInfo,
      onReply,
      onEdit,
      onReact,
      onCopy,
      onCancelReply,
      onCancelEdit,
      onAddUnknownContact,
      onBlockUnknownContact,
      sendChatMessage,
      openContactPay,
      onOpenNpubContact,
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
      blockArchivedContact,
      restoreArchivedContact,
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
      statusText: selectedContactStatusText,
      t,
    },
    profileClaimLightningAddressProps: {
      cashuBalance,
      cashuIsBusy,
      effectiveMyLightningAddress,
      makeNip98AuthHeader,
      ownedLightningAddresses,
      payLightningInvoiceWithCashu,
      saveClaimedLightningAddress,
      serverBaseUrl: profileClaimLightningAddressServerBaseUrl,
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
      profileEditStatus,
      derivedProfile,
      profileEditsSavable,
      profileStatus,
      profileStatusCurrencies,
      profileStatusIsSaving,
      myProfileQr,
      effectiveMyLightningAddress,
      profilePhotoInputRef,
      profileSelectedPictureKind,
      selectedProfileStatusCurrencies,
      setProfileEditName,
      setProfileEditLnAddress,
      setProfileEditStatus,
      onProfilePhotoSelected,
      onPickProfilePhoto,
      ownedLightningAddresses,
      saveProfileEdits,
      copyText,
      t,
      toggleProfileStatusCurrency,
    },
  };
};
