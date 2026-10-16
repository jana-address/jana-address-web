import { useCallback, useEffect, useState } from 'react'

type Health = {
  status: 'ok' | 'degraded'
  version: string
  db: 'ok' | 'down'
}

type Check =
  | { state: 'loading' }
  | { state: 'ok'; health: Health }
  | { state: 'error'; message: string }

async function fetchHealth(signal: AbortSignal): Promise<Health> {
  const res = await fetch('/api/v1/health', { signal, headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return (await res.json()) as Health
}

function Badge({ tone, children }: { tone: 'ok' | 'down' | 'wait'; children: string }) {
  return <span className={`badge badge-${tone}`}>{children}</span>
}

export default function App() {
  const [check, setCheck] = useState<Check>({ state: 'loading' })

  const load = useCallback((signal: AbortSignal) => {
    setCheck({ state: 'loading' })
    fetchHealth(signal)
      .then((health) => setCheck({ state: 'ok', health }))
      .catch((err: unknown) => {
        if (signal.aborted) return
        setCheck({ state: 'error', message: err instanceof Error ? err.message : String(err) })
      })
  }, [])

  useEffect(() => {
    const ctrl = new AbortController()
    load(ctrl.signal)
    return () => ctrl.abort()
  }, [load])

  const api =
    check.state === 'loading' ? <Badge tone="wait">проверяем…</Badge>
    : check.state === 'ok' ? <Badge tone="ok">работает</Badge>
    : <Badge tone="down">недоступен</Badge>

  const db =
    check.state === 'loading' ? <Badge tone="wait">проверяем…</Badge>
    : check.state === 'ok' && check.health.db === 'ok' ? <Badge tone="ok">подключена</Badge>
    : <Badge tone="down">нет связи</Badge>

  return (
    <div className="page">
      <header className="topbar">
        <div className="logo" aria-label="Jańa Post">
          <span className="logo-main">JAŃA</span>
          <span className="logo-sub">POST</span>
        </div>
        <span className="divider" />
        <span className="product">Address</span>
      </header>

      <main className="container">
        <h1>Разбор адресов</h1>
        <p className="lead">
          Каркас проекта: React, Go и PostgreSQL в Docker. Здесь появятся загрузка файла,
          таблица разбора и ручная проверка записей.
        </p>

        <section className="card">
          <h2>Состояние сервиса</h2>
          <dl className="rows">
            <div className="row">
              <dt>API</dt>
              <dd>{api}</dd>
            </div>
            <div className="row">
              <dt>База данных</dt>
              <dd>{db}</dd>
            </div>
            <div className="row">
              <dt>Версия</dt>
              <dd className="mono">{check.state === 'ok' ? check.health.version : '—'}</dd>
            </div>
          </dl>
          {check.state === 'error' && <p className="error">Ошибка: {check.message}</p>}
          <button
            type="button"
            className="button"
            onClick={() => load(new AbortController().signal)}
            disabled={check.state === 'loading'}
          >
            Обновить
          </button>
        </section>
      </main>
    </div>
  )
}
