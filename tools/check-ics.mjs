#!/usr/bin/env node
/*
 * Проверка собранного dist/events.ics.
 *
 * Файл разбирает сторонний парсер (ical.js), а не код, который его собрал:
 * у них разные представления о формате, и расхождение между ними — как раз
 * то, что сломает подписку в чужом календаре. Дальше сверка с данными:
 * каждому событию из data/events соответствует VEVENT, и начинается оно
 * в тот же момент.
 *
 *   node tools/check-ics.mjs   (после сборки)
 */

import { readdirSync, readFileSync } from 'node:fs';
import process from 'node:process';
import ICAL from 'ical.js';
import { parse } from 'yaml';

const HOST = 'sre.moscow';
const errors = [];

let raw;
try {
  raw = readFileSync('dist/events.ics', 'utf8');
} catch {
  console.error('✗ dist/events.ics нет — сначала make build');
  process.exit(1);
}

// RFC 5545 §3.1: строки разделяются CRLF и не длиннее 75 октетов.
if (/[^\r]\n/.test(raw)) errors.push('перевод строки без CR: нужен CRLF');
for (const [index, line] of raw.split('\r\n').entries()) {
  const size = Buffer.byteLength(line, 'utf8');
  if (size > 75) errors.push(`строка ${index + 1}: ${size} октетов, больше 75`);
}

let events = [];
try {
  const calendar = new ICAL.Component(ICAL.parse(raw));
  events = calendar.getAllSubcomponents('vevent').map((component) => new ICAL.Event(component));
} catch (error) {
  errors.push(`парсер не разобрал файл: ${error.message}`);
}

const byUid = new Map(events.map((event) => [event.uid, event]));
const files = readdirSync('data/events').filter((name) => name.endsWith('.yaml'));

for (const name of files) {
  const id = name.replace(/\.yaml$/, '');
  const data = parse(readFileSync(`data/events/${name}`, 'utf8'));
  const event = byUid.get(`${id}@${HOST}`);
  if (!event) {
    errors.push(`${id}: события нет в календаре`);
    continue;
  }
  if (event.summary !== data.title) errors.push(`${id}: SUMMARY «${event.summary}» не совпадает с title`);

  const start = String(data.start);
  const allDay = start.length === 10 || (data.end !== undefined && String(data.end).length === 10);
  if (allDay !== event.startDate.isDate) {
    errors.push(`${id}: ожидалось событие ${allDay ? 'на весь день' : 'со временем'}`);
  } else if (allDay) {
    const day = event.startDate.toString();
    if (day !== start.slice(0, 10)) errors.push(`${id}: день ${day} не совпадает со start ${start}`);
  } else {
    const got = event.startDate.toJSDate().getTime();
    if (got !== Date.parse(start)) {
      errors.push(`${id}: начало ${new Date(got).toISOString()} не совпадает со start ${start}`);
    }
  }
}

if (events.length !== files.length) {
  errors.push(`в календаре ${events.length} событий, в data/events — ${files.length}`);
}

if (errors.length) {
  console.error(`Ошибки в events.ics (${errors.length}):`);
  for (const line of errors) console.error(`  ✗ ${line}`);
  process.exit(1);
}
console.log(`✓ events.ics разбирается, событий: ${events.length}, время совпадает с данными.`);
