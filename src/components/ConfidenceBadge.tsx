import type { Status } from '../api'
import { STATUS_META } from '../fields'

type Props = { status: Status; confidence: number; compact?: boolean }

export function ConfidenceBadge({ status, confidence, compact = false }: Props) {
  const meta = STATUS_META[status]
  const value = confidence.toFixed(2)
  return (
    <span className={`badge conf-${status}`} title={meta.title}>
      {compact ? value : `${meta.label} · ${value}`}
    </span>
  )
}
