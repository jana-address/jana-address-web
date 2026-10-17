import { FIELDS, type AddressRecord, type Echo, type Field } from './api'

export type Values = Record<Field, string | null>

/** A record checked by hand: "edited" if a value changed, "accepted" if it was confirmed as is. */
export type Review = { kind: 'edited' | 'accepted'; values: Values }
export type Reviews = ReadonlyMap<number, Review>

export const REVIEW_META: Record<Review['kind'], { label: string; title: string }> = {
  edited: { label: 'исправлено', title: 'Поля исправлены вручную' },
  accepted: { label: 'проверено', title: 'Разбор проверен и принят без изменений' },
}

export const STREET_TYPES = [
  'улица',
  'проспект',
  'микрорайон',
  'переулок',
  'квартал',
  'бульвар',
  'шоссе',
  'жилой комплекс',
] as const

export function valuesOf(r: AddressRecord): Values {
  return Object.fromEntries(FIELDS.map((f) => [f, r[f]])) as Values
}

/** Input text to a field value: trimmed, empty means null. */
export function normalize(text: string): string | null {
  const t = text.trim()
  return t === '' ? null : t
}

export function sameValues(a: Values, b: Values): boolean {
  return FIELDS.every((f) => a[f] === b[f])
}

/* ---------- Draft in localStorage ---------- */

const PREFIX = 'jana-address:review:v1:'

type Stored = {
  saved: number
  /** [record index, raw_address, kind, values in FIELDS order] */
  items: Array<[number, string, Review['kind'], Array<string | null>]>
}

/** One draft per uploaded file: name + size + record count. */
export function draftKey(fileName: string, size: number, count: number): string {
  return `${PREFIX}${count}:${size}:${fileName}`
}

export type Draft = { reviews: Map<number, Review>; saved: number }

/** Restores reviews whose index and raw_address still match the records; null if there is nothing to restore. */
export function loadDraft(key: string, records: readonly AddressRecord[]): Draft | null {
  let data: unknown
  try {
    const text = window.localStorage.getItem(key)
    if (!text) return null
    data = JSON.parse(text)
  } catch {
    return null
  }
  if (typeof data !== 'object' || data === null) return null
  const { saved, items } = data as Partial<Stored>
  if (!Array.isArray(items)) return null
  const reviews = new Map<number, Review>()
  for (const item of items) {
    if (!Array.isArray(item) || item.length !== 4) continue
    const [index, raw, kind, list] = item as Stored['items'][number]
    const record = Number.isInteger(index) ? records[index] : undefined
    if (!record || record.raw_address !== raw) continue
    if ((kind !== 'edited' && kind !== 'accepted') || !Array.isArray(list) || list.length !== FIELDS.length) continue
    const values = Object.fromEntries(
      FIELDS.map((f, k) => [f, typeof list[k] === 'string' && list[k] !== '' ? list[k] : null]),
    ) as Values
    reviews.set(index, { kind, values })
  }
  if (reviews.size === 0) return null
  return { reviews, saved: typeof saved === 'number' ? saved : 0 }
}

/** Returns false when the browser storage is unavailable or full: the work then lives only in memory. */
export function saveDraft(key: string, reviews: Reviews, records: readonly AddressRecord[]): boolean {
  try {
    if (reviews.size === 0) {
      window.localStorage.removeItem(key)
      return true
    }
    const items: Stored['items'] = []
    for (const [index, r] of reviews) {
      items.push([index, records[index].raw_address, r.kind, FIELDS.map((f) => r.values[f])])
    }
    const stored: Stored = { saved: Date.now(), items }
    window.localStorage.setItem(key, JSON.stringify(stored))
    return true
  } catch {
    return false
  }
}

export function dropDraft(key: string): void {
  try {
    window.localStorage.removeItem(key)
  } catch {
    // storage unavailable: nothing to drop
  }
}

/* ---------- Export in the jury format ---------- */

/**
 * JSON array, input order, exactly 14 keys per record in the order of the case. id and raw_address are copied
 * from the API response as text; a reviewed record gets its values and confidence 1, the review flag is not written.
 */
export function buildExport(
  records: readonly AddressRecord[],
  echoes: readonly Echo[],
  reviews: Reviews,
  onlyReviewed = false,
): string {
  const indices = onlyReviewed ? [...reviews.keys()].sort((a, b) => a - b) : records.keys()
  const out: string[] = []
  for (const i of indices) {
    const review = reviews.get(i)
    const values: Values = review?.values ?? records[i]
    let s = `{"id":${echoes[i].id},"raw_address":${echoes[i].raw}`
    for (const f of FIELDS) s += `,"${f}":${JSON.stringify(values[f])}`
    s += `,"confidence":${review ? 1 : JSON.stringify(records[i].confidence)}}`
    out.push(s)
  }
  return out.length === 0 ? '[]\n' : `[\n${out.join(',\n')}\n]\n`
}

/* ---------- Small text helpers ---------- */

/** Russian plural: plural(5, ['правка', 'правки', 'правок']) → 'правок'. */
export function plural(n: number, forms: readonly [string, string, string]): string {
  const m10 = n % 10
  const m100 = n % 100
  if (m10 === 1 && m100 !== 11) return forms[0]
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return forms[1]
  return forms[2]
}

export function formatCount(n: number): string {
  return n.toLocaleString('ru-RU')
}
