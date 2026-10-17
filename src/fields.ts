import type { Field, Level, Source, Status } from './api'
import type { TranslationKey } from './i18n/translations'

/** Label keys: t(FIELD_LABELS[f]) gives the field name in the current language. */
export const FIELD_LABELS: Record<Field, TranslationKey> = {
  province: 'field.province',
  city: 'field.city',
  district: 'field.district',
  living_area: 'field.living_area',
  street_type: 'field.street_type',
  street_name: 'field.street_name',
  house: 'field.house',
  apartment: 'field.apartment',
  entrance: 'field.entrance',
  floor: 'field.floor',
  landmark: 'field.landmark',
}

export type Group = 'location' | 'street' | 'number' | 'detail' | 'landmark'

export const FIELD_GROUP: Record<Field, Group> = {
  province: 'location',
  city: 'location',
  district: 'location',
  living_area: 'location',
  street_type: 'street',
  street_name: 'street',
  house: 'number',
  apartment: 'detail',
  entrance: 'detail',
  floor: 'detail',
  landmark: 'landmark',
}

export const GROUPS: ReadonlyArray<{ id: Group; label: TranslationKey }> = [
  { id: 'location', label: 'group.location' },
  { id: 'street', label: 'group.street' },
  { id: 'number', label: 'group.number' },
  { id: 'detail', label: 'group.detail' },
  { id: 'landmark', label: 'group.landmark' },
]

export type Meta = { label: TranslationKey; title: TranslationKey }

export const SOURCE_META: Record<Source, Meta> = {
  string: { label: 'source.string', title: 'source.string.title' },
  directory: { label: 'source.directory', title: 'source.directory.title' },
  absent: { label: 'source.absent', title: 'source.absent.title' },
}

export const MANUAL_META: Meta = { label: 'source.manual', title: 'source.manual.title' }

export const LEVEL_META: Record<Level, Meta> = {
  house: { label: 'level.house', title: 'level.house.title' },
  street: { label: 'level.street', title: 'level.street.title' },
  area: { label: 'level.area', title: 'level.area.title' },
  settlement: { label: 'level.settlement', title: 'level.settlement.title' },
  district: { label: 'level.district', title: 'level.district.title' },
}

export const STATUS_META: Record<Status, Meta> = {
  confident: { label: 'status.confident', title: 'status.confident.title' },
  review: { label: 'status.review', title: 'status.review.title' },
  unparsed: { label: 'status.unparsed', title: 'status.unparsed.title' },
}
