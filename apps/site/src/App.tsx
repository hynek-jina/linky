import { useEffect, useMemo, useRef, useState } from "react";
import {
  getInitialSiteDisplayCurrency,
  siteDisplayCurrencyStorageKey,
  type SiteDisplayCurrency,
} from "./siteDisplayCurrency";
import { SiteHeaderMenu } from "./SiteHeaderMenu";
import { getDefaultSiteLocale } from "./sitePreferences";

type CtaMode = "android-apk" | "google-play" | "web";

type Locale = "cs" | "en";

interface UspItemCopy {
  title: string;
  description: string;
  imageSrc: string;
  imageAlt: string;
}

interface LocaleCopy {
  czechLabel: string;
  currencyLabel: string;
  englishLabel: string;
  htmlLang: string;
  menuLabel: string;
  openAppLabel: string;
  switchLabel: string;
  title: string;
  subtitle: string;
  webCta: string;
  googlePlayCta: string;
  androidApkCta: string;
  ctaMenuLabel: string;
  privacyLabel: string;
  imageTitle: string;
  githubLabel: string;
  nostrLabel: string;
  uspSectionTitle: string;
  uspItems: [UspItemCopy, UspItemCopy, UspItemCopy];
  closingSectionTitle: string;
  closingSectionDescription: string;
  closingImageAlt: string;
}

const latestAndroidApkUrl =
  "https://github.com/hynek-jina/linky/releases/latest/download/linky.apk";
const googlePlayUrl =
  "https://play.google.com/store/apps/details?id=fit.linky.app&pli=1";

const copy: Record<Locale, LocaleCopy> = {
  cs: {
    czechLabel: "Čeština",
    currencyLabel: "Jednotky",
    englishLabel: "English",
    htmlLang: "cs",
    menuLabel: "Menu",
    openAppLabel: "Otevřít aplikaci",
    switchLabel: "Jazyk",
    title: "Budujte svou bitcoinovou síť",
    subtitle:
      "Každou platbou vytváříte a posilujete vztahy s lidmi kolem sebe. S Linky posíláte bitcoin stejně jednoduše jako běžnou zprávu - svým blízkým i komukoliv dalšímu.",
    webCta: "Webová aplikace",
    googlePlayCta: "Google Play",
    androidApkCta: "Android APK",
    ctaMenuLabel: "Možnosti otevření aplikace",
    privacyLabel: "Ochrana soukromí",
    imageTitle: "Fotorealistické setkání lidí s aplikací Linky",
    githubLabel: "GitHub",
    nostrLabel: "Nostr profil",
    uspSectionTitle: "Proč Linky",
    uspItems: [
      {
        title: "Posílejte bitcoin stejně jako zprávu",
        description:
          "Vyberete kontakt, zadáte částku a pošlete platbu stejně jakoukoliv zprávu.",
        imageSrc: "/contacts_mock.png",
        imageAlt: "Ukázka posílání bitcoinu kontaktu v aplikaci Linky",
      },
      {
        title: "Vyžádejte si platbu",
        description:
          "Pošlete si žádost o zaplacení přímo v chatu a druhá strana ji může potvrdit jedním klepnutím.",
        imageSrc: "/request_mock.png",
        imageAlt: "Ukázka žádosti o platbu v aplikaci Linky",
      },
      {
        title: "Pošlete bitcoin i lidem bez peněženky",
        description:
          "Platbu můžete připravit i pro někoho, kdo ještě žádnou peněženku nemá. Linky mu ji pomůže jednoduše převzít.",
        imageSrc: "/issue_mock.png",
        imageAlt:
          "Ukázka sdílení bitcoinu lidem bez peněženky v aplikaci Linky",
      },
    ],
    closingSectionTitle: "Soukromí",
    closingSectionDescription:
      "Uživatelé nepotřebují telefonní číslo, e-mail ani žádné doklady.",
    closingImageAlt:
      "Ukázka soukromého používání aplikace Linky bez osobních údajů",
  },
  en: {
    czechLabel: "Czech",
    currencyLabel: "Units",
    englishLabel: "English",
    htmlLang: "en",
    menuLabel: "Menu",
    openAppLabel: "Open web app",
    switchLabel: "Language",
    title: "Build your bitcoin network",
    subtitle:
      "Every payment helps you grow and strengthen your network of people. With Linky, you send bitcoin as easily as a message - to friends, family, or anyone else.",
    webCta: "Web app",
    googlePlayCta: "Google Play",
    androidApkCta: "Android APK",
    ctaMenuLabel: "App launch options",
    privacyLabel: "Privacy Policy",
    imageTitle: "Photorealistic meeting of people with the Linky app",
    githubLabel: "GitHub",
    nostrLabel: "Nostr profile",
    uspSectionTitle: "Why Linky",
    uspItems: [
      {
        title: "Send bitcoin like a message",
        description:
          "Pick a contact, enter an amount, and send money as naturally as sending a chat message.",
        imageSrc: "/contacts_mock.png",
        imageAlt: "Preview of sending bitcoin to a contact in the Linky app",
      },
      {
        title: "Request a payment",
        description:
          "Send a payment request directly in the chat so the other person can settle it with a single tap.",
        imageSrc: "/request_mock.png",
        imageAlt: "Preview of requesting a payment in the Linky app",
      },
      {
        title: "Send bitcoin even to people without a wallet",
        description:
          "You can prepare a payment for someone who does not have a wallet yet. Linky makes the handoff simple.",
        imageSrc: "/issue_mock.png",
        imageAlt:
          "Preview of sending bitcoin to people without a wallet in the Linky app",
      },
    ],
    closingSectionTitle: "Privacy",
    closingSectionDescription:
      "Users do not need a phone number, email address, or any identity documents.",
    closingImageAlt:
      "Preview of private Linky usage without personal information",
  },
};

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

  return getDefaultSiteLocale();
};

const getDefaultCtaMode = (): CtaMode => {
  if (typeof navigator === "undefined") {
    return "web";
  }

  const userAgent = navigator.userAgent.toLowerCase();
  const isAndroid = userAgent.includes("android");
  const isMobile = userAgent.includes("mobile");

  return isAndroid && isMobile ? "google-play" : "web";
};

interface AppCtaProps {
  androidApkCta: string;
  ctaMenuLabel: string;
  ctaMode: CtaMode;
  googlePlayCta: string;
  onPrimaryAction: () => void;
  onSelectMode: (mode: CtaMode) => void;
  webCta: string;
}

function AppCta({
  androidApkCta,
  ctaMenuLabel,
  ctaMode,
  googlePlayCta,
  onPrimaryAction,
  onSelectMode,
  webCta,
}: AppCtaProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const ctaMenuRef = useRef<HTMLDivElement | null>(null);
  const primaryCtaLabel =
    ctaMode === "google-play"
      ? googlePlayCta
      : ctaMode === "android-apk"
        ? androidApkCta
        : webCta;

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

  return (
    <div className="cta-row" ref={ctaMenuRef}>
      <div className="cta-group">
        <button className="primary-cta" type="button" onClick={onPrimaryAction}>
          {primaryCtaLabel}
        </button>
        <>
          <button
            className={menuOpen ? "cta-toggle is-open" : "cta-toggle"}
            type="button"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label={ctaMenuLabel}
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
                  ctaMode === "web" ? "cta-option is-selected" : "cta-option"
                }
                type="button"
                role="menuitemradio"
                aria-checked={ctaMode === "web"}
                onClick={() => {
                  onSelectMode("web");
                  setMenuOpen(false);
                }}
              >
                <span className="cta-option-label">{webCta}</span>
              </button>
              <button
                className={
                  ctaMode === "google-play"
                    ? "cta-option is-selected"
                    : "cta-option"
                }
                type="button"
                role="menuitemradio"
                aria-checked={ctaMode === "google-play"}
                onClick={() => {
                  onSelectMode("google-play");
                  setMenuOpen(false);
                }}
              >
                <span className="cta-option-label">{googlePlayCta}</span>
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
                  onSelectMode("android-apk");
                  setMenuOpen(false);
                }}
              >
                <span className="cta-option-label">{androidApkCta}</span>
              </button>
            </div>
          ) : null}
        </>
      </div>
    </div>
  );
}

function App() {
  const [locale, setLocale] = useState<Locale>(getInitialLocale);
  const [displayCurrency, setDisplayCurrency] = useState<SiteDisplayCurrency>(
    getInitialSiteDisplayCurrency,
  );
  const [preferredCtaMode, setPreferredCtaMode] =
    useState<CtaMode>(getDefaultCtaMode);
  const activeCopy = useMemo(() => copy[locale], [locale]);
  const ctaMode = preferredCtaMode;

  useEffect(() => {
    document.documentElement.lang = activeCopy.htmlLang;
  }, [activeCopy.htmlLang]);

  useEffect(() => {
    window.localStorage.setItem(localeStorageKey, locale);
  }, [locale]);

  useEffect(() => {
    window.localStorage.setItem(siteDisplayCurrencyStorageKey, displayCurrency);
  }, [displayCurrency]);

  const openWebApp = () => {
    window.open("https://app.linky.fit", "_blank", "noopener,noreferrer");
  };

  const openAndroidApk = () => {
    window.open(latestAndroidApkUrl, "_blank", "noopener,noreferrer");
  };

  const openGooglePlay = () => {
    window.open(googlePlayUrl, "_blank", "noopener,noreferrer");
  };

  const handlePrimaryAction = () => {
    if (ctaMode === "google-play") {
      openGooglePlay();
      return;
    }

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

        <SiteHeaderMenu
          copy={{
            czechLabel: activeCopy.czechLabel,
            currencyLabel: activeCopy.currencyLabel,
            englishLabel: activeCopy.englishLabel,
            menuLabel: activeCopy.menuLabel,
            openAppLabel: activeCopy.openAppLabel,
            switchLabel: activeCopy.switchLabel,
          }}
          displayCurrency={displayCurrency}
          locale={locale}
          onLocaleChange={(nextLocale) => {
            setLocale(nextLocale);
          }}
          setDisplayCurrency={setDisplayCurrency}
        />
      </header>

      <section className="hero">
        <div className="hero-copy">
          <div className="hero-intro">
            <h1>{activeCopy.title}</h1>
            <p className="lede">{activeCopy.subtitle}</p>

            <AppCta
              androidApkCta={activeCopy.androidApkCta}
              ctaMenuLabel={activeCopy.ctaMenuLabel}
              ctaMode={ctaMode}
              googlePlayCta={activeCopy.googlePlayCta}
              onPrimaryAction={handlePrimaryAction}
              onSelectMode={setPreferredCtaMode}
              webCta={activeCopy.webCta}
            />
          </div>

          <div className="hero-visual" aria-label={activeCopy.imageTitle}>
            <img
              className="hero-image"
              src="/app_in_hand.png"
              alt={activeCopy.imageTitle}
            />
          </div>
        </div>
      </section>

      <section className="usp-section" aria-label={activeCopy.uspSectionTitle}>
        <div className="usp-grid">
          {activeCopy.uspItems.map((item) => {
            return (
              <article key={item.title} className="usp-card">
                <div className="usp-card-media">
                  <img src={item.imageSrc} alt={item.imageAlt} />
                </div>
                <div className="usp-card-copy">
                  <h2>{item.title}</h2>
                  <p>{item.description}</p>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="closing-section">
        <div className="closing-copy">
          <h2>{activeCopy.closingSectionTitle}</h2>
          <p>{activeCopy.closingSectionDescription}</p>
          <AppCta
            androidApkCta={activeCopy.androidApkCta}
            ctaMenuLabel={activeCopy.ctaMenuLabel}
            ctaMode={ctaMode}
            googlePlayCta={activeCopy.googlePlayCta}
            onPrimaryAction={handlePrimaryAction}
            onSelectMode={setPreferredCtaMode}
            webCta={activeCopy.webCta}
          />
        </div>

        <div className="closing-visual">
          <img
            className="closing-image"
            src="/not_personal.png"
            alt={activeCopy.closingImageAlt}
          />
        </div>
      </section>

      <footer className="footer-links">
        <a href="/cashu/">Cashu</a>
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
