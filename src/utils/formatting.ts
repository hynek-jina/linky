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
