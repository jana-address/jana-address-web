import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { errorMessage, isAbort, parseOne, type ParseResponse } from './api'
import { BatchPanel } from './components/BatchPanel'
import { ConfidenceBadge } from './components/ConfidenceBadge'
import { FieldsTable } from './components/FieldsTable'
import { HealthIndicator } from './components/HealthIndicator'
import { Highlight, HighlightLegend } from './components/Highlight'

const EXAMPLES = [
  'город Алматы/Алматы қаласы, Мкр Аксай 3а, 59, кв 70',
  'Нурсити 2 микрорайон 11дом 5 подьезд 239 кв',
  'Туран 55/6 магазин береке 4подьезд 9этаж',
  'Турксибский район, Рыбинский переулок, дом 4',
  'город Актобе/Ақтөбе қаласы, Назарбаева8, кв 12',
]

export default function App() {
  const [input, setInput] = useState('')
  const [data, setData] = useState<ParseResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const ctrlRef = useRef<AbortController | null>(null)
  const cardRef = useRef<HTMLElement>(null)

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

  const pickFromBatch = useCallback(
    (raw: string) => {
      pickExample(raw)
      cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    },
    [pickExample],
  )

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    run(input)
  }

  return (
    <div className="page">
      <header className="topbar">
        <div className="logo" aria-label="Jańa Post">
          <span className="logo-main">JAŃA</span>
          <span className="logo-sub">POST</span>
        </div>
        <span className="divider" />
        <span className="product">Address</span>
        <HealthIndicator />
      </header>

      <main className="container">
        <h1>Разбор адресов</h1>
        <p className="lead">
          Раскладываем адрес из одной строки на поля, показываем, откуда взято каждое значение, и
          отмечаем записи для ручной проверки.
        </p>

        <section className="card" ref={cardRef}>
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

        <BatchPanel onPick={pickFromBatch} />
      </main>
    </div>
  )
}
