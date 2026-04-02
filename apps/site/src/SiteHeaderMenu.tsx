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
                A
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
                ₿
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
