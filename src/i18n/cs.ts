export const cs = {
  appTitle: "Linky",
  appTagline: "Osobní lightning kontakty",

  settings: "Nastavení",
  menu: "Menu",
  keys: "Klíče",
  copyCurrent: "Zkopírovat",
  paste: "Vložit",

  nostrKeys: "Nostr klíče",
  derive: "Derivovat",
  nostrKeysCopied: "Nostr klíče zkopírovány do schránky.",
  nostrKeysUpdated: "Nostr klíče byly uloženy.",
  nostrKeysDerived: "Nostr klíče byly znovu odvozeny ze seedu.",
  nostrPasteArmedHint:
    "Vložením Nostr klíčů přepíšete aktuální. Klikněte ještě jednou pro potvrzení.",
  nostrPasteInvalid: "Neplatný Nostr klíč (očekávám nsec…).",

  chat: "Chat",
  sendMessage: "Poslat zprávu",
  chatEmpty: "Zatím žádné zprávy.",
  chatPlaceholder: "Zpráva",
  chatMissingContactNpub: "Chybí npub u kontaktu.",
  send: "Odeslat",

  profile: "Profil",
  profileNoName: "Nostr profil",
  myNpubQr: "Tvůj kontakt",
  profileMissingNpub: "Chybí Nostr klíče.",

  language: "Jazyk",
  czech: "Čeština",
  english: "Angličtina",

  list: "Seznam",
  contactsTitle: "Kontakty",
  addContact: "Přidat kontakt",
  noContactsYet: "Zatím žádné kontakty.",

  edit: "Upravit",
  delete: "Smazat",
  deleteArmedHint: "Pro smazání klikněte ještě jednou.",

  contact: "Kontakt",
  editContact: "Upravit kontakt",
  newContact: "Přidat nový kontakt",
  close: "Zavřít",

  name: "Jméno",
  npub: "npub",
  lightningAddress: "Lightning adresa",
  group: "Skupina",

  all: "Vše",
  noGroup: "Bez skupiny",

  saveChanges: "Uložit změny",
  saveContact: "Uložit kontakt",
  clearForm: "Vyčistit formulář",

  fillAtLeastOne: "Vyplňte alespoň jedno pole.",
  contactSaved: "Kontakt byl uložen.",
  contactUpdated: "Kontakt byl upraven.",
  contactDeleted: "Kontakt byl smazán.",

  copiedToClipboard: "Zkopírováno do schránky.",
  copyFailed: "Kopírování do schránky se nepovedlo.",
  copy: "Kopírovat",

  pasteArmedHint:
    "Vložením klíčů vymažete aktuální data. Klikněte ještě jednou pro potvrzení.",
  pasteNotAvailable: "Vkládání ze schránky není dostupné.",
  pasteEmpty: "Schránka je prázdná.",
  keysCopied: "Klíče zkopírovány do schránky.",
  keysPasting:
    "Klíče byly ověřeny. Obnovujeme (dojde k vymazání aktuálních dat)…",
  errorPrefix: "Chyba",

  wallet: "Peněženka",
  walletOpen: "Otevřít peněženku",

  unit: "Jednotky",
  unitUseBitcoin: "Zobrazit ₿ místo sat",

  cashuBalance: "Dostupný zůstatek",
  pasteCashu: "Vložit cashu",
  cashuSaved: "Cashu token uložen.",
  cashuAccepting: "Přijímám token…",
  cashuAccepted: "Token přijat.",
  cashuAcceptFailed: "Nepodařilo se přijmout token",
  cashuStatus: "Stav",
  cashuDeleted: "Token byl smazán.",
  cashuEmpty: "Zatím žádné Cashu tokeny.",
  cashuToken: "Token",
  cashuPasteManualHint: "Vložte sem Cashu token",
  cashuSave: "Uložit token",

  pay: "Zaplatit",
  payTo: "Platba pro",
  availablePrefix: "dostupné:",
  payAmount: "Kolik poslat",
  paySend: "Zaplatit",
  payCancel: "Zrušit",
  payMissingLn: "Chybí lightning adresa.",
  payInvalidAmount: "Neplatná částka",
  payInsufficient: "Nemáte dostatek Cashu tokenů.",
  payFetchingInvoice: "Získávám fakturu…",
  payPaying: "Platím…",
  paySuccess: "Zaplaceno.",
  payFailed: "Platba se nepovedla",
} as const;
