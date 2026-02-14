import { parseCashuToken } from "../../cashu";
import type { CashuTokenMeta, CashuTokenRowLike } from "../types/appTypes";

export const extractCashuTokenMeta = (
  row: Pick<
    CashuTokenRowLike,
    "amount" | "mint" | "rawToken" | "token" | "unit"
  >,
): CashuTokenMeta => {
  const tokenText = String(row.token ?? row.rawToken ?? "").trim();
  const storedMint = String(row.mint ?? "").trim();
  const storedUnit = String(row.unit ?? "").trim() || null;
  const storedAmount = Number(row.amount ?? 0);

  let mint = storedMint ? storedMint : null;
  const unit = storedUnit;
  let amount =
    Number.isFinite(storedAmount) && storedAmount > 0
      ? Math.floor(storedAmount)
      : null;

  if ((!mint || !amount) && tokenText) {
    const parsed = parseCashuToken(tokenText);
    if (parsed) {
      if (!mint && parsed.mint) {
        const parsedMint = String(parsed.mint).trim();
        mint = parsedMint ? parsedMint : null;
      }
      if (!amount && Number.isFinite(parsed.amount) && parsed.amount > 0) {
        amount = Math.floor(parsed.amount);
      }
    }
  }

  return { tokenText, mint, unit, amount };
};

export const extractCashuTokenFromText = (text: string): string | null => {
  const raw0 = String(text ?? "").trim();
  if (!raw0) return null;

  const normalizeCandidate = (value: string): string =>
    value.replace(/^cashu/i, "cashu");

  const tryToken = (value: string): string | null => {
    const trimmed = String(value ?? "").trim();
    if (!trimmed) return null;
    const normalized = normalizeCandidate(trimmed);
    return parseCashuToken(normalized) ? normalized : null;
  };

  const tokenRegex = /cashu[0-9A-Za-z_-]+={0,2}/gi;

  const tryInText = (value: string): string | null => {
    const raw = String(value ?? "").trim();
    if (!raw) return null;

    const stripped = raw
      .replace(/^web\+cashu:/i, "")
      .replace(/^cashu:/i, "")
      .replace(/^nostr:/i, "")
      .replace(/^lightning:/i, "")
      .trim();

    const direct = tryToken(stripped);
    if (direct) return direct;

    for (const m of stripped.matchAll(tokenRegex)) {
      const candidate = tryToken(String(m[0] ?? ""));
      if (candidate) return candidate;
    }

    const compact = stripped.replace(/\s+/g, "");
    if (compact && compact !== stripped) {
      const compactDirect = tryToken(compact);
      if (compactDirect) return compactDirect;
      for (const m of compact.matchAll(tokenRegex)) {
        const candidate = tryToken(String(m[0] ?? ""));
        if (candidate) return candidate;
      }
    }

    if (/^https?:\/\//i.test(stripped)) {
      try {
        const u = new URL(stripped);
        const keys = ["token", "cashu", "cashutoken", "cashu_token", "t"];
        for (const key of keys) {
          const v = u.searchParams.get(key);
          if (v) {
            const decoded = (() => {
              try {
                return decodeURIComponent(v);
              } catch {
                return v;
              }
            })();
            const found = tryInText(decoded);
            if (found) return found;
          }
        }

        const hash = String(u.hash ?? "").replace(/^#/, "");
        if (hash) {
          const decodedHash = (() => {
            try {
              return decodeURIComponent(hash);
            } catch {
              return hash;
            }
          })();
          const found = tryInText(decodedHash);
          if (found) return found;
        }
      } catch {
        // ignore
      }
    }

    const tokenField = stripped.match(/"token"\s*:\s*"([^"]+)"/i);
    if (tokenField?.[1]) {
      const decoded = (() => {
        try {
          return decodeURIComponent(tokenField[1]);
        } catch {
          return tokenField[1];
        }
      })();
      const found = tryInText(decoded);
      if (found) return found;
    }

    const firstBrace = stripped.indexOf("{");
    const lastBrace = stripped.lastIndexOf("}");
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      const candidate = stripped.slice(firstBrace, lastBrace + 1).trim();
      const maybe = tryToken(candidate);
      if (maybe) return maybe;
    }

    return null;
  };

  const foundRaw = tryInText(raw0);
  if (foundRaw) return foundRaw;

  if (/%[0-9A-Fa-f]{2}/.test(raw0)) {
    try {
      const decoded = decodeURIComponent(raw0);
      const foundDecoded = tryInText(decoded);
      if (foundDecoded) return foundDecoded;
    } catch {
      // ignore
    }
  }

  return null;
};
