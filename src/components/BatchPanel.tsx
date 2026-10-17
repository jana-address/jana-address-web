import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent, type KeyboardEvent } from 'react'
import { errorMessage, isAbort, parseBatch, statusOf, type AddressRecord, type Echo, type Status } from '../api'
import { FIELD_LABELS } from '../fields'
import { KeyedError, errorText } from '../i18n/errors'
import type { TranslationKey } from '../i18n/translations'
import { useI18n } from '../i18n/useI18n'
import {
  REVIEW_META,
  buildExport,
  draftKey,
  dropDraft,
  loadDraft,
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
  | { state: 'error'; error: unknown }
  | { state: 'done'; batch: Batch }

/** Filter chips: uncertain statuses and records already checked by hand. No chip selected means all. */
type Category = 'review' | 'unparsed' | 'done'

const CHIPS: ReadonlyArray<{ id: Category; label: TranslationKey; title: TranslationKey }> = [
  { id: 'review', label: 'filter.review', title: 'filter.review.title' },
  { id: 'unparsed', label: 'filter.unparsed', title: 'filter.unparsed.title' },
  { id: 'done', label: 'filter.done', title: 'filter.done.title' },
]

const PAGE = 200
const UNCERTAIN: ReadonlySet<Category> = new Set(['review', 'unparsed'])
const ALL: ReadonlySet<Category> = new Set()

const NDJSON = /\.(jsonl|ndjson)$/i

async function readBatchFile(file: File): Promise<{ text: string; count: number }> {
  if (!/\.json$/i.test(file.name) && !NDJSON.test(file.name) && !file.type.includes('json')) {
    throw new KeyedError('file.notJson')
  }
  let text: string
  try {
    text = await file.text()
  } catch {
    throw new KeyedError('file.unreadable')
  }
  if (NDJSON.test(file.name)) {
    // one object per line; the API reads NDJSON as is, the page converts it to the array it scans
    const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter((l) => l.trim() !== '')
    try {
      lines.forEach((l) => JSON.parse(l))
    } catch (err) {
      throw new KeyedError('file.badJson', { detail: errorMessage(err) })
    }
    if (lines.length === 0) throw new KeyedError('file.empty')
    return { text: `[${lines.join(',\n')}]`, count: lines.length }
  }
  let data: unknown
  try {
    data = JSON.parse(text.replace(/^﻿/, ''))
  } catch (err) {
    throw new KeyedError('file.badJson', { detail: errorMessage(err) })
  }
  // the API also accepts an object that wraps the array
  if (typeof data === 'object' && data !== null && !Array.isArray(data)) {
    const o = data as Record<string, unknown>
    data = ['items', 'records', 'data', 'addresses'].map((k) => o[k]).find(Array.isArray) ?? data
  }
  if (!Array.isArray(data)) throw new KeyedError('file.notArray')
  if (data.length === 0) throw new KeyedError('file.empty')
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

/** Fields the table shows only with "all fields" on; the editor always shows every field. */
const EXTRA_BEFORE_STREET = ['district', 'living_area'] as const
const EXTRA_AFTER_APARTMENT = ['entrance', 'floor', 'landmark'] as const

function matches(id: string | number | null, raw: string, v: Values, q: string): boolean {
  const hay = [id ?? '', raw, v.province, v.city, v.district, v.living_area, v.street_name, v.house, v.landmark]
  return hay.some((s) => s !== null && String(s).toLowerCase().includes(q))
}

function baseName(fileName: string): string {
  return fileName.replace(/\.(json|jsonl|ndjson)$/i, '') || 'result'
}

export function BatchPanel() {
  const { t, tp, num, time } = useI18n()
  const [st, setSt] = useState<State>({ state: 'idle' })
  const [dragging, setDragging] = useState(false)
  const [reviews, setReviews] = useState<ReadonlyMap<number, Review>>(new Map())
  const [filter, setFilter] = useState<ReadonlySet<Category>>(ALL)
  const [query, setQuery] = useState('')
  const [byConfidence, setByConfidence] = useState(false)
  const [allFields, setAllFields] = useState(false)
  const [page, setPage] = useState(0)
  const [open, setOpen] = useState<number | null>(null)
  const [restored, setRestored] = useState<{ count: number; saved: number } | null>(null)
  const [stored, setStored] = useState(true)
  const [notice, setNotice] = useState<TranslationKey | null>(null)
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
      setSt({ state: 'error', error: err })
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
    let out: number[] = []
    batch.statuses.forEach((s, i) => {
      const cat = reviews.has(i) ? 'done' : s
      if (filter.size === 0 || (cat !== 'confident' && filter.has(cat))) out.push(i)
    })
    const q = query.trim().toLowerCase()
    if (q) {
      out = out.filter((i) => {
        const r = batch.records[i]
        return matches(r.id, r.raw_address, reviews.get(i)?.values ?? r, q)
      })
    }
    if (byConfidence) out.sort((a, b) => batch.records[a].confidence - batch.records[b].confidence || a - b)
    return out
  }, [batch, reviews, filter, query, byConfidence])

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

  /** Next unchecked uncertain record after `from` in the order the table shows (filter, search, sort), wrapping around. */
  function nextUncertain(from: number, done: ReadonlyMap<number, Review>): number | null {
    if (!batch) return null
    const pos = visible.indexOf(from)
    const n = visible.length
    for (let k = 1; k <= n; k++) {
      const j = visible[(pos + k + n) % n]
      if (j === from || batch.statuses[j] === 'confident' || done.has(j)) continue
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
      setNotice('batch.noneLeft')
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
        <h2>{t('batch.title')}</h2>
        <div className="card-actions">
          <button
            type="button"
            className="button button-secondary"
            disabled={!batch || reviews.size === 0}
            onClick={() => download(true)}
            title={t('batch.onlyFixes.title')}
          >
            {t('batch.onlyFixes')}
          </button>
          <button
            type="button"
            className="button button-secondary"
            disabled={!batch}
            onClick={() => download(false)}
            title={t('batch.download.title')}
          >
            {t('batch.download')}
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
          accept=".json,.jsonl,.ndjson,application/json"
          className="visually-hidden"
          onChange={onChange}
          disabled={st.state === 'loading'}
        />
        <span className="dropzone-title">
          {st.state === 'loading'
            ? t('batch.loading', { n: num(st.count), records: tp('batch.records', st.count), file: st.fileName })
            : batch
              ? t('batch.loaded', {
                  file: batch.fileName,
                  n: num(batch.records.length),
                  records: tp('batch.records', batch.records.length),
                })
              : t('batch.drop')}
        </span>
        <span className="dropzone-hint">
          {t('batch.format')}: [{'{'}"id": "…", "raw_address": "…"{'}'}, …]
        </span>
      </label>

      {st.state === 'error' && (
        <p className="error" role="alert">
          {errorText(st.error, t)}
        </p>
      )}

      {batch && (
        <>
          <div className="summary">
            <div className="stat stat-static">
              <StatIcon name="records" />
              <span className="stat-value">{num(counts.all)}</span>
              <span className="stat-label">{tp('batch.records', counts.all)}</span>
            </div>
            <div className="stat stat-static stat-confident">
              <StatIcon name="confident" />
              <span className="stat-value">{num(counts.all - counts.uncertainModel)}</span>
              <span className="stat-label">{t('stat.confident')}</span>
            </div>
            <div className="stat stat-static stat-review">
              <StatIcon name="review" />
              <span className="stat-value">{num(counts.uncertainModel)}</span>
              <span className="stat-label">{t('stat.review')}</span>
            </div>
            <div className="stat stat-static stat-done">
              <StatIcon name="done" />
              <span className="stat-value">{num(counts.done)}</span>
              <span className="stat-label">{t('stat.done')}</span>
            </div>
            <div className="stat stat-static">
              <StatIcon name="time" />
              <span className="stat-value">
                {num(batch.ms)}&nbsp;{t('common.ms')}
              </span>
              <span className="stat-label">{t('stat.time')}</span>
            </div>
          </div>

          {restored && (
            <div className="notice" role="status">
              <span>
                {restored.saved
                  ? tp('draft.restoredAt', restored.count, { time: time(restored.saved) })
                  : tp('draft.restored', restored.count)}
              </span>
              <span className="notice-actions">
                <button type="button" className="link-button" onClick={discardDraft}>
                  {t('draft.discard')}
                </button>
                <button type="button" className="link-button" onClick={() => setRestored(null)}>
                  {t('common.hide')}
                </button>
              </span>
            </div>
          )}

          {!stored && reviews.size > 0 && (
            <p className="notice notice-warn" role="status">
              {t('draft.notStored')}
            </p>
          )}

          {notice && (
            <div className="notice" role="status">
              <span>{t(notice)}</span>
              <span className="notice-actions">
                <button type="button" className="link-button" onClick={() => setNotice(null)}>
                  {t('common.hide')}
                </button>
              </span>
            </div>
          )}

          <div className="filter" role="group" aria-label={t('filter.label')}>
            <button
              type="button"
              className={`chip chip-filter${filter.size === 0 ? ' active' : ''}`}
              aria-pressed={filter.size === 0}
              onClick={showAll}
            >
              {t('filter.all')} <span className="chip-count">{num(counts.all)}</span>
            </button>
            {CHIPS.map((c) => (
              <button
                key={c.id}
                type="button"
                className={`chip chip-filter chip-${c.id}${filter.has(c.id) ? ' active' : ''}`}
                aria-pressed={filter.has(c.id)}
                onClick={() => toggle(c.id)}
                title={t(c.title)}
              >
                {t(c.label)} <span className="chip-count">{num(counts[c.id])}</span>
              </button>
            ))}
          </div>

          <div className="batch-tools">
            <input
              type="search"
              className="input batch-search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setPage(0)
              }}
              placeholder={t('batch.search')}
              aria-label={t('batch.search')}
            />
            <button
              type="button"
              className={`chip chip-filter${byConfidence ? ' active' : ''}`}
              aria-pressed={byConfidence}
              onClick={() => {
                setByConfidence(!byConfidence)
                setPage(0)
              }}
              title={t('batch.sortConf.title')}
            >
              {t('batch.sortConf')}
            </button>
            <button
              type="button"
              className={`chip chip-filter${allFields ? ' active' : ''}`}
              aria-pressed={allFields}
              onClick={() => setAllFields(!allFields)}
              title={t('batch.allFields.title')}
            >
              {t('batch.allFields')}
            </button>
          </div>

          <p className="hint">
            {t('batch.tableHint')}
          </p>

          <div className="table-wrap" ref={wrapRef} tabIndex={-1}>
            <table className="batch-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>{t('col.raw')}</th>
                  {allFields && <th>{t(FIELD_LABELS.province)}</th>}
                  <th>{t(FIELD_LABELS.city)}</th>
                  {allFields && EXTRA_BEFORE_STREET.map((f) => <th key={f}>{t(FIELD_LABELS[f])}</th>)}
                  <th>{t(FIELD_LABELS.street_name)}</th>
                  <th>{t(FIELD_LABELS.house)}</th>
                  <th>{t('col.apartment')}</th>
                  {allFields && EXTRA_AFTER_APARTMENT.map((f) => <th key={f}>{t(FIELD_LABELS[f])}</th>)}
                  <th>{t('col.confidence')}</th>
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
                      {allFields && <td>{v.province ?? '—'}</td>}
                      <td>{v.city ?? '—'}</td>
                      {allFields && EXTRA_BEFORE_STREET.map((f) => <td key={f}>{v[f] ?? '—'}</td>)}
                      <td>{streetOf(v) || '—'}</td>
                      <td>{v.house ?? '—'}</td>
                      <td>{v.apartment ?? '—'}</td>
                      {allFields && EXTRA_AFTER_APARTMENT.map((f) => <td key={f}>{v[f] ?? '—'}</td>)}
                      <td className="cell-conf">
                        <ConfidenceBadge status={status} confidence={r.confidence} compact />
                        {review && (
                          <span className={`badge rev-${review.kind}`} title={t(REVIEW_META[review.kind].title)}>
                            {t(REVIEW_META[review.kind].label)}
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
                {visible.length === 0 && (
                  <tr>
                    <td colSpan={allFields ? 13 : 7} className="cell-empty">
                      {t('batch.noRows')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <nav className="pager" aria-label={t('pager.label')}>
            <span className="pager-range">
              {t('pager.range', { from: num(from), to: num(to), total: num(visible.length) })}
            </span>
            {pageCount > 1 && (
              <span className="pager-buttons">
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={() => goTo(0)}
                  disabled={cur === 0}
                  aria-label={t('pager.first')}
                >
                  «
                </button>
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={() => goTo(cur - 1)}
                  disabled={cur === 0}
                >
                  {t('pager.prev')}
                </button>
                <span className="pager-page">
                  {num(cur + 1)} / {num(pageCount)}
                </span>
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={() => goTo(cur + 1)}
                  disabled={cur >= pageCount - 1}
                >
                  {t('pager.next')}
                </button>
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={() => goTo(pageCount - 1)}
                  disabled={cur >= pageCount - 1}
                  aria-label={t('pager.last')}
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

// outline icons of the counters, drawn like the icons of the janapost.kz cards
const STAT_ICONS = {
  records: 'M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6',
  confident: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM8 12.5l2.8 2.8 5.7-5.8',
  review: 'M12 4 2.8 20h18.4zM12 10v4.5M12 17.5v.01',
  done: 'M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4',
  time: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 2',
} as const

function StatIcon({ name }: { name: keyof typeof STAT_ICONS }) {
  return (
    <svg className="stat-icon" viewBox="0 0 24 24" width="32" height="32" aria-hidden="true">
      <path d={STAT_ICONS[name]} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
