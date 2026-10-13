import { getCollection, type CollectionEntry } from 'astro:content';

import { endOfEvent, startOf } from './dates';

export type EventEntry = CollectionEntry<'events'>;

const collator = new Intl.Collator('ru');

/** Сортировка по тексту с учётом русского алфавита. */
export const byText =
  <T>(pick: (item: T) => string) =>
  (a: T, b: T): number =>
    collator.compare(pick(a), pick(b));

/** События по возрастанию даты, разложенные на предстоящие и прошедшие. */
export async function getEvents(now: Date = new Date()) {
  const all = (await getCollection('events')).sort(
    (a, b) => startOf(a.data.start).getTime() - startOf(b.data.start).getTime(),
  );
  return {
    all,
    upcoming: all.filter((event) => endOfEvent(event.data) >= now),
    past: all.filter((event) => endOfEvent(event.data) < now).reverse(),
  };
}

/** У события нет своей страницы: ссылка ведёт на его строку в календаре или архиве. */
export const eventHref = (event: EventEntry, now: Date = new Date()): string =>
  `${endOfEvent(event.data) < now ? '/events/archive/' : '/events/'}#${event.id}`;

export interface Option {
  value: string;
  label: string;
}

/** Варианты фильтра: уникальные значения, отсортированные по подписи. */
export const options = (values: Iterable<string>, label: (value: string) => string = (value) => value): Option[] =>
  [...new Set(values)].map((value) => ({ value, label: label(value) })).sort(byText((option) => option.label));

/** Несколько значений в одном data-атрибуте. Пробел не годится: он бывает в названии города. */
export const tokens = (values: Iterable<string | undefined>): string =>
  [...values].filter((value): value is string => Boolean(value)).join('|');

/** «Москва», «Берлин, Германия», «Москва и онлайн», «онлайн» */
export const place = ({ format, city, country }: EventEntry['data'], countryName: (code: string) => string): string => {
  if (format === 'online' || !city) return 'онлайн';
  const where = country && country !== 'RU' ? `${city}, ${countryName(country)}` : city;
  return format === 'hybrid' ? `${where} и онлайн` : where;
};
