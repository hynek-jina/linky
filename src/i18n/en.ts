export const en = {
  appTitle: "Linky",
  appTagline: "Personal lightning contacts",

  settings: "Settings",
  menu: "Menu",
  keys: "Keys",
  copyCurrent: "Copy",
  paste: "Paste",

  nostrKeys: "Nostr keys",
  derive: "Derive",
  nostrKeysCopied: "Nostr keys copied to clipboard.",
  nostrKeysUpdated: "Nostr keys saved.",
  nostrKeysDerived: "Nostr keys derived from seed.",
  nostrPasteArmedHint:
    "Pasting Nostr keys will overwrite the current ones. Click once more to confirm.",
  nostrPasteInvalid: "Invalid Nostr key (expected nsec…).",

  nostrRelay: "Nostr relay",
  addRelay: "Add relay",
  newRelay: "Add relay",
  relayUrl: "Relay URL",

  mints: "Mints",

  chat: "Chat",
  sendMessage: "Send message",
  chatEmpty: "No messages yet.",
  chatPlaceholder: "Message",
  chatMissingContactNpub: "Missing contact npub.",
  send: "Send",

  profile: "Profile",
  profileNoName: "Nostr profile",
  myNpubQr: "Your contact",
  profileMissingNpub: "Missing Nostr keys.",

  language: "Language",
  czech: "Czech",
  english: "English",

  list: "List",
  contactsTitle: "Contacts",
  addContact: "Add contact",
  noContactsYet: "No contacts yet.",

  edit: "Edit",
  delete: "Delete",
  deleteArmedHint: "Click once more to delete.",

  contact: "Contact",
  editContact: "Edit contact",
  contactEditTitle: "Edit contact",
  contactPayTitle: "Pay to contact",
  messagesTitle: "Messages",
  newContact: "Add new contact",
  close: "Close",

  name: "Name",
  npub: "npub",
  lightningAddress: "Lightning address",
  group: "Group",

  all: "All",
  noGroup: "No group",

  saveChanges: "Save changes",
  saveContact: "Save contact",
  clearForm: "Clear form",

  fillAtLeastOne: "Fill in at least one field.",
  contactSaved: "Contact saved.",
  contactUpdated: "Contact updated.",
  contactDeleted: "Contact deleted.",

  copiedToClipboard: "Copied to clipboard.",
  copyFailed: "Copy to clipboard failed.",
  copy: "Copy",

  pasteArmedHint:
    "Pasting keys will wipe current data. Click once more to confirm.",
  pasteNotAvailable: "Clipboard paste isn't available.",
  pasteEmpty: "Clipboard is empty.",
  keysCopied: "Keys copied to clipboard.",
  keysPasting: "Keys validated. Restoring (this will wipe current data)…",
  errorPrefix: "Error",

  wallet: "Wallet",
  walletOpen: "Open wallet",

  unit: "Units",
  unitUseBitcoin: "Show ₿ instead of sat",

  cashuBalance: "Available balance",
  pasteCashu: "Paste cashu",
  cashuSaved: "Cashu token saved.",
  cashuAccepting: "Accepting token…",
  cashuAccepted: "Token accepted.",
  cashuAcceptFailed: "Failed to accept token",
  cashuStatus: "Status",
  cashuDeleted: "Token deleted.",
  cashuEmpty: "No Cashu tokens yet.",
  cashuToken: "Token",
  cashuPasteManualHint: "Paste your Cashu token here",
  cashuSave: "Save token",

  pay: "Pay",
  payTo: "Pay to",
  availablePrefix: "available:",
  payAmount: "Amount",
  paySend: "Pay",
  payCancel: "Cancel",
  payMissingLn: "Missing lightning address.",
  payInvalidAmount: "Invalid amount",
  payInsufficient: "Not enough Cashu tokens.",
  payFetchingInvoice: "Fetching invoice…",
  payPaying: "Paying…",
  paySuccess: "Paid.",
  payFailed: "Payment failed",
} as const;
