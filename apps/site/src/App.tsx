import { useEffect, useMemo, useRef, useState } from "react";

type CtaMode = "android-apk" | "web";

type Locale = "cs" | "en";

interface LocaleCopy {
  htmlLang: string;
  switchLabel: string;
  title: string;
  subtitle: string;
  webCta: string;
  androidApkCta: string;
  ctaMenuLabel: string;
  privacyLabel: string;
  imageTitle: string;
  githubLabel: string;
  nostrLabel: string;
}

const latestAndroidApkUrl =
  "https://github.com/hynek-jina/linky/releases/latest/download/linky.apk";

const copy: Record<Locale, LocaleCopy> = {
  cs: {
    htmlLang: "cs",
    switchLabel: "Jazyk",
    title: "Bitcoin pro lidi, na kterých vám záleží",
    subtitle:
      "Linky přináší svobodu komunikace i plateb v jedné aplikaci. Díky cashu snadno zaplatíte, nostr zajistí soukromé zprávy a evolu se postará o bezpečnou synchronizaci vašich dat.",
    webCta: "Webová aplikace",
    androidApkCta: "Android APK",
    ctaMenuLabel: "Možnosti otevření aplikace",
    privacyLabel: "Ochrana soukromí",
    imageTitle: "Fotorealistické setkání lidí s aplikací Linky",
    githubLabel: "GitHub",
    nostrLabel: "Nostr profil",
  },
  en: {
    htmlLang: "en",
    switchLabel: "Language",
    title: "Bitcoin for the people you care about",
    subtitle:
      "Linky brings freedom to communication and payments in a single app. Cashu makes payments easy, nostr ensures private messaging, and evolu takes care of securely syncing your data.",
    webCta: "Web app",
    androidApkCta: "Android APK",
    ctaMenuLabel: "App launch options",
    privacyLabel: "Privacy Policy",
    imageTitle: "Photorealistic meeting of people with the Linky app",
    githubLabel: "GitHub",
    nostrLabel: "Nostr profile",
  },
};

const localeLabels: Record<Locale, string> = {
  cs: "CZ",
  en: "EN",
};

const localeOptions: Locale[] = ["cs", "en"];
const localeStorageKey = "linky.lang";

const isNodeTarget = (value: EventTarget | null): value is Node => {
  return value instanceof Node;
};

const getInitialLocale = (): Locale => {
  if (typeof window !== "undefined") {
    const savedLocale = window.localStorage.getItem(localeStorageKey);
    if (savedLocale === "cs" || savedLocale === "en") {
      return savedLocale;
    }
  }

  if (typeof navigator === "undefined") return "cs";
  const languages = Array.isArray(navigator.languages)
    ? navigator.languages
    : [navigator.language];

  for (const language of languages) {
    const normalized = String(language ?? "").toLowerCase();
    if (normalized.startsWith("cs")) return "cs";
    if (normalized.startsWith("en")) return "en";
  }

  return "cs";
};

function App() {
  const [locale, setLocale] = useState<Locale>(getInitialLocale);
  const [preferredCtaMode, setPreferredCtaMode] = useState<CtaMode>("web");
  const [menuOpen, setMenuOpen] = useState(false);
  const activeCopy = useMemo(() => copy[locale], [locale]);
  const ctaMenuRef = useRef<HTMLDivElement | null>(null);
  const ctaMode = preferredCtaMode === "android-apk" ? "android-apk" : "web";
  const primaryCtaLabel =
    ctaMode === "android-apk" ? activeCopy.androidApkCta : activeCopy.webCta;

  useEffect(() => {
    document.documentElement.lang = activeCopy.htmlLang;
  }, [activeCopy.htmlLang]);

  useEffect(() => {
    window.localStorage.setItem(localeStorageKey, locale);
  }, [locale]);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!isNodeTarget(event.target)) {
        setMenuOpen(false);
        return;
      }

      if (!ctaMenuRef.current?.contains(event.target)) {
        setMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, []);

  const openWebApp = () => {
    window.open("https://app.linky.fit", "_blank", "noopener,noreferrer");
  };

  const openAndroidApk = () => {
    window.open(latestAndroidApkUrl, "_blank", "noopener,noreferrer");
  };

  const handlePrimaryAction = () => {
    if (ctaMode === "android-apk") {
      openAndroidApk();
      return;
    }

    openWebApp();
  };

  return (
    <main className="site-shell">
      <div className="site-backdrop" aria-hidden="true" />

      <header className="topbar">
        <a className="brand" href="/" aria-label="Linky home">
          <span className="brand-mark">
            <img className="brand-logo" src="/icon.svg" alt="Linky" />
          </span>
          <span className="brand-word">Linky</span>
        </a>

        <div className="locale-switch" aria-label={activeCopy.switchLabel}>
          {localeOptions.map((nextLocale) => {
            const selected = nextLocale === locale;
            return (
              <button
                key={nextLocale}
                className={selected ? "locale-pill is-active" : "locale-pill"}
                type="button"
                onClick={() => setLocale(nextLocale)}
                aria-pressed={selected}
              >
                {localeLabels[nextLocale]}
              </button>
            );
          })}
        </div>
      </header>

      <section className="hero">
        <div className="hero-copy">
          <h1>{activeCopy.title}</h1>
          <p className="lede">{activeCopy.subtitle}</p>

          <div className="cta-row" ref={ctaMenuRef}>
            <div className="cta-group">
              <button
                className="primary-cta"
                type="button"
                onClick={handlePrimaryAction}
              >
                {primaryCtaLabel}
              </button>
              <>
                <button
                  className={menuOpen ? "cta-toggle is-open" : "cta-toggle"}
                  type="button"
                  aria-haspopup="menu"
                  aria-expanded={menuOpen}
                  aria-label={activeCopy.ctaMenuLabel}
                  onClick={() => setMenuOpen((value) => !value)}
                >
                  <span className="cta-toggle-icon" aria-hidden="true">
                    ▾
                  </span>
                </button>

                {menuOpen ? (
                  <div className="cta-menu" role="menu">
                    <button
                      className={
                        ctaMode === "web"
                          ? "cta-option is-selected"
                          : "cta-option"
                      }
                      type="button"
                      role="menuitemradio"
                      aria-checked={ctaMode === "web"}
                      onClick={() => {
                        setPreferredCtaMode("web");
                        setMenuOpen(false);
                      }}
                    >
                      <span className="cta-option-label">
                        {activeCopy.webCta}
                      </span>
                    </button>
                    <button
                      className={
                        ctaMode === "android-apk"
                          ? "cta-option is-selected"
                          : "cta-option"
                      }
                      type="button"
                      role="menuitemradio"
                      aria-checked={ctaMode === "android-apk"}
                      onClick={() => {
                        setPreferredCtaMode("android-apk");
                        setMenuOpen(false);
                      }}
                    >
                      <span className="cta-option-label">
                        {activeCopy.androidApkCta}
                      </span>
                    </button>
                  </div>
                ) : null}
              </>
            </div>
          </div>
        </div>

        <aside className="hero-visual" aria-label={activeCopy.imageTitle}>
          <img
            className="hero-image"
            src="/hero-meeting.png"
            alt={activeCopy.imageTitle}
          />
        </aside>
      </section>

      <footer className="footer-links">
        <a
          href="https://github.com/hynek-jina/linky"
          target="_blank"
          rel="noreferrer"
        >
          {activeCopy.githubLabel}
        </a>
        <a href="nostr://npub1kkht6jvgr8mt4844saf80j5jjwyy6fdy90sxsuxt4hfv8pel499s96jvz8">
          {activeCopy.nostrLabel}
        </a>
        <a href="/privacy.html">{activeCopy.privacyLabel}</a>
      </footer>
    </main>
  );
}

export default App;
