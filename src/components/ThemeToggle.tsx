import { useEffect, useState } from 'react'
import { useI18n } from '../i18n/useI18n'
import { applyTheme, darkQuery, saveTheme, storedTheme, systemTheme, type Theme } from '../theme'

/** Light/dark switch in the header; until the viewer picks one, the system setting decides. */
export function ThemeToggle() {
  const { t } = useI18n()
  const [theme, setTheme] = useState<Theme>(() => storedTheme() ?? systemTheme())

  useEffect(() => {
    const mq = window.matchMedia?.(darkQuery)
    if (!mq) return
    const onChange = () => {
      if (storedTheme() === null) setTheme(systemTheme())
    }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  const next: Theme = theme === 'dark' ? 'light' : 'dark'
  const label = t(next === 'dark' ? 'theme.toDark' : 'theme.toLight')

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={() => {
        applyTheme(next)
        saveTheme(next)
        setTheme(next)
      }}
      aria-label={label}
      title={label}
    >
      {theme === 'dark' ? (
        // sun: switch to light
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <circle cx="12" cy="12" r="4.5" fill="none" stroke="currentColor" strokeWidth="2" />
          <path
            d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      ) : (
        // moon: switch to dark
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <path
            d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinejoin="round"
          />
        </svg>
      )}
      <span className="theme-toggle-text">{t(next === 'dark' ? 'theme.dark' : 'theme.light')}</span>
    </button>
  )
}
