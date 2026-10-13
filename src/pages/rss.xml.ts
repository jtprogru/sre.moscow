import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';

import { eventHref, getEvents, place } from '../lib/catalog';
import { formatDays } from '../lib/dates';
import { countryName } from '../lib/labels';
import { SITE } from '../lib/site';

// Лента того, что появилось в каталоге: новые события и доклады, по дате
// добавления записи (поле added), а не по дате самого события.

const LIMIT = 50;

const escape = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

interface Item {
  guid: string;
  title: string;
  link: string;
  description: string;
  added: string;
}

export const GET: APIRoute = async () => {
  const { all } = await getEvents();
  const talks = await getCollection('talks');

  const items: Item[] = [
    ...all.map((event) => ({
      guid: `events:${event.id}`,
      title: `Событие: ${event.data.title}`,
      link: new URL(eventHref(event), SITE.url).toString(),
      description: `${formatDays(event.data)}, ${place(event.data, countryName)}. ${event.data.organizer.name}. ${event.data.url}`,
      added: event.data.added,
    })),
    ...talks.map((talk) => ({
      guid: `talks:${talk.id}`,
      title: `Доклад: ${talk.data.title}`,
      link: new URL(`/talks/#${talk.id}`, SITE.url).toString(),
      description: `${talk.data.speakers.map((speaker) => speaker.name).join(', ')}, ${talk.data.event.name}. ${talk.data.why} ${talk.data.video}`,
      added: talk.data.added,
    })),
  ]
    .sort((a, b) => b.added.localeCompare(a.added) || a.guid.localeCompare(b.guid))
    .slice(0, LIMIT);

  // Запись датирована днём без времени — ставим полдень по Москве, чтобы
  // дата не съезжала на соседний день ни в одном поясе читателя.
  const pubDate = (day: string): string => new Date(`${day}T12:00:00+03:00`).toUTCString();

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escape(`${SITE.name} — новые события и доклады`)}</title>
    <link>${SITE.url}/</link>
    <description>${escape(SITE.description)}</description>
    <language>ru</language>
    <atom:link href="${SITE.url}/rss.xml" rel="self" type="application/rss+xml"/>
${items
  .map(
    (item) => `    <item>
      <title>${escape(item.title)}</title>
      <link>${escape(item.link)}</link>
      <guid isPermaLink="false">${escape(`${new URL(SITE.url).host}:${item.guid}`)}</guid>
      <pubDate>${pubDate(item.added)}</pubDate>
      <description>${escape(item.description)}</description>
    </item>`,
  )
  .join('\n')}
  </channel>
</rss>
`;

  return new Response(xml, { headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' } });
};
