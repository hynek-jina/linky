export const UNIT_TOGGLE_STORAGE_KEY = "linky_use_btc_symbol";
export const DISPLAY_CURRENCY_STORAGE_KEY = "linky.display_currency.v1";
export const DISPLAY_ALLOWED_CURRENCIES_STORAGE_KEY =
  "linky.display_allowed_currencies.v1";
export const FIAT_RATES_CACHE_STORAGE_KEY = "linky.fiat_rates.v1";
export const FIAT_RATES_TTL_MS = 10 * 60 * 1000;
export const NOSTR_NSEC_STORAGE_KEY = "linky.nostr_nsec";
export const NOSTR_SLIP39_SEED_STORAGE_KEY = "linky.nostr_slip39_seed";
export const CASHU_BIP85_MNEMONIC_STORAGE_KEY = "linky.cashu_bip85_mnemonic";
export const EVOLU_CONTACTS_OWNER_INDEX_STORAGE_KEY =
  "linky.evolu.contacts_owner_index.v1";
export const EVOLU_MESSAGES_OWNER_INDEX_STORAGE_KEY =
  "linky.evolu.messages_owner_index.v1";
export const EVOLU_CONTACTS_OWNER_BASELINE_COUNT_STORAGE_KEY =
  "linky.evolu.contacts_owner_baseline_count.v1";
export const EVOLU_CASHU_OWNER_BASELINE_COUNT_STORAGE_KEY =
  "linky.evolu.cashu_owner_baseline_count.v1";
export const EVOLU_MESSAGES_OWNER_BASELINE_COUNT_STORAGE_KEY =
  "linky.evolu.messages_owner_baseline_count.v1";
export const EVOLU_CONTACTS_OWNER_EDIT_COUNT_STORAGE_KEY =
  "linky.evolu.contacts_owner_edit_count.v1";
export const EVOLU_MESSAGES_OWNER_EDIT_COUNT_STORAGE_KEY =
  "linky.evolu.messages_owner_edit_count.v1";
export const EVOLU_CONTACTS_OWNER_LAST_ROTATED_AT_MS_STORAGE_KEY =
  "linky.evolu.contacts_owner_last_rotated_at_ms.v1";
export const EVOLU_CASHU_OWNER_LAST_ROTATED_AT_MS_STORAGE_KEY =
  "linky.evolu.cashu_owner_last_rotated_at_ms.v1";
export const EVOLU_MESSAGES_OWNER_LAST_ROTATED_AT_MS_STORAGE_KEY =
  "linky.evolu.messages_owner_last_rotated_at_ms.v1";
export const OWNER_ROTATION_TRIGGER_WRITE_COUNT = 1000;
export const OWNER_ROTATION_COOLDOWN_MS = 60_000;
export const MAX_CONTACTS_PER_OWNER = 500;
export const CONTACTS_ONBOARDING_DISMISSED_STORAGE_KEY =
  "linky.contacts_onboarding_dismissed";
export const CONTACTS_ONBOARDING_HAS_PAID_STORAGE_KEY =
  "linky.contacts_onboarding_has_paid";
export const CONTACTS_ONBOARDING_HAS_BACKUPED_KEYS_STORAGE_KEY =
  "linky.contacts_onboarding_has_backuped_keys";
export const CASHU_ONBOARDING_SET_MAIN_MINT_STORAGE_KEY =
  "linky.cashu_onboarding_set_main_mint.v1";
export const CASHU_RECOVERY_VAULT_STORAGE_KEY = "linky.cashu_recovery_vault";
export const PAY_WITH_CASHU_STORAGE_KEY = "linky.pay_with_cashu";
export const CASHU_AUTOSWAP_STORAGE_KEY = "linky.cashu_autoswap.v1";
export const ALLOW_PROMISES_STORAGE_KEY = "linky.allow_promises";
export const LIGHTNING_INVOICE_AUTO_PAY_LIMIT_STORAGE_KEY =
  "linky.lightning_invoice_auto_pay_limit";
export const FEEDBACK_CONTACT_NPUB =
  "npub1kkht6jvgr8mt4844saf80j5jjwyy6fdy90sxsuxt4hfv8pel499s96jvz8";
export const PAYMENT_ANALYTICS_RECIPIENT_NPUB =
  "npub1xuxvcnmw4drf8duzalvalxrfxjvwtrjdmwxy0ez2e62uje4drrvqu6pz2w";
export const NO_GROUP_FILTER = "__linky_no_group__";

export const LAST_ACCEPTED_CASHU_TOKEN_STORAGE_KEY =
  "linky.lastAcceptedCashuToken.v1";
export const PENDING_DEEP_LINK_TEXT_STORAGE_KEY =
  "linky.pendingDeepLinkText.v1";

export const PROMISE_TOTAL_CAP_SAT = 100_000;
export const PROMISE_EXPIRES_SEC = 30 * 24 * 60 * 60;
export const WALLET_WARNING_BALANCE_THRESHOLD_SAT = 50_000;
export const LIGHTNING_INVOICE_AUTO_PAY_LIMIT_SAT = 10_000;
export const LIGHTNING_INVOICE_AUTO_PAY_LIMIT_OPTIONS = [
  0, 1_000, 10_000, 100_000,
] as const;

export const LOCAL_PAYMENT_EVENTS_STORAGE_KEY_PREFIX =
  "linky.local.paymentEvents.v1";
export const LOCAL_NOSTR_MESSAGES_STORAGE_KEY_PREFIX =
  "linky.local.nostrMessages.v1";
export const LOCAL_MINT_INFO_STORAGE_KEY_PREFIX = "linky.local.mintInfo.v1";
export const LOCAL_PENDING_PAYMENTS_STORAGE_KEY_PREFIX =
  "linky.local.pendingPayments.v1";
export const LOCAL_PENDING_PAYMENT_TELEMETRY_STORAGE_KEY_PREFIX =
  "linky.local.pendingPaymentTelemetry.v1";
export const LOCAL_PENDING_PAYMENT_TELEMETRY_LOCK_STORAGE_KEY_PREFIX =
  "linky.local.pendingPaymentTelemetryLock.v1";
export const LOCAL_PENDING_TOPUP_QUOTE_STORAGE_KEY_PREFIX =
  "linky.local.pendingTopupQuote.v1";
export const LOCAL_PENDING_AUTOSWAP_CLAIM_STORAGE_KEY_PREFIX =
  "linky.local.pendingAutoswapClaim.v1";

export const BLOCKED_NOSTR_PUBKEYS_STORAGE_KEY =
  "linky.blocked_nostr_pubkeys.v1";
export const UNKNOWN_CONTACT_ID_PREFIX = "unknown:";
