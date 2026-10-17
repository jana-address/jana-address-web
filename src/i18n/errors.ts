import type { TranslationKey } from './translations'

/**
 * An error shown to the user: the text is looked up by key at display time, so it follows the language.
 * status and detail (an HTTP code, a server or parser message) are appended as they are.
 */
export class KeyedError extends Error {
  readonly key: TranslationKey
  readonly status?: number
  readonly detail?: string

  constructor(key: TranslationKey, opts: { status?: number; detail?: string } = {}) {
    super(opts.detail ? `${key}: ${opts.detail}` : key)
    this.key = key
    this.status = opts.status
    this.detail = opts.detail
  }
}

/** The text of any error in the current language. */
export function errorText(err: unknown, t: (key: TranslationKey) => string): string {
  if (err instanceof KeyedError) {
    return `${t(err.key)}${err.status ? ` (HTTP ${err.status})` : ''}${err.detail ? `: ${err.detail}` : ''}`
  }
  if (err instanceof Error) return err.message
  return String(err)
}
