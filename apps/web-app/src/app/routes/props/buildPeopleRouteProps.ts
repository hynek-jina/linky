import type { PeopleRoutesProps } from "../AppRouteContent";

interface BuildPeopleRoutePropsParams {
  cashuBalance: PeopleRoutesProps["chatProps"]["cashuBalance"];
  cashuBalanceAfterMelt: PeopleRoutesProps["chatProps"]["cashuBalanceAfterMelt"];
  cashuIsBusy: PeopleRoutesProps["chatProps"]["cashuIsBusy"];
  canWriteNfc: PeopleRoutesProps["profileProps"]["canWriteToNfc"];
  chatSelectedContact: PeopleRoutesProps["chatProps"]["selectedContact"];
  chatDraft: PeopleRoutesProps["chatProps"]["chatDraft"];
  chatMessageElByIdRef: PeopleRoutesProps["chatProps"]["chatMessageElByIdRef"];
  chatMessages: PeopleRoutesProps["chatProps"]["chatMessages"];
  bankPaymentOfferMessages: PeopleRoutesProps["chatProps"]["bankPaymentOfferMessages"];
  chatMessagesRef: PeopleRoutesProps["chatProps"]["chatMessagesRef"];
  chatOwnPubkeyHex: PeopleRoutesProps["chatProps"]["chatOwnPubkeyHex"];
  chatSendIsBusy: PeopleRoutesProps["chatProps"]["chatSendIsBusy"];
  contactEditsSavable: PeopleRoutesProps["contactEditProps"]["contactEditsSavable"];
  contactPaymentIntent: PeopleRoutesProps["contactPayProps"]["contactPaymentIntent"];
  contactPayMethod: PeopleRoutesProps["contactPayProps"]["contactPayMethod"];
  addNewContactFromSearchResult: PeopleRoutesProps["contactNewProps"]["addNewContactFromSearchResult"];
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
  isBankPaymentOfferCanceled: PeopleRoutesProps["chatProps"]["isBankPaymentOfferCanceled"];
  isSavingContact: PeopleRoutesProps["contactEditProps"]["isSavingContact"];
  blockArchivedContact: PeopleRoutesProps["contactEditProps"]["blockArchivedContact"];
  lang: PeopleRoutesProps["chatProps"]["lang"];
  makeNip98AuthHeader: PeopleRoutesProps["profileProps"]["makeNip98AuthHeader"];
  myProfileQr: PeopleRoutesProps["profileProps"]["myProfileQr"];
  nostrPictureByNpub: PeopleRoutesProps["contactProps"]["nostrPictureByNpub"];
  onBlockUnknownContact: PeopleRoutesProps["chatProps"]["onBlockUnknownContact"];
  onCancelEdit: PeopleRoutesProps["chatProps"]["onCancelEdit"];
  onCancelReply: PeopleRoutesProps["chatProps"]["onCancelReply"];
  onAddUnknownContact: PeopleRoutesProps["chatProps"]["onAddUnknownContact"];
  onCopy: PeopleRoutesProps["chatProps"]["onCopy"];
  onCopyText: PeopleRoutesProps["chatProps"]["onCopyText"];
  onDeclinePaymentRequest: PeopleRoutesProps["chatProps"]["onDeclinePaymentRequest"];
  onRespondBankPaymentOffer: PeopleRoutesProps["chatProps"]["onRespondBankPaymentOffer"];
  onSettleBankPaymentOffer: PeopleRoutesProps["chatProps"]["onSettleBankPaymentOffer"];
  onEdit: PeopleRoutesProps["chatProps"]["onEdit"];
  onOpenBankPayment: PeopleRoutesProps["chatProps"]["onOpenBankPayment"];
  onOpenNpubContact: PeopleRoutesProps["chatProps"]["onOpenNpubContact"];
  onPayPaymentRequest: PeopleRoutesProps["chatProps"]["onPayPaymentRequest"];
  onPickProfilePhoto: PeopleRoutesProps["profileProps"]["onPickProfilePhoto"];
  onProfilePhotoSelected: PeopleRoutesProps["profileProps"]["onProfilePhotoSelected"];
  onReact: PeopleRoutesProps["chatProps"]["onReact"];
  onReply: PeopleRoutesProps["chatProps"]["onReply"];
  openContactPay: PeopleRoutesProps["chatProps"]["openContactPay"];
  ownedLightningAddresses: PeopleRoutesProps["profileProps"]["ownedLightningAddresses"];
  payAmount: PeopleRoutesProps["contactPayProps"]["payAmount"];
  payLightningInvoiceWithCashu: PeopleRoutesProps["profileProps"]["payLightningInvoiceWithCashu"];
  paySelectedContact: PeopleRoutesProps["contactPayProps"]["paySelectedContact"];
  payWithCashuEnabled: PeopleRoutesProps["chatProps"]["payWithCashuEnabled"];
  reactionsByMessageId: PeopleRoutesProps["chatProps"]["reactionsByMessageId"];
  selectedContactStatusText: PeopleRoutesProps["contactProps"]["statusText"];
  pendingDeleteId: PeopleRoutesProps["contactEditProps"]["pendingDeleteId"];
  profileClaimLightningAddressServerBaseUrl: PeopleRoutesProps["profileProps"]["serverBaseUrl"];
  profileCustomPictureUrl: PeopleRoutesProps["profileProps"]["profileCustomPictureUrl"];
  profileEditLnAddress: PeopleRoutesProps["profileProps"]["profileEditLnAddress"];
  profileEditName: PeopleRoutesProps["profileProps"]["profileEditName"];
  profileEditPicture: PeopleRoutesProps["profileProps"]["profileEditPicture"];
  profileEditStatus: PeopleRoutesProps["profileProps"]["profileEditStatus"];
  profileEditsSavable: PeopleRoutesProps["profileProps"]["profileEditsSavable"];
  unregisteredOwnLightningAddress: PeopleRoutesProps["profileProps"]["unregisteredOwnLightningAddress"];
  profileStatus: PeopleRoutesProps["profileProps"]["profileStatus"];
  profileStatusCurrencies: PeopleRoutesProps["profileProps"]["profileStatusCurrencies"];
  profileStatusIsSaving: PeopleRoutesProps["profileProps"]["profileStatusIsSaving"];
  profilePhotoInputRef: PeopleRoutesProps["profileProps"]["profilePhotoInputRef"];
  profileSelectedPictureKind: PeopleRoutesProps["profileProps"]["profileSelectedPictureKind"];
  restoreArchivedContact: PeopleRoutesProps["contactEditProps"]["restoreArchivedContact"];
  requestDeleteCurrentContact: PeopleRoutesProps["contactEditProps"]["requestDeleteCurrentContact"];
  requestSelectedContact: PeopleRoutesProps["contactPayProps"]["requestSelectedContact"];
  resetEditedContactFieldFromNostr: PeopleRoutesProps["contactEditProps"]["resetEditedContactFieldFromNostr"];
  saveClaimedLightningAddress: PeopleRoutesProps["profileProps"]["saveClaimedLightningAddress"];
  saveProfileEdits: PeopleRoutesProps["profileProps"]["saveProfileEdits"];
  searchNewContact: PeopleRoutesProps["contactNewProps"]["searchNewContact"];
  replyContext: PeopleRoutesProps["chatProps"]["replyContext"];
  selectedProfileStatusCurrencies: PeopleRoutesProps["profileProps"]["selectedProfileStatusCurrencies"];
  selectedContact: PeopleRoutesProps["contactProps"]["selectedContact"];
  sendChatImage: PeopleRoutesProps["chatProps"]["sendChatImage"];
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
  writeCurrentNpubToNfc: PeopleRoutesProps["profileProps"]["writeCurrentNpubToNfc"];
}

export const buildPeopleRouteProps = ({
  cashuBalance,
  cashuBalanceAfterMelt,
  cashuIsBusy,
  canWriteNfc,
  chatSelectedContact,
  chatDraft,
  chatMessageElByIdRef,
  chatMessages,
  bankPaymentOfferMessages,
  chatMessagesRef,
  chatOwnPubkeyHex,
  chatSendIsBusy,
  contactEditsSavable,
  contactPaymentIntent,
  contactPayMethod,
  addNewContactFromSearchResult,
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
  isBankPaymentOfferCanceled,
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
  onCopyText,
  onDeclinePaymentRequest,
  onRespondBankPaymentOffer,
  onSettleBankPaymentOffer,
  onEdit,
  onOpenBankPayment,
  onOpenNpubContact,
  onPayPaymentRequest,
  onPickProfilePhoto,
  onProfilePhotoSelected,
  onReact,
  onReply,
  openContactPay,
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
  unregisteredOwnLightningAddress,
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
  searchNewContact,
  replyContext,
  selectedProfileStatusCurrencies,
  selectedContact,
  sendChatImage,
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
  writeCurrentNpubToNfc,
}: BuildPeopleRoutePropsParams): PeopleRoutesProps => {
  return {
    chatProps: {
      selectedContact: chatSelectedContact,
      chatMessages,
      bankPaymentOfferMessages,
      chatMessagesRef,
      chatOwnPubkeyHex,
      chatDraft,
      setChatDraft,
      chatSendIsBusy,
      editContext,
      replyContext,
      cashuBalance,
      cashuBalanceAfterMelt,
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
      isBankPaymentOfferCanceled,
      onReply,
      onEdit,
      onReact,
      onCopy,
      onCopyText,
      onCancelReply,
      onCancelEdit,
      onAddUnknownContact,
      onBlockUnknownContact,
      sendChatImage,
      sendChatMessage,
      openContactPay,
      onOpenBankPayment,
      onOpenNpubContact,
      onPayPaymentRequest,
      onDeclinePaymentRequest,
      onRespondBankPaymentOffer,
      onSettleBankPaymentOffer,
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
      addNewContactFromSearchResult,
      form,
      setForm,
      groupNames,
      handleSaveContact,
      isSavingContact,
      searchNewContact,
      t,
    },
    contactPayProps: {
      selectedContact,
      nostrPictureByNpub,
      cashuBalance,
      cashuBalanceAfterMelt,
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
    profileProps: {
      cashuBalance,
      cashuBalanceAfterMelt,
      cashuIsBusy,
      canWriteToNfc: canWriteNfc,
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
      unregisteredOwnLightningAddress,
      profileStatus,
      profileStatusCurrencies,
      profileStatusIsSaving,
      myProfileQr,
      effectiveMyLightningAddress,
      makeNip98AuthHeader,
      profilePhotoInputRef,
      profileSelectedPictureKind,
      payLightningInvoiceWithCashu,
      saveClaimedLightningAddress,
      selectedProfileStatusCurrencies,
      serverBaseUrl: profileClaimLightningAddressServerBaseUrl,
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
      writeCurrentNpubToNfc,
    },
  };
};
