import React from "react";
import {
  getInitialLang,
  persistLang,
  translations,
  type Lang,
} from "../../i18n";

type TranslationKey = keyof (typeof translations)["cs"];

const hasTranslationKey = (key: string): key is TranslationKey =>
  Object.prototype.hasOwnProperty.call(translations.cs, key);

export const useAppLanguage = () => {
  const [lang, setLang] = React.useState<Lang>(() => getInitialLang());
  const t = React.useCallback(
    (key: string) => (hasTranslationKey(key) ? translations[lang][key] : key),
    [lang],
  );

  React.useEffect(() => {
    persistLang(lang);
    try {
      document.documentElement.lang = lang;
      document.documentElement.setAttribute("translate", "no");
      document.documentElement.classList.add("notranslate");
    } catch {
      // ignore
    }
  }, [lang]);

  return { lang, setLang, t };
};
