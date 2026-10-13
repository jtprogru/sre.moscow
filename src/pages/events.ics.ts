import type { APIRoute } from 'astro';

import { getEvents, place } from '../lib/catalog';
import { dayOf, isAllDay } from '../lib/dates';
import { countryName, FORMAT, PRICE } from '../lib/labels';
import { SITE } from '../lib/site';

// Подписка на календарь: Google, Apple и Outlook читают этот файл по адресу
// и перечитывают сами.
//
// Время отдаётся в UTC, события на весь день — как VALUE=DATE. Так файлу не
// нужен блок VTIMEZONE: календарь читателя сам переводит UTC в его пояс.

const encoder = new TextEncoder();

/** RFC 5545 §3.3.11: обратная косая, запятая, точка с запятой и перевод строки экранируются. */
const escape = (text: string): string =>
  text.replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/([,;])/g, '\\$1');

/**
 * RFC 5545 §3.1: строка не длиннее 75 октетов, продолжение начинается с пробела.
 * Счёт идёт в байтах, а резать можно только между символами: кириллица в UTF-8
 * занимает два байта, и разрез посередине ломает текст.
 */
function fold(line: string): string {
  const chunks: string[] = [];
  let chunk = '';
  let size = 0;
  for (const char of line) {
    const bytes = encoder.encode(char).length;
    if (size + bytes > 75) {
      chunks.push(chunk);
      chunk = ' ';
      size = 1;
    }
    chunk += char;
    size += bytes;
  }
  chunks.push(chunk);
  return chunks.join('\r\n');
}

const utc = (date: Date): string => date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
const compact = (day: string): string => day.replaceAll('-', '');
const nextDay = (day: string): string =>
  new Date(Date.parse(`${day}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

export const GET: APIRoute = async () => {
  const { all } = await getEvents();
  const stamp = utc(new Date());
  const host = new URL(SITE.url).host;

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:-//${host}//events//RU`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escape(`${SITE.name} — события SRE`)}`,
    `X-WR-CALDESC:${escape('Конференции и митапы про надёжность, эксплуатацию и observability')}`,
    'REFRESH-INTERVAL;VALUE=DURATION:PT12H',
    'X-PUBLISHED-TTL:PT12H',
  ];

  for (const { id, data } of all) {
    // DTSTART и DTEND обязаны быть одного типа. Если хоть одна граница задана
    // датой, событие целиком становится событием на весь день.
    const allDay = isAllDay(data.start) || (data.end !== undefined && isAllDay(data.end));

    lines.push('BEGIN:VEVENT', `UID:${id}@${host}`, `DTSTAMP:${stamp}`);
    if (allDay) {
      // DTEND у события на весь день не включается в интервал — отсюда +1 день.
      lines.push(
        `DTSTART;VALUE=DATE:${compact(dayOf(data.start))}`,
        `DTEND;VALUE=DATE:${compact(nextDay(dayOf(data.end ?? data.start)))}`,
      );
    } else {
      lines.push(`DTSTART:${utc(new Date(data.start))}`);
      if (data.end) lines.push(`DTEND:${utc(new Date(data.end))}`);
    }
    lines.push(
      `SUMMARY:${escape(data.title)}`,
      `LOCATION:${escape(place(data, countryName))}`,
      `DESCRIPTION:${escape(`${data.organizer.name} · ${FORMAT[data.format]} · ${PRICE[data.price]}\n${data.url}`)}`,
      `URL:${data.url}`,
      'END:VEVENT',
    );
  }

  lines.push('END:VCALENDAR');

  return new Response(`${lines.map(fold).join('\r\n')}\r\n`, {
    headers: { 'Content-Type': 'text/calendar; charset=utf-8' },
  });
};
