import { createContext, useContext } from "react";
import type { LangCode, TranslationKey } from "./translations";

export type I18nValue = {
  lang: LangCode;
  setLang: (lang: LangCode) => void;
  t: (key: TranslationKey) => string;
};

export const I18nContext = createContext<I18nValue | null>(null);

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n должен вызываться внутри <I18nProvider>");
  return ctx;
}
