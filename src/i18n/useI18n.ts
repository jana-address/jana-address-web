import { createContext, useContext } from 'react'
import type { LangCode, TranslationKey } from './translations'

export type Vars = Record<string, string | number>

export type I18nValue = {
  lang: LangCode
  setLang: (lang: LangCode) => void
  /** Text by key, {name} replaced from vars. */
  t: (key: TranslationKey, vars?: Vars) => string
  /** Plural text: the form for n is picked by the language rules, {n} is the formatted number. */
  tp: (key: TranslationKey, n: number, vars?: Vars) => string
  /** A number formatted for the language: 10 000, 10,000. */
  num: (n: number) => string
  /** Day, month and time for the language. */
  time: (ms: number) => string
}

export const I18nContext = createContext<I18nValue | null>(null)

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useI18n must be used inside <I18nProvider>')
  return ctx
}
