import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { DEFAULT_LANG, LANGUAGES } from './translations'
import { useI18n } from './useI18n'
import './LanguageSwitcher.css'

/** Language menu in the header: Қазақша, Русский, English. The choice is kept in the browser. */
export default function LanguageSwitcher() {
  const { lang, setLang, t } = useI18n()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const current = LANGUAGES.find((l) => l.code === lang) ?? LANGUAGES.find((l) => l.code === DEFAULT_LANG)!

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        btnRef.current?.focus()
      }
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    // focus the current language, so arrow keys and Enter work right away
    rootRef.current?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus()
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  function onMenuKey(e: ReactKeyboardEvent<HTMLUListElement>) {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    e.preventDefault()
    const items = [...(rootRef.current?.querySelectorAll<HTMLElement>('[role="menuitemradio"]') ?? [])]
    const i = items.indexOf(document.activeElement as HTMLElement)
    const next = (i + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length
    items[next]?.focus()
  }

  return (
    <div className="lang" ref={rootRef}>
      <button
        ref={btnRef}
        type="button"
        className="lang-button"
        aria-label={`${t('lang.label')}: ${current.label}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18" />
          <path d="M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3z" />
        </svg>
        <span className="lang-current">{current.code.toUpperCase()}</span>
      </button>

      {open && (
        <ul className="lang-menu" role="menu" aria-label={t('lang.label')} onKeyDown={onMenuKey}>
          {LANGUAGES.map((l) => (
            <li key={l.code} role="none">
              <button
                type="button"
                role="menuitemradio"
                aria-checked={l.code === lang}
                lang={l.code}
                className="lang-item"
                onClick={() => {
                  setLang(l.code)
                  setOpen(false)
                  btnRef.current?.focus()
                }}
              >
                {l.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
