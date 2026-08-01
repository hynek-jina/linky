import type { SiteLocale } from "./sitePreferences";

export interface SiteHeaderMenuCopy {
  czechLabel: string;
  englishLabel: string;
  germanLabel: string;
  switchLabel: string;
}

interface SiteHeaderMenuProps {
  copy: SiteHeaderMenuCopy;
  locale: SiteLocale;
  onLocaleChange: (locale: SiteLocale) => void;
}

function SiteLanguagesIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="m5 8 6 6" />
      <path d="m4 14 6-6 2-3" />
      <path d="M2 5h12" />
      <path d="M7 2h1" />
      <path d="m22 22-5-10-5 10" />
      <path d="M14 18h6" />
    </svg>
  );
}

export function SiteHeaderMenu({
  copy,
  locale,
  onLocaleChange,
}: SiteHeaderMenuProps) {
  return (
    <label className="site-language-switcher">
      <span className="site-language-icon" aria-hidden="true">
        <SiteLanguagesIcon />
      </span>
      <span className="sr-only">{copy.switchLabel}</span>
      <select
        className="site-language-select"
        value={locale}
        onChange={(event) => {
          onLocaleChange(
            event.target.value === "cs" || event.target.value === "de"
              ? event.target.value
              : "en",
          );
        }}
        aria-label={copy.switchLabel}
      >
        <option value="cs">{copy.czechLabel}</option>
        <option value="de">{copy.germanLabel}</option>
        <option value="en">{copy.englishLabel}</option>
      </select>
    </label>
  );
}
