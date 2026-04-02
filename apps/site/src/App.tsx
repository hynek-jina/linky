import { useEffect, useMemo, useRef, useState } from "react";
import { SiteHeaderMenu } from "./SiteHeaderMenu";
import {
  getInitialSiteDisplayCurrency,
  siteDisplayCurrencyStorageKey,
  type SiteDisplayCurrency,
} from "./siteDisplayCurrency";

type CtaMode = "android-apk" | "web";

type Locale = "cs" | "en";

interface FeatureVideoCopy {
  title: string;
  description: string;
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
  androidApkCta: string;
  ctaMenuLabel: string;
  privacyLabel: string;
  imageTitle: string;
  githubLabel: string;
  nostrLabel: string;
  featureSectionTitle: string;
  featureVideos: [
    FeatureVideoCopy,
    FeatureVideoCopy,
    FeatureVideoCopy,
    FeatureVideoCopy,
  ];
}

const latestAndroidApkUrl =
  "https://github.com/hynek-jina/linky/releases/latest/download/linky.apk";

const copy: Record<Locale, LocaleCopy> = {
  cs: {
    czechLabel: "Čeština",
    currencyLabel: "Měna",
    englishLabel: "English",
    htmlLang: "cs",
    menuLabel: "Menu",
    openAppLabel: "Otevřít aplikaci",
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
    featureSectionTitle: "Jak to funguje",
    featureVideos: [
      {
        title: "Vytvoření profilu",
        description: "Na tři kliknutí máte profil a lightning adresu.",
      },
      {
        title: "Nahrání prostředků",
        description:
          "Po kliknutí na Přijmout zadáte částku. Jakmile proplatíte lightnign fakturu, tak se vám prostředky objeví v Linky.",
      },
      {
        title: "Přidání kontaktu",
        description: "Načtete QR kód a kontakt se sám přidá.",
      },
      {
        title: "Platba na kontakt",
        description:
          "U kontaktu vyberete platbu, zadáte částku a potvrdíte. Hotovo.",
      },
    ],
  },
  en: {
    czechLabel: "Czech",
    currencyLabel: "Currency",
    englishLabel: "English",
    htmlLang: "en",
    menuLabel: "Menu",
    openAppLabel: "Open web app",
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
    featureSectionTitle: "How it works",
    featureVideos: [
      {
        title: "Creating a profile",
        description:
          "In just a few taps, you have your profile and lightning address ready to go.",
      },
      {
        title: "Uploading funds",
        description:
          "After clicking Accept, you enter the amount. Once you pay the lightning invoice, the funds appear in Linky.",
      },
      {
        title: "Adding a contact",
        description: "Scan a QR code and the contact is automatically added.",
      },
      {
        title: "Paying a contact",
        description: "Select a contact, enter the amount, and confirm. Done.",
      },
    ],
  },
};

const localeStorageKey = "linky.lang";
const featureVideoSources = [
  "/videos/feature-1.webm",
  "/videos/feature-2.webm",
  "/videos/feature-3.webm",
  "/videos/feature-4.webm",
] as const;

const isNodeTarget = (value: EventTarget | null): value is Node => {
  return value instanceof Node;
};

const isVideoElement = (
  value: HTMLVideoElement | null | undefined,
): value is HTMLVideoElement => {
  return value instanceof HTMLVideoElement;
};

const isHTMLElement = (
  value: Element | null | undefined,
): value is HTMLElement => {
  return value instanceof HTMLElement;
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
  const [displayCurrency, setDisplayCurrency] = useState<SiteDisplayCurrency>(
    getInitialSiteDisplayCurrency,
  );
  const [preferredCtaMode, setPreferredCtaMode] = useState<CtaMode>("web");
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeFeatureIndex, setActiveFeatureIndex] = useState(0);
  const [isFeaturePlaying, setIsFeaturePlaying] = useState(false);
  const [currentFeatureAspectRatio, setCurrentFeatureAspectRatio] =
    useState<number>(9 / 19.5);
  const activeCopy = useMemo(() => copy[locale], [locale]);
  const activeFeature = activeCopy.featureVideos[activeFeatureIndex];
  const ctaMenuRef = useRef<HTMLDivElement | null>(null);
  const featureSectionRef = useRef<HTMLElement | null>(null);
  const featureVideoRef = useRef<HTMLVideoElement | null>(null);
  const featurePlaybackStartedRef = useRef(false);
  const playedFeatureIndexesRef = useRef<Set<number>>(new Set());
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
    window.localStorage.setItem(siteDisplayCurrencyStorageKey, displayCurrency);
  }, [displayCurrency]);

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

  const resetFeaturePlayback = () => {
    playedFeatureIndexesRef.current.clear();
    featurePlaybackStartedRef.current = false;
    setActiveFeatureIndex(0);
    setIsFeaturePlaying(false);
    setCurrentFeatureAspectRatio(9 / 19.5);

    const video = featureVideoRef.current;
    if (isVideoElement(video)) {
      video.pause();
      video.currentTime = 0;
    }
  };

  const playFeature = (index: number) => {
    playedFeatureIndexesRef.current.delete(index);
    featurePlaybackStartedRef.current = true;
    if (activeFeatureIndex === index) {
      const video = featureVideoRef.current;
      if (!isVideoElement(video)) {
        return;
      }

      video.currentTime = 0;
      void video
        .play()
        .then(() => {
          setIsFeaturePlaying(true);
        })
        .catch(() => {
          setIsFeaturePlaying(false);
        });
      return;
    }

    setActiveFeatureIndex(index);
  };

  useEffect(() => {
    const video = featureVideoRef.current;
    if (!isVideoElement(video)) {
      return;
    }

    const handleVideoEnd = () => {
      playedFeatureIndexesRef.current.add(activeFeatureIndex);
      setIsFeaturePlaying(false);

      const nextIndex = activeFeatureIndex + 1;
      if (nextIndex < featureVideoSources.length) {
        setActiveFeatureIndex(nextIndex);
        featurePlaybackStartedRef.current = true;
      }
    };

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && isHTMLElement(entry.target)) {
            if (playedFeatureIndexesRef.current.has(activeFeatureIndex)) {
              continue;
            }

            featurePlaybackStartedRef.current = true;
            video.currentTime = 0;
            void video
              .play()
              .then(() => {
                setIsFeaturePlaying(true);
              })
              .catch(() => {
                setIsFeaturePlaying(false);
              });
          }
        }
      },
      {
        threshold: 0.65,
        rootMargin: "0px 0px -8% 0px",
      },
    );

    const section = featureSectionRef.current;
    if (isHTMLElement(section)) {
      observer.observe(section);
    }

    video.addEventListener("ended", handleVideoEnd);

    return () => {
      observer.disconnect();
      video.removeEventListener("ended", handleVideoEnd);
    };
  }, [activeFeatureIndex]);

  useEffect(() => {
    const video = featureVideoRef.current;
    if (!isVideoElement(video) || !featurePlaybackStartedRef.current) {
      return;
    }

    video.currentTime = 0;
    void video
      .play()
      .then(() => {
        setIsFeaturePlaying(true);
      })
      .catch(() => {
        setIsFeaturePlaying(false);
      });
  }, [activeFeatureIndex]);

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
            resetFeaturePlayback();
            setLocale(nextLocale);
          }}
          setDisplayCurrency={setDisplayCurrency}
        />
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

      <section className="feature-showcase" ref={featureSectionRef}>
        <div className="section-heading">
          <h2>{activeCopy.featureSectionTitle}</h2>
        </div>

        <article
          className={
            isFeaturePlaying ? "feature-stage is-active" : "feature-stage"
          }
          aria-label={activeCopy.featureSectionTitle}
        >
          <div
            className="feature-stage-media"
            style={{ aspectRatio: String(currentFeatureAspectRatio) }}
            onMouseEnter={() => {
              if (playedFeatureIndexesRef.current.has(activeFeatureIndex)) {
                return;
              }

              playFeature(activeFeatureIndex);
            }}
          >
            <video
              key={featureVideoSources[activeFeatureIndex]}
              ref={featureVideoRef}
              className="feature-video"
              src={featureVideoSources[activeFeatureIndex]}
              muted
              playsInline
              preload="metadata"
              onLoadedMetadata={(event) => {
                const video = event.currentTarget;
                const aspectRatio =
                  video.videoWidth > 0 && video.videoHeight > 0
                    ? video.videoWidth / video.videoHeight
                    : 9 / 19.5;

                setCurrentFeatureAspectRatio(aspectRatio);
              }}
            />
          </div>

          <div className="feature-copy">
            <p className="feature-index">0{activeFeatureIndex + 1}</p>
            <h3>{activeFeature.title}</h3>
            <p>{activeFeature.description}</p>
          </div>

          <div className="feature-dots" aria-label="Feature video navigation">
            {featureVideoSources.map((source, index) => {
              const isSelected = index === activeFeatureIndex;

              return (
                <button
                  key={source}
                  className={
                    isSelected ? "feature-dot is-active" : "feature-dot"
                  }
                  type="button"
                  aria-label={`Video ${index + 1}`}
                  aria-pressed={isSelected}
                  onClick={() => {
                    setIsFeaturePlaying(false);
                    playFeature(index);
                  }}
                />
              );
            })}
          </div>
        </article>
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
