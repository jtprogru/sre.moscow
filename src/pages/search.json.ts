import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';

import { byText, eventHref, getEvents, place } from '../lib/catalog';
import { formatDays } from '../lib/dates';
import { COMMUNITY_KIND, countryName, FORMAT, LEVEL, OPEN_TO, ORGANIZER_KIND, PLATFORM } from '../lib/labels';
import type { SearchRecord } from '../lib/search';
import { topicTitle } from '../lib/topics';

// Индекс поиска: по записи на каждое событие, организатора, сообщество, доклад
// и профиль. Окно поиска загружает его при первом открытии.
//
// Порядок записей — это порядок результатов при равном совпадении: разделы идут
// как в словаре, внутри раздела свежие доклады раньше старых, ближайшие события
// раньше прошедших, остальное по алфавиту.
// Описания и поле why в индекс не идут: по ним находится слишком многое.

const line = (...parts: (string | undefined)[]): string => parts.filter(Boolean).join(' · ');
const bag = (...parts: (string | string[] | undefined)[]): string => parts.flat().filter(Boolean).join(' ');
const topics = (ids: string[]): string[] => ids.map(topicTitle);

export const GET: APIRoute = async () => {
  const [{ upcoming, past }, organizers, communities, talks, people] = await Promise.all([
    getEvents(),
    getCollection('organizers'),
    getCollection('communities'),
    getCollection('talks'),
    getCollection('people'),
  ]);

  const records: SearchRecord[] = [
    ...talks.sort((a, b) => b.data.date.localeCompare(a.data.date)).map(({ id, data }): SearchRecord => ({
      type: 'talks',
      title: data.title,
      sub: line(data.speakers.map((speaker) => speaker.name).join(', '), `${data.event.name}, ${data.date.slice(0, 4)}`),
      url: `/talks/#${id}`,
      words: bag(LEVEL[data.level], topics(data.topics)),
    })),
    ...communities.sort(byText((entry) => entry.data.title)).map(({ id, data }): SearchRecord => ({
      type: 'communities',
      title: data.title,
      sub: line(COMMUNITY_KIND[data.kind], PLATFORM[data.platform]),
      url: `/communities/#${id}`,
      words: bag(topics(data.topics)),
    })),
    ...people.sort(byText((entry) => entry.data.name)).map(({ id, data }): SearchRecord => ({
      type: 'people',
      title: data.name,
      sub: line(...data.open_to.map((value) => OPEN_TO[value])),
      url: `/people/${id}/`,
      words: bag(topics(data.topics)),
    })),
    ...[...upcoming, ...past].map((event): SearchRecord => {
      const { data } = event;
      return {
        type: 'events',
        title: data.title,
        sub: line(formatDays(data), place(data, countryName)),
        url: eventHref(event),
        words: bag(data.organizer.name, data.series, data.city, data.country && countryName(data.country), FORMAT[data.format], topics(data.topics)),
      };
    }),
    ...organizers.sort(byText((entry) => entry.data.name)).map(({ id, data }): SearchRecord => ({
      type: 'organizers',
      title: data.name,
      sub: line(ORGANIZER_KIND[data.kind], data.cities.join(', ')),
      url: `/organizers/${id}/`,
      words: bag(data.series.map((series) => series.name), topics(data.topics)),
    })),
  ];

  return new Response(JSON.stringify(records), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
};
