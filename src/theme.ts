export type Theme = 'light' | 'dark'

const KEY = 'jana-address:theme'

/** The theme the viewer picked, or null to follow the system setting. */
export function storedTheme(): Theme | null {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'light' || v === 'dark' ? v : null
  } catch {
    return null
  }
}

export function saveTheme(t: Theme) {
  try {
    localStorage.setItem(KEY, t)
  } catch {
    // private mode or blocked storage: the choice lasts until reload
  }
}

/** Sets data-theme on <html>; without it the stylesheet follows prefers-color-scheme. */
export function applyTheme(t: Theme | null) {
  if (t) document.documentElement.dataset.theme = t
  else delete document.documentElement.dataset.theme
}

export const darkQuery = '(prefers-color-scheme: dark)'

export function systemTheme(): Theme {
  return window.matchMedia?.(darkQuery).matches ? 'dark' : 'light'
}
