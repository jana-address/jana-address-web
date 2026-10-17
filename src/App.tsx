import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { errorMessage, isAbort, parseOne, type ParseResponse } from './api'
import { BatchPanel } from './components/BatchPanel'
import { ConfidenceBadge } from './components/ConfidenceBadge'
import { FieldsTable } from './components/FieldsTable'
import { HealthIndicator } from './components/HealthIndicator'
import { ThemeToggle } from './components/ThemeToggle'
import { Highlight, HighlightLegend } from './components/Highlight'
import { Docs } from './pages/Docs'

type Page = 'parse' | 'docs'

const ROUTES: Record<Page, string> = { parse: '/', docs: '/docs' }
const TITLES: Record<Page, string> = { parse: 'Jana Address', docs: 'Документация · Jana Address' }

function pageOf(pathname: string): Page {
  return /^\/docs\/?$/.test(pathname) ? 'docs' : 'parse'
}

const EXAMPLES = [
  'город Алматы/Алматы қаласы, Мкр Аксай 3а, 59, кв 70',
  'Нурсити 2 микрорайон 11дом 5 подьезд 239 кв',
  'Туран 55/6 магазин береке 4подьезд 9этаж',
  'Турксибский район, Рыбинский переулок, дом 4',
  'город Актобе/Ақтөбе қаласы, Назарбаева8, кв 12',
]

export default function App() {
  const [page, setPage] = useState<Page>(() => pageOf(window.location.pathname))

  useEffect(() => {
    const onPop = () => setPage(pageOf(window.location.pathname))
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  useEffect(() => {
    document.title = TITLES[page]
  }, [page])

  // links to "/" and "/docs" switch the page without a reload, so an uploaded batch stays in memory
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const a = (e.target as Element | null)?.closest?.('a[href]')
      if (!(a instanceof HTMLAnchorElement) || (a.target && a.target !== '_self') || a.hasAttribute('download')) return
      const url = new URL(a.href)
      if (url.origin !== window.location.origin || !(Object.values(ROUTES) as string[]).includes(url.pathname)) return
      if (url.pathname === window.location.pathname && url.hash) return // in-page anchor
      e.preventDefault()
      window.history.pushState(null, '', url.pathname + url.hash)
      setPage(pageOf(url.pathname))
      window.scrollTo(0, 0)
    }
    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [])

  return (
    <div className="page">
      <header className="topbar">
        <a className="logo" href="/" aria-label="Jańa Post Address: разбор адресов">
          <span className="logo-main">JAŃA</span>
          <span className="logo-sub">POST</span>
        </a>
        <span className="divider" />
        <span className="product">Address</span>
        <nav className="topnav" aria-label="Разделы">
          <a href={ROUTES.parse} aria-current={page === 'parse' ? 'page' : undefined}>
            Разбор
          </a>
          <a href={ROUTES.docs} aria-current={page === 'docs' ? 'page' : undefined}>
            Документация
          </a>
        </nav>
        <HealthIndicator />
        <ThemeToggle />
      </header>

      {/* the parse page stays mounted on /docs: an uploaded batch and its edits survive a visit to the docs */}
      <ParsePage hidden={page !== 'parse'} />
      {page === 'docs' && <Docs />}
    </div>
  )
}

function ParsePage({ hidden }: { hidden: boolean }) {
  const [input, setInput] = useState('')
  const [data, setData] = useState<ParseResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const ctrlRef = useRef<AbortController | null>(null)

  useEffect(() => () => ctrlRef.current?.abort(), [])

  const run = useCallback((raw: string) => {
    if (!raw.trim()) return
    ctrlRef.current?.abort()
    const ctrl = new AbortController()
    ctrlRef.current = ctrl
    setLoading(true)
    setError(null)
    parseOne(raw, ctrl.signal)
      .then((res) => {
        if (!ctrl.signal.aborted) setData(res)
      })
      .catch((err: unknown) => {
        if (isAbort(err) || ctrl.signal.aborted) return
        setData(null)
        setError(errorMessage(err))
      })
      .finally(() => {
        if (ctrlRef.current === ctrl) setLoading(false)
      })
  }, [])

  // parse while typing: the hint follows the input
  useEffect(() => {
    if (!input.trim()) return
    const t = window.setTimeout(() => run(input), 300)
    return () => window.clearTimeout(t)
  }, [input, run])

  const pickExample = useCallback(
    (raw: string) => {
      setInput(raw)
      run(raw)
    },
    [run],
  )

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    run(input)
  }

  return (
    <main className="container" hidden={hidden}>
      <h1>Разбор адресов</h1>
      <p className="lead">
        Раскладываем адрес из одной строки на поля, показываем, откуда взято каждое значение, и
        отмечаем записи для ручной проверки.
      </p>

      <section className="card">
        <h2>Проверить строку</h2>
        <form className="parse-form" onSubmit={onSubmit}>
          <input
            className="input"
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Введите адрес одной строкой"
            aria-label="Адрес"
            autoComplete="off"
            spellCheck={false}
          />
          <button type="submit" className="button" disabled={loading || !input.trim()}>
            {loading ? 'Разбираем…' : 'Разобрать'}
          </button>
        </form>

        {data?.suggestion && data.suggestion !== input.trim() && (
          <button
            type="button"
            className="suggestion"
            onClick={() => setInput(data.suggestion)}
            title="Подставить в поле"
          >
            <span className="suggestion-label">Подсказка:</span> {data.suggestion}
          </button>
        )}

        <div className="chips" aria-label="Примеры">
          {EXAMPLES.map((ex) => (
            <button key={ex} type="button" className="chip" onClick={() => pickExample(ex)}>
              {ex}
            </button>
          ))}
        </div>

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}

        {data && (
          <div className={`result${loading ? ' stale' : ''}`} aria-busy={loading}>
            <div className="result-head">
              <h3>Результат</h3>
              <ConfidenceBadge status={data.status} confidence={data.result.confidence} />
            </div>
            <Highlight raw={data.result.raw_address} spans={data.spans} />
            <HighlightLegend />
            <FieldsTable record={data.result} sources={data.sources} />
          </div>
        )}
      </section>

      <BatchPanel />
    </main>
  )
}
