import type { Field, Span } from '../api'
import { FIELD_GROUP, FIELD_LABELS, GROUPS } from '../fields'

type Segment = { text: string; field: Field | null }

function toSegments(raw: string, spans: Span[]): Segment[] {
  const valid = spans
    .filter(
      (s) =>
        Object.hasOwn(FIELD_GROUP, s.field) &&
        Number.isInteger(s.start) &&
        Number.isInteger(s.end) &&
        s.start >= 0 &&
        s.start < s.end &&
        s.end <= raw.length,
    )
    .sort((a, b) => a.start - b.start)

  const out: Segment[] = []
  let pos = 0
  for (const s of valid) {
    if (s.start < pos) continue
    if (s.start > pos) out.push({ text: raw.slice(pos, s.start), field: null })
    out.push({ text: raw.slice(s.start, s.end), field: s.field })
    pos = s.end
  }
  if (pos < raw.length) out.push({ text: raw.slice(pos), field: null })
  return out
}

export function Highlight({ raw, spans }: { raw: string; spans: Span[] }) {
  return (
    <p className="highlight">
      {toSegments(raw, spans).map((seg, i) =>
        seg.field ? (
          <mark key={i} className={`hl hl-${FIELD_GROUP[seg.field]}`} title={FIELD_LABELS[seg.field]}>
            {seg.text}
          </mark>
        ) : (
          <span key={i}>{seg.text}</span>
        ),
      )}
    </p>
  )
}

export function HighlightLegend() {
  return (
    <ul className="legend" aria-label="Обозначения">
      {GROUPS.map((g) => (
        <li key={g.id}>
          <span className={`swatch hl-${g.id}`} aria-hidden="true" />
          {g.label}
        </li>
      ))}
    </ul>
  )
}
