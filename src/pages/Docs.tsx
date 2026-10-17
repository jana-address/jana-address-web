import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { FIELDS, errorMessage, parseOne, type ParseResponse } from '../api'
import { CodeBlock } from '../components/CodeBlock'
import { ConfidenceBadge } from '../components/ConfidenceBadge'
import { Highlight } from '../components/Highlight'
import { FIELD_LABELS, SOURCE_META } from '../fields'

const SECTIONS = [
  { id: 'start', title: 'Быстрый старт' },
  { id: 'batch', title: 'Пакетный метод (для жюри)' },
  { id: 'parse', title: 'Разбор одной строки' },
  { id: 'health', title: 'Состояние сервиса' },
  { id: 'fields', title: 'Поля и правила заполнения' },
  { id: 'confidence', title: 'Уверенность и статусы' },
  { id: 'directory', title: 'Справочники и восстановление' },
  { id: 'offline', title: 'Офлайн и обновление справочника' },
  { id: 'examples', title: 'Примеры' },
] as const

/** Strings from the case (demo/tz_examples.json in jana-address-api). Results are not stored: the page asks the API. */
const EXAMPLES = [
  'город Алматы/Алматы қаласы, Мкр Аксай 3а, 59, кв 70',
  '66квартал 12дом 69квартира',
  'Ул .Курильская 9 кв 1',
  'Туран 55/6 магазин береке 4подьезд 9этаж',
  'Нурсити 2 микрорайон 11дом 5 подьезд 239 кв',
  'Турксибский район, Рыбинский переулок, дом 4',
  'Кулманова 133 flat 191',
  'жуалы 19',
  'город Актобе/Ақтөбе қаласы, Назарбаева8, кв 12',
  'Боралдай, ул Ленина 12а',
  'Карагандинская обл, г. Темиртау, ул. Мира 4, кв. 15',
  'Абай көшесі 5 үй 7 пәтер',
  'г.Алматы, пр. Достык 1/2, кв 5',
  'Qazpost Солнечный, Мира 7',
]

const QUICK_START = `git clone --recurse-submodules https://github.com/jana-address/jana-address-api.git \\
  && cd jana-address-api \\
  && docker compose up`

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

const OFFLINE_RUN = `OFFLINE=false docker compose up
docker compose run --rm api migrate`

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

type Examples =
  | { state: 'loading' }
  | { state: 'error'; message: string }
  | { state: 'done'; items: Array<{ raw: string; data: ParseResponse | null; error: string }> }

function LiveExamples({ onSettled }: { onSettled: () => void }) {
  const [st, setSt] = useState<Examples>({ state: 'loading' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const ctrl = new AbortController()
    setSt({ state: 'loading' })
    Promise.allSettled(EXAMPLES.map((raw) => parseOne(raw, ctrl.signal))).then((results) => {
      if (ctrl.signal.aborted) return
      if (results.every((r) => r.status === 'rejected')) {
        const first = results[0] as PromiseRejectedResult
        setSt({ state: 'error', message: errorMessage(first.reason) })
        return
      }
      setSt({
        state: 'done',
        items: results.map((r, i) => ({
          raw: EXAMPLES[i],
          data: r.status === 'fulfilled' ? r.value : null,
          error: r.status === 'rejected' ? errorMessage(r.reason) : '',
        })),
      })
    })
    return () => ctrl.abort()
  }, [attempt])

  useEffect(() => {
    if (st.state !== 'loading') onSettled()
  }, [st.state, onSettled])

  if (st.state === 'loading') {
    return (
      <p className="hint" role="status">
        Разбираем {EXAMPLES.length} строк через API…
      </p>
    )
  }
  if (st.state === 'error') {
    return (
      <div className="error" role="alert">
        <p className="error-text">Примеры не загрузились: {st.message}</p>
        <p className="error-text">
          Результаты на этой странице не записаны заранее, их считает запущенный API. Поднимите стек
          командой <code>docker compose up</code> и повторите.
        </p>
        <button type="button" className="button button-secondary" onClick={() => setAttempt(attempt + 1)}>
          Повторить
        </button>
      </div>
    )
  }
  return (
    <ol className="examples">
      {st.items.map(({ raw, data, error }) => (
        <li key={raw} className="example">
          {data ? (
            <>
              <div className="example-head">
                <Highlight raw={raw} spans={data.spans} />
                <ConfidenceBadge status={data.status} confidence={data.result.confidence} />
              </div>
              <dl className="example-fields">
                {FIELDS.filter((f) => data.result[f] !== null).map((f) => {
                  const source = data.sources[f]
                  return (
                    <div key={f}>
                      <dt>{FIELD_LABELS[f]}</dt>
                      <dd>
                        {data.result[f]}
                        {source === 'directory' && (
                          <span className="badge src-directory" title={SOURCE_META.directory.title}>
                            {SOURCE_META.directory.label}
                          </span>
                        )}
                      </dd>
                    </div>
                  )
                })}
              </dl>
            </>
          ) : (
            <>
              <p className="highlight">{raw}</p>
              <p className="error">Не удалось разобрать: {error}</p>
            </>
          )}
        </li>
      ))}
    </ol>
  )
}

export function Docs() {
  const [active, setActive] = useState<string>(SECTIONS[0].id)

  // The SPA renders after the browser tried the #anchor, so scroll to it here, and once more when the live
  // examples at the bottom have loaded: until then the page may be too short to bring the section to the top.
  const pendingHash = useRef(decodeURIComponent(window.location.hash.slice(1)))

  const scrollToHash = useCallback(() => {
    const id = pendingHash.current
    if (id) document.getElementById(id)?.scrollIntoView()
  }, [])

  const onExamplesSettled = useCallback(() => {
    scrollToHash()
    pendingHash.current = ''
  }, [scrollToHash])

  useEffect(() => {
    scrollToHash()
    const stop = () => {
      pendingHash.current = '' // the reader scrolls on their own
    }
    const opts = { once: true, passive: true }
    window.addEventListener('wheel', stop, opts)
    window.addEventListener('touchstart', stop, opts)
    window.addEventListener('keydown', stop, opts)
    return () => {
      window.removeEventListener('wheel', stop)
      window.removeEventListener('touchstart', stop)
      window.removeEventListener('keydown', stop)
    }
  }, [scrollToHash])

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
        Как запустить Jana Address, как вызвать API для проверки и по каким правилам заполняются поля.
      </p>

      <div className="docs-layout">
        <Toc active={active} />

        <div className="docs-content">
          <Section id="start" title="Быстрый старт">
            <p>
              Нужны Docker и Docker Compose. Интернет нужен только для первой сборки образов, дальше всё
              работает без сети.
            </p>
            <CodeBlock label="bash" code={QUICK_START} />
            <ul className="doc-list">
              <li>
                Интерфейс: <code>http://localhost:3000</code>
              </li>
              <li>
                API: <code>http://localhost:8080</code>
              </li>
            </ul>
            <p>
              Сервисы стартуют по цепочке: база → API → интерфейс. API готов, когда{' '}
              <code>/readyz</code> отвечает 200.
            </p>
          </Section>

          <Section id="batch" title="Пакетный метод (для жюри)">
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
              <li>Скорость: 1 000 записей примерно за 5 мс, 100 000 примерно за 0,6 с.</li>
            </ul>

            <CodeBlock label="bash" code={BATCH_CURL} />

            <h3>Пример из ТЗ</h3>
            <div className="code-pair">
              <CodeBlock label="sample_input.json" code={BATCH_INPUT} />
              <CodeBlock label="result.json" code={BATCH_OUTPUT} />
            </div>
            <p className="hint">
              Района «Ауэзовский» в строке нет: его восстанавливает справочник по микрорайону Аксай. Для этой
              строки уверенность 0,91–0,95.
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
                <code>last_check</code> и <code>last_error</code> появляются после первой проверки обновлений
                при <code>OFFLINE=false</code>; <code>last_error</code> — только если проверка не удалась.
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

          <Section id="fields" title="Поля и правила заполнения">
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
            <h3>Ручная проверка в интерфейсе</h3>
            <ol className="doc-list">
              <li>
                На странице <a href="/">«Разбор»</a> в блоке «Пакетная обработка» загрузите файл .json в
                формате жюри.
              </li>
              <li>
                Таблица открывается на неуверенных записях: включены чипы «Проверить» и «Не разобрано». «Все»
                показывает весь набор, «Исправлено» — записи, проверенные вручную. На странице 200 строк.
              </li>
              <li>
                Нажмите на строку или Enter: откроется панель с подсветкой исходной строки, источником каждого
                поля и подсказкой.
              </li>
              <li>
                Поправьте поля, пустое поле означает <code>null</code>. «Сохранить» запоминает правку,
                «Принять как есть» отмечает запись проверенной без изменений, «Сбросить» убирает правку. Enter —
                «Сохранить и следующая»: переход к следующей неуверенной записи. Esc закрывает панель.
              </li>
              <li>
                «Скачать JSON» выгружает весь набор с правками в формате жюри: 14 ключей, порядок записей
                как во входном файле. У исправленных и проверенных записей <code>confidence</code> = 1.
                «Только исправления» выгружает только их.
              </li>
              <li>
                Правки хранятся в браузере для файла с тем же именем, размером и числом записей. После
                перезагрузки загрузите тот же файл, и правки восстановятся.
              </li>
            </ol>
          </Section>

          <Section id="directory" title="Справочники и восстановление">
            <p>
              <strong>КАТО</strong> — классификатор административно-территориальных объектов (stat.gov.kz):
              15 586 строк, 20 регионов, около 270 районов и около 13 тыс. населённых пунктов, с названиями на
              русском и казахском. Снимок встроен в образ API, при старте записывается в PostgreSQL миграциями
              и хранится с номером версии.
            </p>
            <p>
              <strong>Ручные таблицы</strong>: синонимы и латиница, старые названия (Нур-Султан → Астана,
              Капшагай → Конаев), районы городов, микрорайоны Алматы → район.
            </p>
            <p>Если в строке нет области, города или района, их восстанавливает справочник:</p>
            <ul className="doc-list">
              <li>город и область по району;</li>
              <li>область и район по селу (КАТО);</li>
              <li>район Алматы по микрорайону.</li>
            </ul>
            <p>
              У каждого поля есть источник: <span className="badge src-string">из строки</span> или{' '}
              <span className="badge src-directory">справочник</span>. В API это поле <code>sources</code>,
              в интерфейсе — бейдж рядом со значением.
            </p>
            <h3>Правила безопасности</h3>
            <ul className="doc-list">
              <li>
                Село из КАТО берётся только после «с.», «п.», «ауылы», «г.» или отдельной частью рядом с
                написанным районом или областью. Сотни сёл называются «Абай», «Достык», «Береке», как улицы,
                поэтому слово перед номером дома селом не считается.
              </li>
              <li>
                Если сёл с одним названием несколько, выбирается то, что в написанном районе или области.
                Если их в строке нет, берётся крупный пункт из ручной таблицы.
              </li>
            </ul>
          </Section>

          <Section id="offline" title="Офлайн и обновление справочника">
            <ul className="doc-list">
              <li>
                <code>OFFLINE=true</code> по умолчанию: API не ходит в сеть, финальный прогон идёт без
                интернета.
              </li>
              <li>
                С <code>OFFLINE=false</code> API раз в <code>KATO_REFRESH_INTERVAL</code> (по умолчанию{' '}
                <code>168h</code>) находит актуальный xlsx на странице классификатора stat.gov.kz и сравнивает
                sha256. Новый файл проверяется: не меньше 10 тыс. строк, 20 регионов, уникальные коды,
                отличие от прошлой версии не больше 15%. После этого парсер переключается на новую версию без
                перезапуска.
              </li>
              <li>
                Если загрузка или проверка не прошла, остаётся старая версия, а ошибка видна в{' '}
                <code>/api/v1/health</code> и в таблице <code>kato_sync_log</code>.
              </li>
              <li>
                <code>docker compose run --rm api migrate</code> применяет миграции вручную.
              </li>
            </ul>
            <CodeBlock label="bash" code={OFFLINE_RUN} />
          </Section>

          <Section id="examples" title="Примеры">
            <p>
              Строки из ТЗ. Результат не записан в страницу: каждую строку сейчас разбирает API через{' '}
              <code>POST /api/v1/parse</code>.
            </p>
            <LiveExamples onSettled={onExamplesSettled} />
          </Section>
        </div>
      </div>
    </main>
  )
}
