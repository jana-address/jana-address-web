import { useEffect, useState, type ReactNode } from 'react'
import { CodeBlock } from '../components/CodeBlock'
import type { TranslationKey } from '../i18n/translations'
import { useI18n } from '../i18n/useI18n'

// API reference in the shape of Stripe and DaData: per method a short summary and tables on the left,
// the request and response on the right. Code samples are real responses of the service.

type Method = 'GET' | 'POST'

const SECTIONS = [
  { id: 'batch', title: 'docs.sec.batch', method: 'POST', path: '/api/v1/parse/batch' },
  { id: 'parse', title: 'docs.sec.parse', method: 'POST', path: '/api/v1/parse' },
  { id: 'health', title: 'docs.sec.health', method: 'GET', path: '/api/v1/health' },
  { id: 'address', title: 'docs.sec.address' },
  { id: 'errors', title: 'docs.sec.errors' },
] as const satisfies ReadonlyArray<{ id: string; title: TranslationKey; method?: Method; path?: string }>

type SectionId = (typeof SECTIONS)[number]['id']

const BASE = 'http://localhost:8080'

const BATCH_CURL = `curl -X POST ${BASE}/api/v1/parse/batch \\
  -H 'Content-Type: application/json' \\
  --data-binary @input.json`

const BATCH_BODY = `[
  {"id": "rec_00417", "raw_address": "город Алматы/Алматы қаласы, Мкр Аксай 3а, 59, кв 70"}
]`

const BATCH_RESPONSE = `[
  {
    "id": "rec_00417",
    "raw_address": "город Алматы/Алматы қаласы, Мкр Аксай 3а, 59, кв 70",
    "province": "Алматы",
    "city": "Алматы",
    "district": "Ауэзовский",
    "living_area": null,
    "street_type": "микрорайон",
    "street_name": "Аксай 3а",
    "house": "59",
    "apartment": "70",
    "entrance": null,
    "floor": null,
    "landmark": null,
    "confidence": 0.95
  }
]`

const PARSE_CURL = `curl -X POST ${BASE}/api/v1/parse \\
  -H 'Content-Type: application/json' \\
  -d '{"raw_address": "город Алматы/Алматы қаласы, Мкр Аксай 3а, 59, кв 70"}'`

const PARSE_RESPONSE = `{
  "result": {"id": null, "raw_address": "город Алматы/…", "city": "Алматы", …},
  "spans": [
    {"field": "city", "start": 6, "end": 12},
    {"field": "street_name", "start": 32, "end": 40},
    {"field": "house", "start": 42, "end": 44}
  ],
  "sources": {"city": "string", "district": "directory", "entrance": "absent", …},
  "status": "confident",
  "suggestion": "Алматы, микрорайон Аксай 3а, д. 59, кв. 70"
}`

const HEALTH_CURL = `curl ${BASE}/api/v1/health`

const HEALTH_RESPONSE = `{
  "status": "ok",
  "version": "0.1.0",
  "db": "ok",
  "directory": {
    "origin": "embedded",
    "source_date": "2026-09-18",
    "sha256": "7b87e0a8…4d4e990",
    "rows": 15586,
    "offline": true
  }
}`

const ERROR_RESPONSE = `{"error": "expected a JSON array of {id, raw_address}"}`

type Row = { name: string; type: string; required?: boolean; desc: TranslationKey }

const BATCH_PARAMS: Row[] = [
  { name: '[].id', type: 'any', desc: 'docs.batch.p.id' },
  { name: '[].raw_address', type: 'string', required: true, desc: 'docs.batch.p.raw' },
]

const PARSE_PARAMS: Row[] = [{ name: 'raw_address', type: 'string', required: true, desc: 'docs.parse.p.raw' }]

const PARSE_RETURNS: Row[] = [
  { name: 'result', type: 'Address', desc: 'docs.parse.r.result' },
  { name: 'spans', type: 'array', desc: 'docs.parse.r.spans' },
  { name: 'sources', type: 'object', desc: 'docs.parse.r.sources' },
  { name: 'status', type: 'enum', desc: 'docs.parse.r.status' },
  { name: 'suggestion', type: 'string', desc: 'docs.parse.r.suggestion' },
]

const HEALTH_RETURNS: Row[] = [
  { name: 'status', type: 'enum', desc: 'docs.health.r.status' },
  { name: 'db', type: 'enum', desc: 'docs.health.r.db' },
  { name: 'version', type: 'string', desc: 'docs.health.r.version' },
  { name: 'directory', type: 'object', desc: 'docs.health.r.directory' },
]

const ADDRESS_FIELDS: Row[] = [
  { name: 'id', type: 'any', desc: 'docs.addr.id' },
  { name: 'raw_address', type: 'string', desc: 'docs.addr.raw_address' },
  { name: 'province', type: 'string | null', desc: 'docs.addr.province' },
  { name: 'city', type: 'string | null', desc: 'docs.addr.city' },
  { name: 'district', type: 'string | null', desc: 'docs.addr.district' },
  { name: 'living_area', type: 'string | null', desc: 'docs.addr.living_area' },
  { name: 'street_type', type: 'enum | null', desc: 'docs.addr.street_type' },
  { name: 'street_name', type: 'string | null', desc: 'docs.addr.street_name' },
  { name: 'house', type: 'string | null', desc: 'docs.addr.house' },
  { name: 'apartment', type: 'string | null', desc: 'docs.addr.apartment' },
  { name: 'entrance', type: 'string | null', desc: 'docs.addr.entrance' },
  { name: 'floor', type: 'string | null', desc: 'docs.addr.floor' },
  { name: 'landmark', type: 'string | null', desc: 'docs.addr.landmark' },
  { name: 'confidence', type: 'number', desc: 'docs.addr.confidence' },
]

const ERRORS: ReadonlyArray<{ code: number; desc: TranslationKey }> = [
  { code: 400, desc: 'docs.err.400' },
  { code: 413, desc: 'docs.err.413' },
  { code: 500, desc: 'docs.err.500' },
]

function sectionOf(id: SectionId) {
  return SECTIONS.find((s) => s.id === id)!
}

function Fields({ rows, caption }: { rows: Row[]; caption: TranslationKey }) {
  const { t } = useI18n()
  return (
    <div className="table-wrap">
      <table className="doc-table">
        <caption>{t(caption)}</caption>
        <tbody>
          {rows.map((r) => (
            <tr key={r.name}>
              <td>
                <code>{r.name}</code>
                <span className="doc-type">{r.type}</span>
                {r.required && <span className="doc-required">{t('docs.required')}</span>}
              </td>
              <td>{t(r.desc)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Section({ id, children, code }: { id: SectionId; children: ReactNode; code?: ReactNode }) {
  const { t } = useI18n()
  const s = sectionOf(id)
  return (
    <section id={id} className="card doc-section" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`}>
        <a className="anchor" href={`#${id}`} aria-hidden="true" tabIndex={-1}>
          #
        </a>
        {t(s.title)}
      </h2>
      {'method' in s && (
        <p className="endpoint">
          <span className={`method${s.method === 'GET' ? ' method-get' : ''}`}>{s.method}</span> <code>{s.path}</code>
        </p>
      )}
      <div className={code ? 'doc-grid' : undefined}>
        <div className="doc-text">{children}</div>
        {code && <div className="doc-code">{code}</div>}
      </div>
    </section>
  )
}

function Toc({ active }: { active: string }) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  return (
    <nav className="toc" aria-label={t('docs.toc')}>
      <button
        type="button"
        className="toc-toggle"
        aria-expanded={open}
        aria-controls="toc-list"
        onClick={() => setOpen(!open)}
      >
        {t('docs.toc')}
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </button>
      <ol id="toc-list" className={open ? 'open' : undefined}>
        {SECTIONS.map((s) => (
          <li key={s.id}>
            <a
              href={`#${s.id}`}
              aria-current={active === s.id ? 'location' : undefined}
              onClick={() => setOpen(false)}
            >
              {'method' in s && (
                <span className={`toc-method${s.method === 'GET' ? ' method-get' : ''}`}>{s.method}</span>
              )}
              {t(s.title)}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  )
}

export function Docs() {
  const { t } = useI18n()
  const [active, setActive] = useState<string>(SECTIONS[0].id)

  // the SPA renders after the browser tried the #anchor, so scroll to it here
  useEffect(() => {
    const id = decodeURIComponent(window.location.hash.slice(1))
    if (id) document.getElementById(id)?.scrollIntoView()
  }, [])

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return
    const obs = new IntersectionObserver(
      (entries) => {
        const top = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]
        if (top) setActive(top.target.id)
      },
      // the top 104 px are under the sticky navigation card
      { rootMargin: '-104px 0px -60% 0px' },
    )
    for (const s of SECTIONS) {
      const el = document.getElementById(s.id)
      if (el) obs.observe(el)
    }
    return () => obs.disconnect()
  }, [])

  return (
    <main className="container docs">
      <h1>{t('docs.title')}</h1>
      <p className="lead">{t('docs.lead')}</p>
      <dl className="doc-meta">
        <div>
          <dt>{t('docs.base')}</dt>
          <dd>
            <code>{BASE}</code>
          </dd>
        </div>
        <div>
          <dt>{t('docs.format')}</dt>
          <dd>JSON, UTF-8</dd>
        </div>
        <div>
          <dt>{t('docs.auth')}</dt>
          <dd>{t('docs.auth.none')}</dd>
        </div>
        <div>
          <dt>OpenAPI</dt>
          <dd>
            <a href="/api/v1/openapi.yaml">/api/v1/openapi.yaml</a>
          </dd>
        </div>
      </dl>

      <div className="docs-layout">
        <Toc active={active} />

        <div className="docs-content">
          <Section
            id="batch"
            code={
              <>
                <CodeBlock label={t('docs.request')} code={BATCH_CURL} />
                <CodeBlock label="input.json" code={BATCH_BODY} />
                <CodeBlock label={`${t('docs.response')} 200`} code={BATCH_RESPONSE} />
              </>
            }
          >
            <p>{t('docs.batch.summary')}</p>
            <Fields caption="docs.body" rows={BATCH_PARAMS} />
            <p className="doc-note">{t('docs.batch.formats')}</p>
            <h3>{t('docs.returns')}</h3>
            <p>{t('docs.batch.returns')}</p>
            <h3>{t('docs.limits')}</h3>
            <p>{t('docs.batch.limits')}</p>
          </Section>

          <Section
            id="parse"
            code={
              <>
                <CodeBlock label={t('docs.request')} code={PARSE_CURL} />
                <CodeBlock label={`${t('docs.response')} 200 · ${t('docs.abridged')}`} code={PARSE_RESPONSE} />
              </>
            }
          >
            <p>{t('docs.parse.summary')}</p>
            <Fields caption="docs.body" rows={PARSE_PARAMS} />
            <Fields caption="docs.returns" rows={PARSE_RETURNS} />
          </Section>

          <Section
            id="health"
            code={
              <>
                <CodeBlock label={t('docs.request')} code={HEALTH_CURL} />
                <CodeBlock label={`${t('docs.response')} 200`} code={HEALTH_RESPONSE} />
              </>
            }
          >
            <p>{t('docs.health.summary')}</p>
            <Fields caption="docs.returns" rows={HEALTH_RETURNS} />
          </Section>

          <Section id="address">
            <p>{t('docs.address.summary')}</p>
            <Fields caption="docs.fields" rows={ADDRESS_FIELDS} />
          </Section>

          <Section id="errors" code={<CodeBlock label={`${t('docs.response')} 400`} code={ERROR_RESPONSE} />}>
            <p>{t('docs.errors.summary')}</p>
            <div className="table-wrap">
              <table className="doc-table">
                <tbody>
                  {ERRORS.map((e) => (
                    <tr key={e.code}>
                      <td>
                        <code>{e.code}</code>
                      </td>
                      <td>{t(e.desc)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        </div>
      </div>
    </main>
  )
}
