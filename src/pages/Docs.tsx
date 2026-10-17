import { useEffect, useState, type ReactNode } from 'react'
import { CodeBlock } from '../components/CodeBlock'

const SECTIONS = [
  { id: 'batch', title: 'Пакетный разбор' },
  { id: 'parse', title: 'Разбор одной строки' },
  { id: 'health', title: 'Состояние сервиса' },
  { id: 'fields', title: 'Поля ответа' },
  { id: 'confidence', title: 'Уверенность и статусы' },
] as const

const BATCH_CURL = `curl -s -XPOST http://localhost:8080/api/v1/parse/batch \\
  --data-binary @sample_input.json -o result.json`

const BATCH_INPUT = `[
  {"id": "rec_00417", "raw_address": "город Алматы/Алматы қаласы, Мкр Аксай 3а, 59, кв 70"}
]`

const BATCH_OUTPUT = `[
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

const PARSE_CURL = `curl -s -XPOST http://localhost:8080/api/v1/parse \\
  -H 'Content-Type: application/json' \\
  -d '{"raw_address": "г.Алматы, пр. Достык 1/2, кв 5"}'`

const PARSE_OUTPUT = `{
  "result": {
    "id": null,
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
  },
  "spans": [
    {"field": "city", "start": 6, "end": 12},
    {"field": "city", "start": 13, "end": 19},
    {"field": "street_type", "start": 28, "end": 31},
    {"field": "street_name", "start": 32, "end": 40},
    {"field": "house", "start": 42, "end": 44},
    {"field": "apartment", "start": 46, "end": 51}
  ],
  "sources": {
    "province": "directory", "city": "string", "district": "directory",
    "living_area": "absent", "street_type": "string", "street_name": "string",
    "house": "string", "apartment": "string", "entrance": "absent",
    "floor": "absent", "landmark": "absent"
  },
  "status": "confident",
  "suggestion": "Алматы, микрорайон Аксай 3а, д. 59, кв. 70"
}`

const HEALTH_OUTPUT = `{
  "status": "ok",
  "version": "0.1.0",
  "db": "ok",
  "directory": {
    "origin": "embedded",
    "source_date": "2026-09-18",
    "sha256": "7b87e0a8a72818ca5adcc7b4a7792dd0afd1a3165ed163197012c7c154d4e990",
    "rows": 15586,
    "offline": true,
    "last_check": "2026-10-17T09:00:00Z",
    "last_error": "…"
  }
}`

const HEALTH_CURL = `curl -s http://localhost:8080/api/v1/health
curl -s http://localhost:8080/livez
curl -s http://localhost:8080/readyz`

const FIELD_RULES: ReadonlyArray<{ key: string; label: string; rule: ReactNode; example: string }> = [
  { key: 'id', label: 'ID записи', rule: 'Как во входном файле, тем же типом: строка остаётся строкой, число числом.', example: 'rec_00417' },
  { key: 'raw_address', label: 'Исходная строка', rule: 'Возвращается без изменений, байт в байт.', example: '—' },
  {
    key: 'province',
    label: 'Область',
    rule: 'Прямой порядок слов. Для городов республиканского значения — сам город.',
    example: 'Актюбинская область; Алматы',
  },
  {
    key: 'city',
    label: 'Город',
    rule: (
      <>
        Только название, в каноничной форме: без «город», «пос.» и без казахской половины
        («город Актобе/Ақтөбе қаласы» → «Актобе»).
      </>
    ),
    example: 'Актобе; Боралдай',
  },
  { key: 'district', label: 'Район', rule: 'Без слова «район».', example: 'Илийский; Ауэзовский' },
  {
    key: 'living_area',
    label: 'Жилой массив',
    rule: 'Микрорайон или ЖК, когда улица указана отдельно.',
    example: 'Пришахтинск; Томирис',
  },
  {
    key: 'street_type',
    label: 'Тип улицы',
    rule: (
      <>
        Одно из: улица, проспект, микрорайон, переулок, квартал, бульвар, шоссе, жилой комплекс.{' '}
        <code>null</code>, если тип в строке не написан.
      </>
    ),
    example: 'проспект',
  },
  {
    key: 'street_name',
    label: 'Улица',
    rule: 'Без типа, ровно как написано: регистр и опечатки сохраняются.',
    example: 'казибек би',
  },
  { key: 'house', label: 'Дом', rule: 'С дробью и литерой.', example: '1/2; 12а' },
  { key: 'apartment', label: 'Квартира', rule: 'Только номер.', example: '70' },
  { key: 'entrance', label: 'Подъезд', rule: 'Только номер.', example: '5' },
  { key: 'floor', label: 'Этаж', rule: 'Только номер.', example: '9' },
  { key: 'landmark', label: 'Ориентир', rule: 'Как написано в строке.', example: 'магазин Береке' },
  { key: 'confidence', label: 'Уверенность', rule: 'Число от 0 до 1, см. «Уверенность и статусы».', example: '0.95' },
]

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="card doc-section" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`}>
        <a className="anchor" href={`#${id}`} aria-hidden="true" tabIndex={-1}>
          #
        </a>
        {title}
      </h2>
      {children}
    </section>
  )
}

function Toc({ active }: { active: string }) {
  const [open, setOpen] = useState(false)
  return (
    <nav className="toc" aria-label="Содержание">
      <button
        type="button"
        className="toc-toggle"
        aria-expanded={open}
        aria-controls="toc-list"
        onClick={() => setOpen(!open)}
      >
        Содержание
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
              {s.title}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  )
}

export function Docs() {
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
      { rootMargin: '0px 0px -65% 0px' },
    )
    for (const s of SECTIONS) {
      const el = document.getElementById(s.id)
      if (el) obs.observe(el)
    }
    return () => obs.disconnect()
  }, [])

  return (
    <main className="container docs">
      <h1>Документация</h1>
      <p className="lead">
        HTTP API Jana Address: методы, формат запроса и ответа, поля и статусы.
      </p>

      <div className="docs-layout">
        <Toc active={active} />

        <div className="docs-content">

          <Section id="batch" title="Пакетный разбор">
            <p className="endpoint">
              <span className="method">POST</span> <code>/api/v1/parse/batch</code>
            </p>
            <h3>Вход</h3>
            <p>
              JSON-массив записей <code>{'[{"id": "rec_00417", "raw_address": "…"}]'}</code>. Также
              принимаются:
            </p>
            <ul className="doc-list">
              <li>
                объект, в котором массив лежит в поле <code>items</code>, <code>records</code>,{' '}
                <code>data</code> или <code>addresses</code>;
              </li>
              <li>NDJSON: одна запись на строку;</li>
              <li>
                <code>multipart/form-data</code> с файлом в поле <code>file</code>.
              </li>
            </ul>
            <p>Кодировка UTF-8, BOM в начале допустим. Тело запроса до 64 МиБ.</p>

            <h3>Выход</h3>
            <ul className="doc-list">
              <li>JSON-массив в том же порядке: по одному объекту на каждую входную запись.</li>
              <li>
                В объекте ровно 14 ключей в порядке ТЗ: <code>id</code>, <code>raw_address</code>,{' '}
                <code>province</code>, <code>city</code>, <code>district</code>, <code>living_area</code>,{' '}
                <code>street_type</code>, <code>street_name</code>, <code>house</code>,{' '}
                <code>apartment</code>, <code>entrance</code>, <code>floor</code>, <code>landmark</code>,{' '}
                <code>confidence</code>.
              </li>
              <li>
                Поле, которого нет в строке и которое нельзя восстановить, равно <code>null</code>.
              </li>
              <li>
                <code>raw_address</code> возвращается байт в байт, как пришёл.
              </li>
              <li>
                Запись, которую нельзя разобрать (<code>raw_address</code> не строка или его нет), всё равно
                получает объект: поля <code>null</code>, <code>confidence</code> 0.
              </li>
            </ul>

            <h3>Заголовки и ошибки</h3>
            <ul className="doc-list">
              <li>
                <code>X-Records</code>: число записей в ответе.
              </li>
              <li>
                Трейлер <code>X-Parse-Ms</code>: время разбора в миллисекундах.
              </li>
              <li>
                <code>400</code> с телом <code>{'{"error": "…"}'}</code> только тогда, когда всё тело не
                читается как JSON. Ошибка в отдельной записи ответ не ломает.
              </li>
              <li>1 000 записей разбираются примерно за 5 мс, 100 000 — примерно за 0,6 с.</li>
            </ul>

            <CodeBlock label="bash" code={BATCH_CURL} />

            <h3>Пример из ТЗ</h3>
            <div className="code-pair">
              <CodeBlock label="sample_input.json" code={BATCH_INPUT} />
              <CodeBlock label="result.json" code={BATCH_OUTPUT} />
            </div>
            <p className="hint">
              Района «Ауэзовский» в строке нет: значение восстановлено из справочника.
            </p>
          </Section>

          <Section id="parse" title="Разбор одной строки">
            <p className="endpoint">
              <span className="method">POST</span> <code>/api/v1/parse</code>
            </p>
            <p>
              Метод для интерфейса. Принимает <code>{'{"raw_address": "…"}'}</code> (до 1 МиБ) и кроме полей
              возвращает подсветку, источники значений и подсказку.
            </p>
            <ul className="doc-list">
              <li>
                <code>result</code>: те же 14 ключей, что в пакетном методе, <code>id</code> равен{' '}
                <code>null</code>.
              </li>
              <li>
                <code>spans</code>: список <code>{'{"field", "start", "end"}'}</code>. Смещения в единицах
                UTF-16 внутри <code>raw_address</code>, в JavaScript это <code>raw.slice(start, end)</code>.
              </li>
              <li>
                <code>sources</code>: для каждого поля <code>string</code> (из строки),{' '}
                <code>directory</code> (из справочника) или <code>absent</code> (нет).
              </li>
              <li>
                <code>status</code>: <code>confident</code>, <code>review</code> или <code>unparsed</code>.
              </li>
              <li>
                <code>suggestion</code>: адрес в чистом виде, например «Астана, проспект Мәңгілік Ел, д. 55».
              </li>
            </ul>
            <CodeBlock label="bash" code={PARSE_CURL} />
            <CodeBlock label="ответ" code={PARSE_OUTPUT} />
          </Section>

          <Section id="health" title="Состояние сервиса">
            <p className="endpoint">
              <span className="method method-get">GET</span> <code>/api/v1/health</code>
            </p>
            <CodeBlock label="ответ" code={HEALTH_OUTPUT} />
            <ul className="doc-list">
              <li>
                <code>status</code> становится <code>degraded</code>, а <code>db</code> —{' '}
                <code>down</code>, если база не отвечает.
              </li>
              <li>
                <code>directory</code>: версия справочника КАТО. <code>origin</code> —{' '}
                <code>embedded</code> (снимок в образе) или <code>stat.gov.kz</code> (скачан при обновлении).
              </li>
              <li>
                <code>last_check</code> и <code>last_error</code> есть, только если включено обновление
                справочника; <code>last_error</code> — только после неудачной проверки.
              </li>
              <li>
                <code>/livez</code>: процесс жив. <code>/readyz</code>: 200, если база отвечает, иначе 503.
                Оба на порту API 8080.
              </li>
              <li>
                Спецификация OpenAPI: <a href="/api/v1/openapi.yaml">/api/v1/openapi.yaml</a>.
              </li>
            </ul>
            <CodeBlock label="bash" code={HEALTH_CURL} />
          </Section>

          <Section id="fields" title="Поля ответа">
            <div className="table-wrap">
              <table className="doc-table">
                <thead>
                  <tr>
                    <th>Поле</th>
                    <th>Правило</th>
                    <th>Пример</th>
                  </tr>
                </thead>
                <tbody>
                  {FIELD_RULES.map((r) => (
                    <tr key={r.key}>
                      <td data-label="Поле">
                        <code>{r.key}</code>
                        <span className="doc-table-sub">{r.label}</span>
                      </td>
                      <td data-label="Правило">{r.rule}</td>
                      <td data-label="Пример" className="doc-table-example">
                        {r.example}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          <Section id="confidence" title="Уверенность и статусы">
            <ul className="status-list">
              <li>
                <span className="badge conf-confident">Уверенно</span>
                <span>
                  <code>confidence</code> ≥ 0,8: разбор можно брать без проверки.
                </span>
              </li>
              <li>
                <span className="badge conf-review">Проверить</span>
                <span>0,5 ≤ <code>confidence</code> &lt; 0,8: стоит посмотреть глазами.</span>
              </li>
              <li>
                <span className="badge conf-unparsed">Не разобрано</span>
                <span>
                  <code>confidence</code> &lt; 0,5: строку не удалось уверенно разложить на поля.
                </span>
              </li>
            </ul>
          </Section>



        </div>
      </div>
    </main>
  )
}
