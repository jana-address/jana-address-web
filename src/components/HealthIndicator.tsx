import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchHealth, isAbort, type Health } from '../api'

type Check =
  | { state: 'loading' }
  | { state: 'ok'; health: Health }
  | { state: 'error' }

const REFRESH_MS = 30_000

export function HealthIndicator() {
  const [check, setCheck] = useState<Check>({ state: 'loading' })
  const ctrlRef = useRef<AbortController | null>(null)

  const load = useCallback(() => {
    ctrlRef.current?.abort()
    const ctrl = new AbortController()
    ctrlRef.current = ctrl
    fetchHealth(ctrl.signal)
      .then((health) => setCheck({ state: 'ok', health }))
      .catch((err: unknown) => {
        if (!isAbort(err)) setCheck({ state: 'error' })
      })
  }, [])

  useEffect(() => {
    load()
    const timer = window.setInterval(load, REFRESH_MS)
    return () => {
      window.clearInterval(timer)
      ctrlRef.current?.abort()
    }
  }, [load])

  let tone: 'ok' | 'down' | 'wait'
  let text: string
  if (check.state === 'loading') {
    tone = 'wait'
    text = 'Проверяем API…'
  } else if (check.state === 'error') {
    tone = 'down'
    text = 'API недоступен'
  } else {
    const { db, version } = check.health
    tone = db === 'ok' && check.health.status === 'ok' ? 'ok' : 'down'
    text = `API ok · БД ${db === 'ok' ? 'ok' : 'нет связи'} · v${version}`
  }

  return (
    <button type="button" className="health" onClick={load} title="Обновить состояние сервиса">
      <span className={`dot dot-${tone}`} aria-hidden="true" />
      {text}
    </button>
  )
}
