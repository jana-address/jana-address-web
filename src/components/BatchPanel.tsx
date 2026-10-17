import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent, type KeyboardEvent } from 'react'
import { errorMessage, isAbort, parseBatch, statusOf, type AddressRecord, type Status } from '../api'
import { STATUS_META } from '../fields'
import { ConfidenceBadge } from './ConfidenceBadge'

type Row = AddressRecord & { status: Status }

type State =
  | { state: 'idle' }
  | { state: 'loading'; fileName: string; count: number }
  | { state: 'error'; message: string }
  | { state: 'done'; fileName: string; rows: Row[]; text: string; ms: number }

const PAGE = 200
const STATUS_ORDER: readonly Status[] = ['confident', 'review', 'unparsed']

class InputError extends Error {}

async function readBatchFile(file: File): Promise<{ text: string; count: number }> {
  if (!/\.json$/i.test(file.name) && !file.type.includes('json')) {
    throw new InputError('Нужен файл в формате .json')
  }
  let text: string
  try {
    text = await file.text()
  } catch {
    throw new InputError('Не удалось прочитать файл')
  }
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch (err) {
    throw new InputError(`Файл не является корректным JSON: ${errorMessage(err)}`)
  }
  if (!Array.isArray(data)) {
    throw new InputError('Ожидается JSON-массив записей вида [{"id": "…", "raw_address": "…"}]')
  }
  if (data.length === 0) throw new InputError('Массив пуст: в файле нет записей')
  const bad = data.findIndex(
    (item: unknown) =>
      typeof item !== 'object' ||
      item === null ||
      typeof (item as { raw_address?: unknown }).raw_address !== 'string',
  )
  if (bad >= 0) throw new InputError(`Запись №${bad + 1} не содержит строкового поля raw_address`)
  return { text, count: data.length }
}

function downloadJson(text: string, fileName: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.append(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function streetOf(r: AddressRecord): string {
  return [r.street_type, r.street_name].filter(Boolean).join(' ')
}

type Props = { onPick: (rawAddress: string) => void }

export function BatchPanel({ onPick }: Props) {
  const [st, setSt] = useState<State>({ state: 'idle' })
  const [dragging, setDragging] = useState(false)
  const [filter, setFilter] = useState<Status | null>(null)
  const [limit, setLimit] = useState(PAGE)
  const ctrlRef = useRef<AbortController | null>(null)

  useEffect(() => () => ctrlRef.current?.abort(), [])

  async function handleFile(file: File) {
    ctrlRef.current?.abort()
    const ctrl = new AbortController()
    ctrlRef.current = ctrl
    setFilter(null)
    setLimit(PAGE)
    try {
      const { text, count } = await readBatchFile(file)
      if (ctrl.signal.aborted) return
      setSt({ state: 'loading', fileName: file.name, count })
      const t0 = performance.now()
      const res = await parseBatch(text, ctrl.signal)
      const ms = Math.round(performance.now() - t0)
      if (ctrl.signal.aborted) return
      const rows = res.records.map((r) => ({ ...r, status: statusOf(r.confidence) }))
      setSt({ state: 'done', fileName: file.name, rows, text: res.text, ms })
    } catch (err) {
      if (isAbort(err) || ctrl.signal.aborted) return
      setSt({ state: 'error', message: errorMessage(err) })
    }
  }

  function onChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (file) void handleFile(file)
  }

  function onDragOver(e: DragEvent<HTMLLabelElement>) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
    setDragging(true)
  }

  function onDrop(e: DragEvent<HTMLLabelElement>) {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) void handleFile(file)
  }

  const rows = st.state === 'done' ? st.rows : null

  const counts = useMemo(() => {
    const c: Record<Status, number> = { confident: 0, review: 0, unparsed: 0 }
    for (const r of rows ?? []) c[r.status] += 1
    return c
  }, [rows])

  const visible = useMemo(
    () => (rows ? (filter ? rows.filter((r) => r.status === filter) : rows) : []),
    [rows, filter],
  )

  function chooseFilter(s: Status | null) {
    setFilter(s)
    setLimit(PAGE)
  }

  function onRowKey(e: KeyboardEvent<HTMLTableRowElement>, raw: string) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onPick(raw)
    }
  }

  return (
    <section className="card">
      <div className="card-head">
        <h2>Пакетная обработка</h2>
        <button
          type="button"
          className="button button-secondary"
          disabled={st.state !== 'done'}
          onClick={() => st.state === 'done' && downloadJson(st.text, 'result.json')}
        >
          Скачать JSON
        </button>
      </div>

      <label
        className={`dropzone${dragging ? ' dragging' : ''}${st.state === 'loading' ? ' busy' : ''}`}
        onDragOver={onDragOver}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <input
          type="file"
          accept=".json,application/json"
          className="visually-hidden"
          onChange={onChange}
          disabled={st.state === 'loading'}
        />
        <span className="dropzone-title">
          {st.state === 'loading'
            ? `Обрабатываем ${st.count} записей из ${st.fileName}…`
            : 'Перетащите файл .json сюда или нажмите, чтобы выбрать'}
        </span>
        <span className="dropzone-hint">Формат: [{'{'}"id": "…", "raw_address": "…"{'}'}, …]</span>
      </label>

      {st.state === 'error' && (
        <p className="error" role="alert">
          {st.message}
        </p>
      )}

      {st.state === 'done' && (
        <>
          <div className="summary">
            <button
              type="button"
              className={`stat${filter === null ? ' active' : ''}`}
              onClick={() => chooseFilter(null)}
            >
              <span className="stat-value">{st.rows.length}</span>
              <span className="stat-label">записей</span>
            </button>
            {STATUS_ORDER.map((s) => (
              <button
                key={s}
                type="button"
                className={`stat stat-${s}${filter === s ? ' active' : ''}`}
                onClick={() => chooseFilter(filter === s ? null : s)}
                title={STATUS_META[s].title}
              >
                <span className="stat-value">{counts[s]}</span>
                <span className="stat-label">{STATUS_META[s].label.toLowerCase()}</span>
              </button>
            ))}
            <div className="stat stat-static">
              <span className="stat-value">{st.ms}&nbsp;мс</span>
              <span className="stat-label">время запроса</span>
            </div>
          </div>

          <p className="hint">Нажмите на строку, чтобы посмотреть подсветку разбора.</p>

          <div className="table-wrap">
            <table className="batch-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Исходная строка</th>
                  <th>Город</th>
                  <th>Улица</th>
                  <th>Дом</th>
                  <th>Кв.</th>
                  <th>Уверенность</th>
                </tr>
              </thead>
              <tbody>
                {visible.slice(0, limit).map((r, i) => (
                  <tr
                    key={i}
                    className={`row-${r.status}`}
                    tabIndex={0}
                    onClick={() => onPick(r.raw_address)}
                    onKeyDown={(e) => onRowKey(e, r.raw_address)}
                  >
                    <td className="cell-id">{r.id ?? '—'}</td>
                    <td className="cell-raw" title={r.raw_address}>
                      {r.raw_address}
                    </td>
                    <td>{r.city ?? '—'}</td>
                    <td>{streetOf(r) || '—'}</td>
                    <td>{r.house ?? '—'}</td>
                    <td>{r.apartment ?? '—'}</td>
                    <td>
                      <ConfidenceBadge status={r.status} confidence={r.confidence} compact />
                    </td>
                  </tr>
                ))}
                {visible.length === 0 && (
                  <tr>
                    <td colSpan={7} className="cell-empty">
                      Нет записей с таким статусом
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {visible.length > limit && (
            <div className="more">
              <span>
                Показано {limit} из {visible.length}
              </span>
              <button type="button" className="button button-secondary" onClick={() => setLimit(limit + PAGE)}>
                Показать ещё
              </button>
            </div>
          )}
        </>
      )}
    </section>
  )
}
