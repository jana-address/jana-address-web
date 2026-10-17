export const FIELDS = [
  'province',
  'city',
  'district',
  'living_area',
  'street_type',
  'street_name',
  'house',
  'apartment',
  'entrance',
  'floor',
  'landmark',
] as const

export type Field = (typeof FIELDS)[number]
export type Source = 'string' | 'directory' | 'absent'
export type Status = 'confident' | 'review' | 'unparsed'

export type AddressRecord = {
  id: string | number | null
  raw_address: string
  confidence: number
} & Record<Field, string | null>

export type Span = { field: Field; start: number; end: number }

export type ParseResponse = {
  result: AddressRecord
  spans: Span[]
  sources: Partial<Record<Field, Source>>
  status: Status
  /** The address in a clean form, shown as a hint under the input. */
  suggestion: string
}

export type BatchResponse = {
  records: AddressRecord[]
  /** Response body exactly as received, for download. */
  text: string
}

export type Health = {
  status: 'ok' | 'degraded'
  version: string
  db: 'ok' | 'down'
}

export class ApiError extends Error {}

const STATUSES: readonly Status[] = ['confident', 'review', 'unparsed']

export function statusOf(confidence: number): Status {
  if (confidence >= 0.8) return 'confident'
  if (confidence >= 0.5) return 'review'
  return 'unparsed'
}

export function isAbort(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError'
}

export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  return String(err)
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function httpMessage(status: number, body: string): string {
  let detail = ''
  try {
    const data: unknown = JSON.parse(body)
    if (isObject(data)) {
      const e = data.error ?? data.message
      if (typeof e === 'string') detail = e
      else if (isObject(e) && typeof e.message === 'string') detail = e.message
    }
  } catch {
    detail = body.trim().slice(0, 200)
  }
  const head =
    status === 400 || status === 422 ? 'Сервер не принял запрос'
    : status === 413 ? 'Файл слишком большой для сервера'
    : status === 404 ? 'Метод API не найден'
    : status >= 502 && status <= 504 ? 'Сервер разбора недоступен'
    : status >= 500 ? 'Ошибка на сервере'
    : 'Сервер ответил ошибкой'
  return `${head} (HTTP ${status})${detail ? `: ${detail}` : ''}`
}

async function post(path: string, body: string, signal?: AbortSignal): Promise<string> {
  let res: Response
  try {
    res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body,
      signal,
    })
  } catch (err) {
    if (isAbort(err)) throw err
    throw new ApiError('Не удалось связаться с сервером. Проверьте, что API запущен.')
  }
  const text = await res.text()
  if (!res.ok) throw new ApiError(httpMessage(res.status, text))
  return text
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    throw new ApiError('Сервер вернул ответ не в формате JSON')
  }
}

function toRecord(v: unknown): AddressRecord {
  if (!isObject(v) || typeof v.raw_address !== 'string') {
    throw new ApiError('Ответ сервера не похож на разобранный адрес')
  }
  const confidence = typeof v.confidence === 'number' ? v.confidence : 0
  const id = typeof v.id === 'string' || typeof v.id === 'number' ? v.id : null
  const fields = Object.fromEntries(
    FIELDS.map((f) => [f, typeof v[f] === 'string' && v[f] !== '' ? v[f] : null]),
  ) as Record<Field, string | null>
  return { ...fields, id, raw_address: v.raw_address, confidence }
}

export async function parseOne(rawAddress: string, signal?: AbortSignal): Promise<ParseResponse> {
  const data = parseJson(await post('/api/v1/parse', JSON.stringify({ raw_address: rawAddress }), signal))
  if (!isObject(data)) throw new ApiError('Ответ сервера не похож на разобранный адрес')
  const result = toRecord(data.result)
  const spans = Array.isArray(data.spans) ? (data.spans as Span[]) : []
  const sources = isObject(data.sources) ? (data.sources as Partial<Record<Field, Source>>) : {}
  const status =
    typeof data.status === 'string' && (STATUSES as readonly string[]).includes(data.status)
      ? (data.status as Status)
      : statusOf(result.confidence)
  const suggestion = typeof data.suggestion === 'string' ? data.suggestion : ''
  return { result, spans, sources, status, suggestion }
}

/** Sends the file body unchanged (jury format) and keeps the raw response for download. */
export async function parseBatch(body: string, signal?: AbortSignal): Promise<BatchResponse> {
  const text = await post('/api/v1/parse/batch', body, signal)
  const data = parseJson(text)
  if (!Array.isArray(data)) throw new ApiError('Сервер вернул не массив записей')
  return { records: data.map(toRecord), text }
}

export async function fetchHealth(signal?: AbortSignal): Promise<Health> {
  const res = await fetch('/api/v1/health', { signal, headers: { Accept: 'application/json' } })
  if (!res.ok) throw new ApiError(`HTTP ${res.status}`)
  return (await res.json()) as Health
}
