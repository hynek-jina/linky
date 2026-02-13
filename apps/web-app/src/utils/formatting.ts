export const getInitials = (name: string): string => {
  const normalized = name.trim();
  if (!normalized) return "?";
  const parts = normalized.split(/\s+/).filter(Boolean);
  const letters = parts
    .slice(0, 2)
    .map((part) => part.slice(0, 1).toUpperCase());
  return letters.join("") || "?";
};

export const formatShortNpub = (npub: string): string => {
  const trimmed = String(npub ?? "").trim();
  if (!trimmed) return "";
  if (trimmed.length <= 18) return trimmed;
  return `${trimmed.slice(0, 10)}…${trimmed.slice(-6)}`;
};

export const formatMiddleDots = (value: string, maxLen: number): string => {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return "";
  if (!Number.isFinite(maxLen) || maxLen <= 0) return trimmed;
  if (trimmed.length <= maxLen) return trimmed;
  if (maxLen <= 6) return `${trimmed.slice(0, maxLen)}`;

  const remaining = maxLen - 3;
  const startLen = Math.ceil(remaining / 2);
  const endLen = Math.floor(remaining / 2);
  return `${trimmed.slice(0, startLen)}...${trimmed.slice(-endLen)}`;
};

export const formatDurationShort = (seconds: number): string => {
  const total = Math.max(0, Math.floor(seconds));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
};

export const getBestNostrName = (metadata: {
  displayName?: string;
  name?: string;
}): string | null => {
  const display = String(metadata.displayName ?? "").trim();
  if (display) return display;
  const name = String(metadata.name ?? "").trim();
  if (name) return name;
  return null;
};

const normalizeLocale = (lang?: string): string => {
  const raw = String(lang ?? "").trim();
  if (raw) {
    if (raw === "cs") return "cs-CZ";
    if (raw === "en") return "en-US";
    return raw;
  }
  if (typeof document !== "undefined") {
    const docLang = String(document.documentElement?.lang ?? "").trim();
    if (docLang) return docLang === "cs" ? "cs-CZ" : docLang;
  }
  if (typeof navigator !== "undefined") {
    const navLang = String(navigator.language ?? "").trim();
    if (navLang) return navLang === "cs" ? "cs-CZ" : navLang;
  }
  return "en-US";
};

const numberFormatters = new Map<string, Intl.NumberFormat>();

export const formatInteger = (value: number, lang?: string): string => {
  const locale = normalizeLocale(lang);
  let formatter = numberFormatters.get(locale);
  if (!formatter) {
    formatter = new Intl.NumberFormat(locale);
    numberFormatters.set(locale, formatter);
  }
  return formatter.format(
    Number.isFinite(value) ? Math.trunc(value) : Math.trunc(0),
  );
};

export const formatContactMessageTimestamp = (
  createdAtSec: number,
  lang?: string,
): string => {
  const ms = Number(createdAtSec ?? 0) * 1000;
  if (!Number.isFinite(ms) || ms <= 0) return "";
  const d = new Date(ms);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  const locale = normalizeLocale(lang);
  if (sameDay) {
    return new Intl.DateTimeFormat(locale, {
      hour: "2-digit",
      minute: "2-digit",
    }).format(d);
  }
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "2-digit",
  }).format(d);
};

export const previewTokenText = (token: string | null): string | null => {
  if (!token) return null;
  const trimmed = String(token).trim();
  if (!trimmed) return null;
  return trimmed.length > 16 ? `${trimmed.slice(0, 16)}…` : trimmed;
};

export const formatChatDayLabel = (
  ms: number,
  lang: string | undefined,
  t: (key: string) => string,
): string => {
  const d = new Date(ms);
  const now = new Date();
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ).getTime();
  const startOfThatDay = new Date(
    d.getFullYear(),
    d.getMonth(),
    d.getDate(),
  ).getTime();

  const diffDays = Math.round((startOfToday - startOfThatDay) / 86_400_000);
  if (diffDays === 0) return t("today");
  if (diffDays === 1) return t("yesterday");

  const locale = normalizeLocale(lang);
  const weekday = new Intl.DateTimeFormat(locale, {
    weekday: "short",
  }).format(d);
  const day = d.getDate();
  const month = d.getMonth() + 1;
  if (locale.startsWith("cs")) return `${weekday} ${day}. ${month}.`;
  return `${weekday} ${month}/${day}`;
};
