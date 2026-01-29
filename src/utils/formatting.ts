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
