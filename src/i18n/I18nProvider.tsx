import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { I18nContext } from "./useI18n";
import {
  DEFAULT_LANG,
  LANGUAGES,
  translations,
  type LangCode,
  type TranslationKey,
} from "./translations";

const STORAGE_KEY = "jana-lang";

function isLang(value: unknown): value is LangCode {
  return LANGUAGES.some((l) => l.code === value);
}

// Сначала сохранённый выбор, затем язык браузера, затем русский.
function detectLang(): LangCode {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (isLang(saved)) return saved;
  } catch {
    /* localStorage недоступен */
  }
  const browser = (navigator.language || "").slice(0, 2).toLowerCase();
  return isLang(browser) ? browser : DEFAULT_LANG;
}

export default function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<LangCode>(detectLang);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = useCallback((next: LangCode) => {
    setLangState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  }, []);

  const t = useCallback(
    (key: TranslationKey) => translations[lang][key] ?? translations[DEFAULT_LANG][key] ?? key,
    [lang],
  );

  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);

  return <I18nContext value={value}>{children}</I18nContext>;
}
