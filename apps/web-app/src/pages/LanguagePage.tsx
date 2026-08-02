import React from "react";
import {
  useAppShellActions,
  useAppShellCore,
} from "../app/context/AppShellContexts";
import type { Lang } from "../i18n";

const LANGUAGES: ReadonlyArray<{
  key: "czech" | "german" | "english";
  value: Lang;
}> = [
  { key: "czech", value: "cs" },
  { key: "german", value: "de" },
  { key: "english", value: "en" },
];

export function LanguagePage(): React.ReactElement {
  const { lang, t } = useAppShellCore();
  const { setLang } = useAppShellActions();

  return (
    <section className="panel">
      {LANGUAGES.map((language) => {
        const isSelected = lang === language.value;

        return (
          <button
            type="button"
            className={`settings-row settings-link language-option${isSelected ? " is-selected" : ""}`}
            key={language.value}
            aria-pressed={isSelected}
            onClick={() => setLang(language.value)}
          >
            <span className="settings-left">
              <span className="settings-label">{t(language.key)}</span>
            </span>
          </button>
        );
      })}
    </section>
  );
}
