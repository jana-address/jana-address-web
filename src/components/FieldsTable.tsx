import { FIELDS, type AddressRecord, type Field, type Source } from '../api'
import { FIELD_GROUP, FIELD_LABELS, SOURCE_META } from '../fields'

type Props = {
  record: AddressRecord
  sources: Partial<Record<Field, Source>>
}

export function FieldsTable({ record, sources }: Props) {
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
              {FIELD_LABELS[f]}
            </dt>
            <dd className={value === null ? 'field-value empty' : 'field-value'}>{value ?? '—'}</dd>
            <dd className="field-source">
              <span className={`badge src-${source}`} title={meta.title}>
                {meta.label}
              </span>
            </dd>
          </div>
        )
      })}
    </dl>
  )
}
