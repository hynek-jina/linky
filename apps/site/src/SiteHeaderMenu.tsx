import { useEffect, useRef, useState } from "react";
import {
  parseSiteDisplayCurrency,
  type SiteDisplayCurrency,
} from "./siteDisplayCurrency";

export interface SiteHeaderMenuCopy {
  czechLabel: string;
  currencyLabel: string;
  englishLabel: string;
  menuLabel: string;
  openAppLabel: string;
  switchLabel: string;
}

interface SiteHeaderMenuProps {
  copy: SiteHeaderMenuCopy;
  displayCurrency: SiteDisplayCurrency;
  locale: "cs" | "en";
  onLocaleChange: (locale: "cs" | "en") => void;
  setDisplayCurrency: (currency: SiteDisplayCurrency) => void;
}

const isNodeTarget = (value: EventTarget | null): value is Node => {
  return value instanceof Node;
};

const appUrl = "https://app.linky.fit";

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

function SiteBitcoinIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M11.767 19.089c4.924.868 6.14-6.025 1.216-6.894m-1.216 6.894L5.86 18.047m5.908 1.042-.347 1.97m1.563-8.864c4.924.869 6.14-6.025 1.215-6.893m-1.215 6.893-3.94-.694m5.155-6.2L8.29 4.26m5.908 1.042.348-1.97M7.48 20.364l3.126-17.727" />
    </svg>
  );
}

export function SiteHeaderMenu({
  copy,
  displayCurrency,
  locale,
  onLocaleChange,
  setDisplayCurrency,
}: SiteHeaderMenuProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!isNodeTarget(event.target)) {
        setMenuOpen(false);
        return;
      }

      if (!menuRef.current?.contains(event.target)) {
        setMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, []);

  return (
    <div className="site-menu" ref={menuRef}>
      <button
        className={menuOpen ? "site-menu-trigger is-open" : "site-menu-trigger"}
        type="button"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-label={copy.menuLabel}
        onClick={() => setMenuOpen((value) => !value)}
      >
        <span className="site-menu-trigger-lines" aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
      </button>

      {menuOpen ? (
        <div
          className="site-menu-sheet"
          role="menu"
          aria-label={copy.menuLabel}
        >
          <div className="site-menu-row">
            <div className="site-menu-left">
              <span className="site-menu-icon" aria-hidden="true">
                <SiteLanguagesIcon />
              </span>
              <span className="site-menu-label">{copy.switchLabel}</span>
            </div>
            <div className="site-menu-right">
              <select
                className="site-menu-select"
                value={locale}
                onChange={(event) => {
                  onLocaleChange(event.target.value === "cs" ? "cs" : "en");
                  setMenuOpen(false);
                }}
                aria-label={copy.switchLabel}
              >
                <option value="cs">{copy.czechLabel}</option>
                <option value="en">{copy.englishLabel}</option>
              </select>
            </div>
          </div>

          <div className="site-menu-row">
            <div className="site-menu-left">
              <span className="site-menu-icon" aria-hidden="true">
                <SiteBitcoinIcon />
              </span>
              <span className="site-menu-label">{copy.currencyLabel}</span>
            </div>
            <div className="site-menu-right">
              <select
                className="site-menu-select"
                value={displayCurrency}
                onChange={(event) => {
                  setDisplayCurrency(
                    parseSiteDisplayCurrency(event.target.value),
                  );
                  setMenuOpen(false);
                }}
                aria-label={copy.currencyLabel}
              >
                <option value="sat">sat</option>
                <option value="btc">₿</option>
                <option value="czk">Kč</option>
                <option value="usd">USD</option>
              </select>
            </div>
          </div>

          <button
            type="button"
            className="site-menu-row site-menu-link site-menu-link-primary"
            onClick={() => {
              setMenuOpen(false);
              window.open(appUrl, "_blank", "noopener,noreferrer");
            }}
          >
            <span className="site-menu-label">{copy.openAppLabel}</span>
          </button>
        </div>
      ) : null}
    </div>
  );
}
