import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type MouseEvent,
  type SyntheticEvent,
} from 'react'
import {
  FIELDS,
  errorMessage,
  isAbort,
  parseOne,
  type AddressRecord,
  type Field,
  type ParseResponse,
  type Status,
} from '../api'
import { FIELD_GROUP, FIELD_LABELS, SOURCE_META } from '../fields'
import {
  REVIEW_META,
  STREET_TYPES,
  formatCount,
  normalize,
  sameValues,
  valuesOf,
  type Review,
  type Values,
} from '../review'
import { ConfidenceBadge } from './ConfidenceBadge'
import { Highlight, HighlightLegend } from './Highlight'

type Props = {
  index: number
  total: number
  record: AddressRecord
  status: Status
  review: Review | undefined
  onSave: (values: Values) => void
  onAccept: () => void
  onReset: () => void
  onSaveNext: (values: Values) => void
  onClose: () => void
}

/** Side panel for checking one batch record by hand. A modal dialog: the page behind is inert, Esc closes. */
export function RecordEditor(props: Props) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (!dialog.open) dialog.showModal()
    dialog.querySelector<HTMLElement>('[data-autofocus]')?.focus()
    return () => dialog.close()
  }, [])

  function onCancel(e: SyntheticEvent<HTMLDialogElement>) {
    e.preventDefault() // the parent owns the open state
    props.onClose()
  }

  function onBackdrop(e: MouseEvent<HTMLDialogElement>) {
    if (e.target === e.currentTarget) props.onClose()
  }

  return (
    <dialog ref={ref} className="drawer" aria-labelledby={titleId} onCancel={onCancel} onClick={onBackdrop}>
      <EditorBody key={props.index} {...props} titleId={titleId} />
    </dialog>
  )
}

type Parsed =
  | { state: 'loading' }
  | { state: 'error'; message: string }
  | { state: 'done'; data: ParseResponse }

type Form = Record<Field, string>

function toForm(v: Values): Form {
  return Object.fromEntries(FIELDS.map((f) => [f, v[f] ?? ''])) as Form
}

function fromForm(form: Form): Values {
  return Object.fromEntries(FIELDS.map((f) => [f, normalize(form[f])])) as Values
}

const MANUAL = { label: 'вручную', title: 'Значение изменено вручную' }

function EditorBody({
  index,
  total,
  record,
  status,
  review,
  onSave,
  onAccept,
  onReset,
  onSaveNext,
  onClose,
  titleId,
}: Props & { titleId: string }) {
  const original = useMemo(() => valuesOf(record), [record])
  const [form, setForm] = useState<Form>(() => toForm(review?.values ?? original))
  const [parsed, setParsed] = useState<Parsed>({ state: 'loading' })
  const firstRef = useRef<HTMLInputElement>(null)
  const idBase = useId()

  // the next record replaces this one inside an open dialog: move focus to its first field
  useEffect(() => {
    if (firstRef.current?.closest('dialog')?.open) firstRef.current.focus()
  }, [])

  useEffect(() => {
    const ctrl = new AbortController()
    parseOne(record.raw_address, ctrl.signal)
      .then((data) => setParsed({ state: 'done', data }))
      .catch((err: unknown) => {
        if (!isAbort(err)) setParsed({ state: 'error', message: errorMessage(err) })
      })
    return () => ctrl.abort()
  }, [record.raw_address])

  const values = fromForm(form)
  const dirty = !sameValues(values, review?.values ?? original)

  function set(f: Field, text: string) {
    setForm((prev) => ({ ...prev, [f]: text }))
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    onSaveNext(values)
  }

  function accept() {
    setForm(toForm(original))
    onAccept()
  }

  function reset() {
    setForm(toForm(original))
    onReset()
  }

  const streetOptions: readonly string[] =
    form.street_type && !(STREET_TYPES as readonly string[]).includes(form.street_type)
      ? [...STREET_TYPES, form.street_type]
      : STREET_TYPES

  const data = parsed.state === 'done' ? parsed.data : null

  return (
    <div className="drawer-inner">
      <header className="drawer-head">
        <div className="drawer-title">
          <p className="drawer-kicker">
            Запись {formatCount(index + 1)} из {formatCount(total)}
          </p>
          <h2 id={titleId}>{record.id === null ? 'Запись без id' : `ID ${record.id}`}</h2>
        </div>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Закрыть">
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
      </header>

      <form className="drawer-form" onSubmit={onSubmit} noValidate>
        <div className="drawer-body">
          <div className="drawer-badges">
            <ConfidenceBadge status={status} confidence={record.confidence} />
            {review && (
              <span className={`badge rev-${review.kind}`} title={REVIEW_META[review.kind].title}>
                {REVIEW_META[review.kind].label}
              </span>
            )}
            {dirty && <span className="drawer-dirty">Есть несохранённые изменения</span>}
          </div>

          <h3 className="drawer-section">Исходная строка</h3>
          {record.raw_address === '' ? (
            <p className="highlight empty">В записи нет строки адреса</p>
          ) : (
            <Highlight raw={record.raw_address} spans={data?.spans ?? []} />
          )}
          <HighlightLegend />

          {parsed.state === 'loading' && <p className="hint">Загружаем подсветку и источники полей…</p>}
          {parsed.state === 'error' && (
            <p className="error" role="alert">
              Подсветка недоступна: {parsed.message}. Поля можно править и без неё.
            </p>
          )}
          {data?.suggestion && (
            <p className="suggestion suggestion-static">
              <span className="suggestion-label">Подсказка:</span> {data.suggestion}
            </p>
          )}

          <h3 className="drawer-section">Поля</h3>
          <div className="edit-fields">
            {FIELDS.map((f, k) => {
              const id = `${idBase}-${f}`
              const changed = values[f] !== original[f]
              const source = data ? (data.sources[f] ?? (original[f] === null ? 'absent' : 'string')) : null
              const meta = changed ? MANUAL : source ? (SOURCE_META[source] ?? SOURCE_META.absent) : null
              const cls = changed ? 'manual' : `src-${source}`
              return (
                <div className={`edit-row${changed ? ' changed' : ''}`} key={f}>
                  <label htmlFor={id}>
                    <span className={`swatch hl-${FIELD_GROUP[f]}`} aria-hidden="true" />
                    {FIELD_LABELS[f]}
                  </label>
                  {f === 'street_type' ? (
                    <select id={id} className="input" value={form[f]} onChange={(e) => set(f, e.target.value)}>
                      <option value="">(пусто)</option>
                      {streetOptions.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      id={id}
                      ref={k === 0 ? firstRef : undefined}
                      data-autofocus={k === 0 ? '' : undefined}
                      className="input"
                      type="text"
                      value={form[f]}
                      onChange={(e) => set(f, e.target.value)}
                      placeholder="пусто"
                      autoComplete="off"
                      spellCheck={false}
                    />
                  )}
                  <span className="edit-source">
                    {meta && (
                      <span className={`badge ${cls}`} title={meta.title}>
                        {meta.label}
                      </span>
                    )}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        <footer className="drawer-foot">
          <button type="submit" className="button">
            Сохранить и следующая <kbd>Enter</kbd>
          </button>
          <button type="button" className="button button-secondary" onClick={() => onSave(values)}>
            Сохранить
          </button>
          <button type="button" className="button button-secondary" onClick={accept}>
            Принять как есть
          </button>
          <button
            type="button"
            className="button button-ghost"
            onClick={reset}
            disabled={!review && !dirty}
            title="Убрать правку и вернуть разбор сервера"
          >
            Сбросить
          </button>
        </footer>
      </form>
    </div>
  )
}
