import type { Field, Source, Status } from './api'

export const FIELD_LABELS: Record<Field, string> = {
  province: 'Область',
  city: 'Город',
  district: 'Район',
  living_area: 'Жилой массив',
  street_type: 'Тип улицы',
  street_name: 'Улица',
  house: 'Дом',
  apartment: 'Квартира',
  entrance: 'Подъезд',
  floor: 'Этаж',
  landmark: 'Ориентир',
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

export const GROUPS: ReadonlyArray<{ id: Group; label: string }> = [
  { id: 'location', label: 'Населённый пункт и район' },
  { id: 'street', label: 'Улица' },
  { id: 'number', label: 'Дом' },
  { id: 'detail', label: 'Квартира, подъезд, этаж' },
  { id: 'landmark', label: 'Ориентир' },
]

export const SOURCE_META: Record<Source, { label: string; title: string }> = {
  string: { label: 'из строки', title: 'Значение взято из исходной строки' },
  directory: { label: 'справочник', title: 'Значение восстановлено по справочнику' },
  absent: { label: 'нет', title: 'Значения нет ни в строке, ни в справочнике' },
}

export const STATUS_META: Record<Status, { label: string; title: string }> = {
  confident: { label: 'Уверенно', title: 'Уверенность не ниже 0,8' },
  review: { label: 'Проверить', title: 'Уверенность от 0,5 до 0,8: стоит проверить вручную' },
  unparsed: { label: 'Не разобран', title: 'Уверенность ниже 0,5' },
}
