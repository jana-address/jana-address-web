import { FIELDS, type AddressRecord, type Field, type Source } from '../api'
import { FIELD_GROUP, FIELD_LABELS, SOURCE_META } from '../fields'
import { useI18n } from '../i18n/useI18n'

type Props = {
  record: AddressRecord
  sources: Partial<Record<Field, Source>>
}

export function FieldsTable({ record, sources }: Props) {
  const { t } = useI18n()
  return (
    <dl className="fields">
      {FIELDS.map((f) => {
        const value = record[f]
        const source: Source = sources[f] ?? (value === null ? 'absent' : 'string')
        const meta = SOURCE_META[source] ?? SOURCE_META.absent
        return (
          <div className="field-row" key={f}>
            <dt>
              <span className={`swatch hl-${FIELD_GROUP[f]}`} aria-hidden="true" />
              {t(FIELD_LABELS[f])}
            </dt>
            <dd className={value === null ? 'field-value empty' : 'field-value'}>{value ?? '—'}</dd>
            <dd className="field-source">
              <span className={`badge src-${source}`} title={t(meta.title)}>
                {t(meta.label)}
              </span>
            </dd>
          </div>
        )
      })}
    </dl>
  )
}
