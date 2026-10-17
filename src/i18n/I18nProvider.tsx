import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { I18nContext, type I18nValue, type Vars } from './useI18n'
import { DEFAULT_LANG, LANGUAGES, translations, type LangCode, type TranslationKey } from './translations'

const STORAGE_KEY = 'jana-address:lang'

function isLang(value: unknown): value is LangCode {
  return LANGUAGES.some((l) => l.code === value)
}

// the saved choice first, then Kazakh for a Kazakh browser, otherwise Russian: the service works in
// Kazakhstan, so an English browser of an operator does not switch the interface; English is picked by hand
function detectLang(): LangCode {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (isLang(saved)) return saved
  } catch {
    // storage unavailable
  }
  return (navigator.language || '').toLowerCase().startsWith('kk') ? 'kk' : DEFAULT_LANG
}

function fill(text: string, vars?: Vars): string {
  if (!vars) return text
  return text.replace(/\{(\w+)\}/g, (m, name: string) => (name in vars ? String(vars[name]) : m))
}

// plural form index by language: Russian one|few|many, English one|other, Kazakh has one form after a number
function formIndex(lang: LangCode, n: number): number {
  const rule = new Intl.PluralRules(lang === 'kk' ? 'en' : lang).select(n)
  if (lang === 'ru') return rule === 'one' ? 0 : rule === 'few' ? 1 : 2
  return rule === 'one' ? 0 : 1
}

export default function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<LangCode>(detectLang)

  useEffect(() => {
    document.documentElement.lang = lang
  }, [lang])

  const setLang = useCallback((next: LangCode) => {
    setLangState(next)
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // the choice lasts until reload
    }
  }, [])

  const value = useMemo<I18nValue>(() => {
    const locale = LANGUAGES.find((l) => l.code === lang)?.locale ?? 'ru-RU'
    const numbers = new Intl.NumberFormat(locale)
    const dates = new Intl.DateTimeFormat(locale, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
    const text = (key: TranslationKey) => translations[lang][key] || translations[DEFAULT_LANG][key] || key
    const num = (n: number) => numbers.format(n)
    return {
      lang,
      setLang,
      t: (key, vars) => fill(text(key), vars),
      tp: (key, n, vars) => {
        const forms = text(key).split('|')
        const form = forms[Math.min(formIndex(lang, n), forms.length - 1)]
        return fill(form, { n: num(n), ...vars })
      },
      num,
      time: (ms) => (ms ? dates.format(ms) : ''),
    }
  }, [lang, setLang])

  return <I18nContext value={value}>{children}</I18nContext>
}
