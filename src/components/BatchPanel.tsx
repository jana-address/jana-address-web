import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent, type KeyboardEvent } from 'react'
import { errorMessage, isAbort, parseBatch, statusOf, type AddressRecord, type Echo, type Status } from '../api'
import {
  REVIEW_META,
  buildExport,
  draftKey,
  dropDraft,
  formatCount,
  loadDraft,
  plural,
  saveDraft,
  sameValues,
  valuesOf,
  type Review,
  type Values,
} from '../review'
import { ConfidenceBadge } from './ConfidenceBadge'
import { RecordEditor } from './RecordEditor'

type Batch = {
  fileName: string
  key: string
  records: AddressRecord[]
  echoes: Echo[]
  statuses: Status[]
  ms: number
}

type State =
  | { state: 'idle' }
  | { state: 'loading'; fileName: string; count: number }
  | { state: 'error'; message: string }
  | { state: 'done'; batch: Batch }

/** Filter chips: uncertain statuses and records already checked by hand. No chip selected means all. */
type Category = 'review' | 'unparsed' | 'done'

const CHIPS: ReadonlyArray<{ id: Category; label: string; title: string }> = [
  { id: 'review', label: 'Проверить', title: 'Уверенность от 0,5 до 0,8, ещё не проверены' },
  { id: 'unparsed', label: 'Не разобрано', title: 'Уверенность ниже 0,5, ещё не проверены' },
  { id: 'done', label: 'Исправлено', title: 'Исправлены или приняты вручную' },
]

const PAGE = 200
const UNCERTAIN: ReadonlySet<Category> = new Set(['review', 'unparsed'])
const ALL: ReadonlySet<Category> = new Set()

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
    data = JSON.parse(text.replace(/^﻿/, ''))
  } catch (err) {
    throw new InputError(`Файл не является корректным JSON: ${errorMessage(err)}`)
  }
  // the API also accepts an object that wraps the array
  if (typeof data === 'object' && data !== null && !Array.isArray(data)) {
    const o = data as Record<string, unknown>
    data = ['items', 'records', 'data', 'addresses'].map((k) => o[k]).find(Array.isArray) ?? data
  }
  if (!Array.isArray(data)) {
    throw new InputError('Ожидается JSON-массив записей вида [{"id": "…", "raw_address": "…"}]')
  }
  if (data.length === 0) throw new InputError('Массив пуст: в файле нет записей')
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

function streetOf(r: Values): string {
  return [r.street_type, r.street_name].filter(Boolean).join(' ')
}

function baseName(fileName: string): string {
  return fileName.replace(/\.json$/i, '') || 'result'
}

function formatTime(ms: number): string {
  if (!ms) return ''
  return new Date(ms).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export function BatchPanel() {
  const [st, setSt] = useState<State>({ state: 'idle' })
  const [dragging, setDragging] = useState(false)
  const [reviews, setReviews] = useState<ReadonlyMap<number, Review>>(new Map())
  const [filter, setFilter] = useState<ReadonlySet<Category>>(ALL)
  const [page, setPage] = useState(0)
  const [open, setOpen] = useState<number | null>(null)
  const [restored, setRestored] = useState<{ count: number; saved: number } | null>(null)
  const [stored, setStored] = useState(true)
  const [notice, setNotice] = useState<string | null>(null)
  const ctrlRef = useRef<AbortController | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => () => ctrlRef.current?.abort(), [])

  const batch = st.state === 'done' ? st.batch : null

  async function handleFile(file: File) {
    ctrlRef.current?.abort()
    const ctrl = new AbortController()
    ctrlRef.current = ctrl
    setOpen(null)
    setNotice(null)
    try {
      const { text, count } = await readBatchFile(file)
      if (ctrl.signal.aborted) return
      setSt({ state: 'loading', fileName: file.name, count })
      const t0 = performance.now()
      const res = await parseBatch(text, ctrl.signal)
      const ms = Math.round(performance.now() - t0)
      if (ctrl.signal.aborted) return
      const statuses = res.records.map((r) => statusOf(r.confidence))
      const key = draftKey(file.name, file.size, res.records.length)
      const draft = loadDraft(key, res.records)
      const next = draft?.reviews ?? new Map<number, Review>()
      const uncertain = statuses.some((s, i) => s !== 'confident' && !next.has(i))
      setReviews(next)
      setRestored(draft ? { count: draft.reviews.size, saved: draft.saved } : null)
      setStored(true)
      setFilter(uncertain ? UNCERTAIN : ALL)
      setPage(0)
      setSt({ state: 'done', batch: { fileName: file.name, key, records: res.records, echoes: res.echoes, statuses, ms } })
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

  /* ---------- Derived: categories, counts, visible rows ---------- */

  const counts = useMemo(() => {
    const c = { all: 0, confident: 0, review: 0, unparsed: 0, done: reviews.size, uncertainModel: 0 }
    if (!batch) return c
    c.all = batch.statuses.length
    batch.statuses.forEach((s, i) => {
      if (s !== 'confident') c.uncertainModel += 1
      if (reviews.has(i)) return
      c[s] += 1
    })
    return c
  }, [batch, reviews])

  const visible = useMemo(() => {
    if (!batch) return []
    if (filter.size === 0) return [...batch.statuses.keys()]
    const out: number[] = []
    batch.statuses.forEach((s, i) => {
      const cat = reviews.has(i) ? 'done' : s
      if (cat !== 'confident' && filter.has(cat)) out.push(i)
    })
    return out
  }, [batch, reviews, filter])

  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE))
  const cur = Math.min(page, pageCount - 1)
  const pageRows = visible.slice(cur * PAGE, (cur + 1) * PAGE)

  // keep the record open in the editor on the visible page
  useEffect(() => {
    if (open === null) return
    const pos = visible.indexOf(open)
    if (pos >= 0) setPage(Math.floor(pos / PAGE))
  }, [open, visible])

  /* ---------- Actions ---------- */

  function commit(next: ReadonlyMap<number, Review>) {
    setReviews(next)
    if (batch) setStored(saveDraft(batch.key, next, batch.records))
  }

  function withReview(i: number, review: Review | null): ReadonlyMap<number, Review> {
    const next = new Map(reviews)
    if (review) next.set(i, review)
    else next.delete(i)
    return next
  }

  function reviewOf(i: number, values: Values): Review {
    const same = batch ? sameValues(values, valuesOf(batch.records[i])) : false
    return { kind: same ? 'accepted' : 'edited', values }
  }

  /** Next unchecked uncertain record after `from` that the current filter shows, wrapping around. */
  function nextUncertain(from: number, done: ReadonlyMap<number, Review>): number | null {
    if (!batch) return null
    const n = batch.statuses.length
    for (let k = 1; k < n; k++) {
      const j = (from + k) % n
      const s = batch.statuses[j]
      if (s === 'confident' || done.has(j)) continue
      if (filter.size > 0 && !filter.has(s)) continue
      return j
    }
    return null
  }

  function closeEditor(focusIndex = open) {
    setOpen(null)
    window.requestAnimationFrame(() => {
      const row = wrapRef.current?.querySelector<HTMLElement>(`tr[data-index="${focusIndex}"]`)
      ;(row ?? wrapRef.current)?.focus()
    })
  }

  function saveNext(i: number, values: Values) {
    const next = withReview(i, reviewOf(i, values))
    commit(next)
    const j = nextUncertain(i, next)
    if (j === null) {
      setNotice('В текущем фильтре не осталось непроверенных записей.')
      closeEditor(i)
    } else {
      setOpen(j)
    }
  }

  function toggle(c: Category) {
    const next = new Set(filter)
    if (next.has(c)) next.delete(c)
    else next.add(c)
    setFilter(next)
    setPage(0)
  }

  function showAll() {
    setFilter(ALL)
    setPage(0)
  }

  function goTo(p: number) {
    setPage(p)
    const wrap = wrapRef.current
    if (wrap && wrap.getBoundingClientRect().top < 0) wrap.scrollIntoView({ block: 'start' })
  }

  function discardDraft() {
    if (!batch) return
    setReviews(new Map())
    dropDraft(batch.key)
    setRestored(null)
    setStored(true)
  }

  function onRowKey(e: KeyboardEvent<HTMLTableRowElement>, i: number) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      setNotice(null)
      setOpen(i)
    }
  }

  function download(onlyReviewed: boolean) {
    if (!batch) return
    const text = buildExport(batch.records, batch.echoes, reviews, onlyReviewed)
    const base = baseName(batch.fileName)
    downloadJson(text, onlyReviewed ? `${base}_corrections.json` : `${base}_result.json`)
  }

  const openRecord = batch && open !== null ? batch.records[open] : null
  const from = visible.length === 0 ? 0 : cur * PAGE + 1
  const to = Math.min(visible.length, (cur + 1) * PAGE)

  return (
    <section className="card">
      <div className="card-head">
        <h2>Пакетная обработка</h2>
        <div className="card-actions">
          <button
            type="button"
            className="button button-secondary"
            disabled={!batch || reviews.size === 0}
            onClick={() => download(true)}
            title="Только исправленные и проверенные вручную записи, в том же формате"
          >
            Только исправления
          </button>
          <button
            type="button"
            className="button button-secondary"
            disabled={!batch}
            onClick={() => download(false)}
            title="Все записи с правками: массив из 14 полей в порядке ТЗ"
          >
            Скачать JSON
          </button>
        </div>
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
            ? `Обрабатываем ${formatCount(st.count)} записей из ${st.fileName}…`
            : batch
              ? `${batch.fileName}: ${formatCount(batch.records.length)} записей. Перетащите другой файл или нажмите, чтобы выбрать`
              : 'Перетащите файл .json сюда или нажмите, чтобы выбрать'}
        </span>
        <span className="dropzone-hint">Формат: [{'{'}"id": "…", "raw_address": "…"{'}'}, …]</span>
      </label>

      {st.state === 'error' && (
        <p className="error" role="alert">
          {st.message}
        </p>
      )}

      {batch && (
        <>
          <div className="summary">
            <div className="stat stat-static">
              <span className="stat-value">{formatCount(counts.all)}</span>
              <span className="stat-label">записей</span>
            </div>
            <div className="stat stat-static stat-confident">
              <span className="stat-value">{formatCount(counts.all - counts.uncertainModel)}</span>
              <span className="stat-label">уверенно</span>
            </div>
            <div className="stat stat-static stat-review">
              <span className="stat-value">{formatCount(counts.uncertainModel)}</span>
              <span className="stat-label">требуют проверки</span>
            </div>
            <div className="stat stat-static stat-done">
              <span className="stat-value">{formatCount(counts.done)}</span>
              <span className="stat-label">проверено вручную</span>
            </div>
            <div className="stat stat-static">
              <span className="stat-value">{formatCount(batch.ms)}&nbsp;мс</span>
              <span className="stat-label">время запроса</span>
            </div>
          </div>

          {restored && (
            <div className="notice" role="status">
              <span>
                {restored.count % 10 === 1 && restored.count % 100 !== 11 ? 'Восстановлена' : 'Восстановлено'}{' '}
                {formatCount(restored.count)} {plural(restored.count, ['правка', 'правки', 'правок'])}
                {restored.saved ? ` из черновика от ${formatTime(restored.saved)}` : ' из черновика'}.
              </span>
              <span className="notice-actions">
                <button type="button" className="link-button" onClick={discardDraft}>
                  Удалить черновик
                </button>
                <button type="button" className="link-button" onClick={() => setRestored(null)}>
                  Скрыть
                </button>
              </span>
            </div>
          )}

          {!stored && reviews.size > 0 && (
            <p className="notice notice-warn" role="status">
              Черновик не сохраняется: хранилище браузера недоступно. Скачайте результат до перезагрузки страницы.
            </p>
          )}

          {notice && (
            <div className="notice" role="status">
              <span>{notice}</span>
              <span className="notice-actions">
                <button type="button" className="link-button" onClick={() => setNotice(null)}>
                  Скрыть
                </button>
              </span>
            </div>
          )}

          <div className="filter" role="group" aria-label="Фильтр по статусу">
            <button
              type="button"
              className={`chip chip-filter${filter.size === 0 ? ' active' : ''}`}
              aria-pressed={filter.size === 0}
              onClick={showAll}
            >
              Все <span className="chip-count">{formatCount(counts.all)}</span>
            </button>
            {CHIPS.map((c) => (
              <button
                key={c.id}
                type="button"
                className={`chip chip-filter chip-${c.id}${filter.has(c.id) ? ' active' : ''}`}
                aria-pressed={filter.has(c.id)}
                onClick={() => toggle(c.id)}
                title={c.title}
              >
                {c.label} <span className="chip-count">{formatCount(counts[c.id])}</span>
              </button>
            ))}
          </div>

          <p className="hint">
            Нажмите на строку или Enter, чтобы проверить разбор и поправить поля. Правки сохраняются в браузере.
          </p>

          <div className="table-wrap" ref={wrapRef} tabIndex={-1}>
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
                {pageRows.map((i) => {
                  const r = batch.records[i]
                  const review = reviews.get(i)
                  const v: Values = review?.values ?? r
                  const status = batch.statuses[i]
                  return (
                    <tr
                      key={i}
                      data-index={i}
                      className={review ? 'row-done' : `row-${status}`}
                      tabIndex={0}
                      onClick={() => {
                        setNotice(null)
                        setOpen(i)
                      }}
                      onKeyDown={(e) => onRowKey(e, i)}
                      aria-current={open === i ? 'true' : undefined}
                    >
                      <td className="cell-id">{r.id ?? '—'}</td>
                      <td className="cell-raw" title={r.raw_address}>
                        {r.raw_address || '—'}
                      </td>
                      <td>{v.city ?? '—'}</td>
                      <td>{streetOf(v) || '—'}</td>
                      <td>{v.house ?? '—'}</td>
                      <td>{v.apartment ?? '—'}</td>
                      <td className="cell-conf">
                        <ConfidenceBadge status={status} confidence={r.confidence} compact />
                        {review && (
                          <span className={`badge rev-${review.kind}`} title={REVIEW_META[review.kind].title}>
                            {REVIEW_META[review.kind].label}
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
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

          <nav className="pager" aria-label="Страницы таблицы">
            <span className="pager-range">
              {formatCount(from)}–{formatCount(to)} из {formatCount(visible.length)}
            </span>
            {pageCount > 1 && (
              <span className="pager-buttons">
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={() => goTo(0)}
                  disabled={cur === 0}
                  aria-label="Первая страница"
                >
                  «
                </button>
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={() => goTo(cur - 1)}
                  disabled={cur === 0}
                >
                  Назад
                </button>
                <span className="pager-page">
                  {formatCount(cur + 1)} / {formatCount(pageCount)}
                </span>
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={() => goTo(cur + 1)}
                  disabled={cur >= pageCount - 1}
                >
                  Вперёд
                </button>
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={() => goTo(pageCount - 1)}
                  disabled={cur >= pageCount - 1}
                  aria-label="Последняя страница"
                >
                  »
                </button>
              </span>
            )}
          </nav>
        </>
      )}

      {batch && openRecord && open !== null && (
        <RecordEditor
          index={open}
          total={batch.records.length}
          record={openRecord}
          status={batch.statuses[open]}
          review={reviews.get(open)}
          onSave={(values) => commit(withReview(open, reviewOf(open, values)))}
          onAccept={() => commit(withReview(open, { kind: 'accepted', values: valuesOf(openRecord) }))}
          onReset={() => commit(withReview(open, null))}
          onSaveNext={(values) => saveNext(open, values)}
          onClose={() => closeEditor()}
        />
      )}
    </section>
  )
}
