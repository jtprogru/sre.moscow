// Даты каталога — строки: календарная ГГГГ-ММ-ДД или момент со смещением
// (см. moment в src/content.config.ts). Здесь всё, что из них считается.
//
// Местное время события берётся прямо из строки: «19:00+07:00» показывается
// как 19:00 с пометкой пояса. Так страница не зависит ни от пояса сборочной
// машины, ни от JS в браузере.

/** Пояс сайта: в нём живут календарные даты без времени. Москва, без перехода на летнее. */
export const SITE_OFFSET = '+03:00';

const MONTHS_GENITIVE = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
];
const MONTHS = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
];
const WEEKDAYS = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];

export const isAllDay = (value: string): boolean => value.length === 10;

/** Календарная дата записи — в том поясе, в котором она записана. */
export const dayOf = (value: string): string => value.slice(0, 10);

const offsetOf = (value: string): string => (isAllDay(value) ? SITE_OFFSET : value.slice(value.search(/(Z|[+-]\d{2}:\d{2})$/)));

export const startOf = (value: string): Date =>
  new Date(isAllDay(value) ? `${value}T00:00:00${SITE_OFFSET}` : value);

/** Конец суток, на которые приходится значение, — в его собственном поясе. */
const endOfDay = (value: string): Date => new Date(`${dayOf(value)}T23:59:59${offsetOf(value)}`);

interface Span {
  start: string;
  end?: string;
}

/**
 * Момент, после которого событие считается прошедшим. Если конец не указан
 * или указан датой, событие идёт до конца этих суток: митап «в 19:00» не
 * должен уезжать в архив в 19:01.
 */
export const endOfEvent = ({ start, end }: Span): Date => {
  if (end && !isAllDay(end)) return new Date(end);
  return endOfDay(end ?? start);
};

const parts = (value: string) => ({
  year: Number(value.slice(0, 4)),
  month: Number(value.slice(5, 7)),
  day: Number(value.slice(8, 10)),
});

/** «5 ноября 2026» */
export const formatDay = (value: string): string => {
  const { year, month, day } = parts(value);
  return `${day} ${MONTHS_GENITIVE[month - 1]} ${year}`;
};

/** «чт» */
export const weekday = (value: string): string => {
  const { year, month, day } = parts(value);
  return WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
};

/** «Ноябрь 2026» — заголовок группы в календаре. */
export const monthTitle = (value: string): string => {
  const { year, month } = parts(value);
  return `${MONTHS[month - 1]} ${year}`;
};

/** «МСК», «UTC», «UTC+7», «UTC−5», «UTC+5:30» */
const zoneLabel = (value: string): string => {
  const offset = offsetOf(value);
  if (offset === SITE_OFFSET) return 'МСК';
  if (offset === 'Z' || offset === '+00:00') return 'UTC';
  const hours = Number(offset.slice(1, 3));
  const minutes = offset.slice(4, 6);
  return `UTC${offset[0] === '-' ? '−' : '+'}${hours}${minutes === '00' ? '' : `:${minutes}`}`;
};

/** «5–6 ноября 2026», «30 ноября – 2 декабря 2026», «5 ноября 2026» */
export const formatDays = ({ start, end }: Span): string => {
  const from = dayOf(start);
  const to = dayOf(end ?? start);
  if (from === to) return formatDay(from);
  const a = parts(from);
  const b = parts(to);
  if (a.year !== b.year) return `${formatDay(from)} – ${formatDay(to)}`;
  if (a.month !== b.month) return `${a.day} ${MONTHS_GENITIVE[a.month - 1]} – ${formatDay(to)}`;
  return `${a.day}–${formatDay(to)}`;
};

/** «19:00 МСК», «19:00–22:00 МСК»; для события на весь день — пусто. */
export const formatTime = ({ start, end }: Span): string => {
  if (isAllDay(start)) return '';
  const from = start.slice(11, 16);
  const sameDay = end && !isAllDay(end) && dayOf(end) === dayOf(start);
  return `${from}${sameDay ? `–${end.slice(11, 16)}` : ''} ${zoneLabel(start)}`;
};

/** Сегодняшняя дата в поясе сайта — для сравнения с календарными датами записей. */
export const today = (now: Date = new Date()): string => {
  const [sign, hours, minutes] = [SITE_OFFSET[0], Number(SITE_OFFSET.slice(1, 3)), Number(SITE_OFFSET.slice(4, 6))];
  const shift = (hours * 60 + minutes) * 60_000 * (sign === '-' ? -1 : 1);
  return new Date(now.getTime() + shift).toISOString().slice(0, 10);
};

const MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

/** «ноя» — для блока даты в календаре. */
export const monthShort = (value: string): string => MONTHS_SHORT[parts(value).month - 1];

/** Число месяца без ведущего нуля. */
export const dayNumber = (value: string): number => parts(value).day;
