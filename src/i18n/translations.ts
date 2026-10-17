export const LANGUAGES = [
  { code: "kk", label: "Қазақша" },
  { code: "ru", label: "Русский" },
  { code: "en", label: "English" },
  { code: "zh", label: "中文" },
] as const;

export type LangCode = (typeof LANGUAGES)[number]["code"];

export const DEFAULT_LANG: LangCode = "ru";

// Русский — основной словарь: по его ключам TypeScript проверяет остальные языки.
const ru = {
  "nav.address": "Address",
  "nav.parse": "Разбор",
  "nav.docs": "Документация",
  "theme.toggle": "Сменить тему",
  "lang.label": "Язык",

  "parse.title": "Разбор адресов",
  "parse.subtitle":
    "Раскладываем адрес из одной строки на поля, показываем, откуда взято каждое значение, и отмечаем записи для ручной проверки.",

  "single.title": "Проверить строку",
  "single.placeholder": "Введите адрес одной строкой",
  "single.submit": "Разобрать",

  "batch.title": "Пакетная обработка",
  "batch.onlyFixes": "Только исправления",
  "batch.downloadJson": "Скачать JSON",
  "batch.drop": "Перетащите файл .json сюда или нажмите, чтобы выбрать",
  "batch.format": "Формат",
};

export type TranslationKey = keyof typeof ru;
type Dictionary = Record<TranslationKey, string>;

const kk: Dictionary = {
  "nav.address": "Address",
  "nav.parse": "Талдау",
  "nav.docs": "Құжаттама",
  "theme.toggle": "Тақырыпты ауыстыру",
  "lang.label": "Тіл",

  "parse.title": "Мекенжайларды талдау",
  "parse.subtitle":
    "Бір жолдағы мекенжайды өрістерге бөлеміз, әр мәннің қайдан алынғанын көрсетеміз және қолмен тексеруге қажет жазбаларды белгілейміз.",

  "single.title": "Жолды тексеру",
  "single.placeholder": "Мекенжайды бір жолмен енгізіңіз",
  "single.submit": "Талдау",

  "batch.title": "Топтамалық өңдеу",
  "batch.onlyFixes": "Тек түзетулер",
  "batch.downloadJson": "JSON жүктеу",
  "batch.drop": ".json файлын осында сүйреңіз немесе таңдау үшін басыңыз",
  "batch.format": "Формат",
};

const en: Dictionary = {
  "nav.address": "Address",
  "nav.parse": "Parser",
  "nav.docs": "Documentation",
  "theme.toggle": "Switch theme",
  "lang.label": "Language",

  "parse.title": "Address parsing",
  "parse.subtitle":
    "We split a single-line address into fields, show where each value came from, and flag records for manual review.",

  "single.title": "Check a string",
  "single.placeholder": "Enter an address as a single line",
  "single.submit": "Parse",

  "batch.title": "Batch processing",
  "batch.onlyFixes": "Fixes only",
  "batch.downloadJson": "Download JSON",
  "batch.drop": "Drag a .json file here or click to choose",
  "batch.format": "Format",
};

const zh: Dictionary = {
  "nav.address": "Address",
  "nav.parse": "解析",
  "nav.docs": "文档",
  "theme.toggle": "切换主题",
  "lang.label": "语言",

  "parse.title": "地址解析",
  "parse.subtitle":
    "将单行地址拆分为字段，显示每个值的来源，并标记需要人工核查的记录。",

  "single.title": "检查地址",
  "single.placeholder": "请输入单行地址",
  "single.submit": "解析",

  "batch.title": "批量处理",
  "batch.onlyFixes": "仅显示修正项",
  "batch.downloadJson": "下载 JSON",
  "batch.drop": "将 .json 文件拖到此处，或点击选择",
  "batch.format": "格式",
};

export const translations: Record<LangCode, Dictionary> = { ru, kk, en, zh };
