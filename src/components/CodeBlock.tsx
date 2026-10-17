import { useEffect, useRef, useState } from 'react'
import { useI18n } from '../i18n/useI18n'

type Copy = 'idle' | 'copied' | 'selected'

/** Copies via the Clipboard API; on plain http (not localhost) it is missing, so the text gets selected instead. */
async function copyText(text: string, pre: HTMLElement | null): Promise<Copy> {
  try {
    await navigator.clipboard.writeText(text)
    return 'copied'
  } catch {
    // fall through to selection
  }
  if (!pre) return 'idle'
  try {
    const range = document.createRange()
    range.selectNodeContents(pre)
    const sel = window.getSelection()
    sel?.removeAllRanges()
    sel?.addRange(range)
    return document.execCommand('copy') ? 'copied' : 'selected'
  } catch {
    return 'selected'
  }
}

type Props = { code: string; label?: string }

export function CodeBlock({ code, label }: Props) {
  const { t } = useI18n()
  const [copy, setCopy] = useState<Copy>('idle')
  const preRef = useRef<HTMLPreElement>(null)

  useEffect(() => {
    if (copy === 'idle') return
    const t = window.setTimeout(() => setCopy('idle'), 2000)
    return () => window.clearTimeout(t)
  }, [copy])

  async function onCopy() {
    setCopy(await copyText(code, preRef.current))
  }

  return (
    <div className="code">
      <div className="code-head">
        <span className="code-label">{label}</span>
        <button type="button" className="code-copy" onClick={onCopy} aria-live="polite">
          {t(copy === 'copied' ? 'code.copied' : copy === 'selected' ? 'code.selected' : 'code.copy')}
        </button>
      </div>
      <pre ref={preRef} tabIndex={0}>
        <code>{code}</code>
      </pre>
    </div>
  )
}
