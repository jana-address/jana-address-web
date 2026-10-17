import type { Status } from '../api'
import { STATUS_META } from '../fields'
import { useI18n } from '../i18n/useI18n'

type Props = { status: Status; confidence: number; compact?: boolean }

export function ConfidenceBadge({ status, confidence, compact = false }: Props) {
  const { t } = useI18n()
  const meta = STATUS_META[status]
  const value = confidence.toFixed(2)
  return (
    <span className={`badge conf-${status}`} title={t(meta.title)}>
      {compact ? value : `${t(meta.label)} · ${value}`}
    </span>
  )
}
