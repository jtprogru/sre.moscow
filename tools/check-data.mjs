#!/usr/bin/env node
/*
 * Проверки данных, которые схема не ловит.
 *
 * src/content.config.ts видит одну запись за раз: типы, перечисления,
 * обязательные поля. Здесь — всё, для чего нужны соседние записи или
 * сравнение полей между собой:
 *
 *   — имя файла по соглашению и совпадает с датой записи;
 *   — адрес не повторяется внутри коллекции;
 *   — событие не кончается раньше, чем началось, а приём заявок не закрывается
 *     после его начала;
 *   — разбор есть только у события, которое уже началось, и один разбор не
 *     приложен к двум событиям;
 *   — ссылки person и ref ведут на существующие записи: reference() в Astro
 *     этого не проверяет, битая ссылка для него просто строка;
 *   — у организатора есть ссылка вида events;
 *   — у профиля есть согласие, и оно не датировано будущим.
 *
 * Записи, которые не сверяли дольше полугода, попадают в отчёт и сборку
 * не роняют: это рабочий список для кураторов, а не ошибка контрибьютора.
 *
 *   node tools/check-data.mjs [--root <каталог с data/>] [--today ГГГГ-ММ-ДД]
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { parse } from 'yaml';

const COLLECTIONS = ['communities', 'talks', 'people', 'events', 'organizers'];
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const STALE_DAYS = 183;

// Календарная дата без времени живёт в часовом поясе сайта: событие «5 ноября»
// считается идущим до конца этих суток по Москве.
const SITE_OFFSET = '+03:00';
const isDateOnly = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value);
const startOf = (value) => Date.parse(isDateOnly(value) ? `${value}T00:00:00${SITE_OFFSET}` : value);
const endOf = (value) => Date.parse(isDateOnly(value) ? `${value}T23:59:59${SITE_OFFSET}` : value);

// Парсер по умолчанию оставляет даты строками — в отличие от Astro, который
// превращает дату без кавычек в Date. Для сравнения это удобнее: формат
// проверила схема, здесь нужен только порядок.
const text = (value) => (value instanceof Date ? value.toISOString() : String(value ?? ''));

/** Один и тот же адрес с косметическими отличиями — всё равно дубль. */
const normalizeUrl = (value) => {
  try {
    const url = new URL(value);
    url.hash = '';
    url.hostname = url.hostname.replace(/^www\./, '');
    return `${url.protocol}//${url.hostname}${url.pathname.replace(/\/+$/, '')}${url.search}`.toLowerCase();
  } catch {
    return String(value);
  }
};

function load(root) {
  const errors = [];
  const data = {};
  for (const name of COLLECTIONS) {
    data[name] = [];
    const dir = join(root, 'data', name);
    if (!existsSync(dir)) continue;
    for (const fileName of readdirSync(dir).sort()) {
      if (!fileName.endsWith('.yaml')) continue;
      const file = `data/${name}/${fileName}`;
      try {
        const record = parse(readFileSync(join(dir, fileName), 'utf8'));
        if (record === null || typeof record !== 'object' || Array.isArray(record)) {
          errors.push(`${file}: ожидается запись «ключ: значение», а не ${record === null ? 'пустой файл' : 'список'}`);
          continue;
        }
        data[name].push({ id: fileName.replace(/\.yaml$/, ''), file, record });
      } catch (error) {
        errors.push(`${file}: YAML не разбирается — ${error.message.split('\n')[0]}`);
      }
    }
  }
  return { data, errors };
}

export function checkData(root, today = new Date().toISOString().slice(0, 10)) {
  const { data, errors } = load(root);
  const warnings = [];
  const ids = Object.fromEntries(COLLECTIONS.map((name) => [name, new Set(data[name].map((entry) => entry.id))]));

  const unique = (name, pick, label) => {
    const seen = new Map();
    for (const { file, record } of data[name]) {
      for (const raw of [pick(record)].flat().filter(Boolean)) {
        const key = normalizeUrl(raw);
        if (seen.has(key)) errors.push(`${file}: ${label} ${raw} уже есть в ${seen.get(key)}`);
        else seen.set(key, file);
      }
    }
  };

  const exists = (file, field, target, ref) => {
    if (ref === undefined || ref === null) return;
    if (!ids[target].has(String(ref))) {
      errors.push(`${file}: ${field} указывает на «${ref}», а файла data/${target}/${ref}.yaml нет`);
    }
  };

  for (const name of COLLECTIONS) {
    for (const { id, file, record } of data[name]) {
      if (!SLUG.test(id)) errors.push(`${file}: имя файла — латиница, цифры и дефисы в нижнем регистре`);

      const added = text(record.added);
      const verified = text(record.verified);
      if (added && added > today) errors.push(`${file}: added ${added} — дата из будущего`);
      if (verified && verified > today) errors.push(`${file}: verified ${verified} — дата из будущего`);
      if (added && verified && verified < added) errors.push(`${file}: verified ${verified} раньше added ${added}`);
      if (isDateOnly(verified)) {
        const age = Math.floor((Date.parse(today) - Date.parse(verified)) / 86_400_000);
        if (age > STALE_DAYS) warnings.push(`${file}: не сверяли ${age} дн. (verified ${verified})`);
      }
    }
  }

  unique('communities', (record) => record.url, 'адрес');
  unique('events', (record) => record.url, 'адрес');
  unique('events', (record) => (record.recaps ?? []).map((recap) => recap?.url), 'разбор');
  unique('talks', (record) => record.video, 'запись');
  unique('organizers', (record) => (record.links ?? []).map((link) => link?.url), 'ссылка');

  for (const { id, file, record } of data.talks) {
    const date = text(record.date);
    if (!/^\d{4}-/.test(id)) errors.push(`${file}: имя файла начинается с года доклада: <год>-<slug>.yaml`);
    else if (date && !date.startsWith(id.slice(0, 4))) {
      errors.push(`${file}: год в имени файла (${id.slice(0, 4)}) не совпадает с date ${date}`);
    }
    if (date > today) errors.push(`${file}: date ${date} — доклад с записью не может быть в будущем`);
    for (const [index, speaker] of (record.speakers ?? []).entries()) {
      exists(file, `speakers[${index}].person`, 'people', speaker?.person);
    }
    exists(file, 'event.ref', 'events', record.event?.ref);
  }

  for (const { id, file, record } of data.events) {
    const start = text(record.start);
    const end = record.end === undefined ? '' : text(record.end);
    if (!/^\d{4}-\d{2}-/.test(id)) errors.push(`${file}: имя файла начинается с года и месяца: <гггг-мм>-<slug>.yaml`);
    else if (start && !start.startsWith(id.slice(0, 7))) {
      errors.push(`${file}: месяц в имени файла (${id.slice(0, 7)}) не совпадает со start ${start}`);
    }
    if (end && endOf(end) < startOf(start)) errors.push(`${file}: end ${end} раньше start ${start}`);
    if (record.cfp?.deadline) {
      const deadline = text(record.cfp.deadline);
      if (startOf(deadline) > startOf(start)) {
        errors.push(`${file}: cfp.deadline ${deadline} позже начала события ${start}`);
      }
    }
    if (record.format !== 'online' && !record.city) {
      errors.push(`${file}: для формата ${record.format} нужен city`);
    }
    exists(file, 'organizer.ref', 'organizers', record.organizer?.ref);

    const recaps = record.recaps ?? [];
    if (recaps.length > 0 && startOf(start) > endOf(today)) {
      errors.push(`${file}: recaps у события, которое начнётся только ${start} — разбор пишут после события`);
    }
    for (const [index, recap] of recaps.entries()) {
      exists(file, `recaps[${index}].author.person`, 'people', recap?.author?.person);
    }
  }

  for (const { file, record } of data.organizers) {
    if (!(record.links ?? []).some((link) => link?.kind === 'events')) {
      errors.push(`${file}: нужна хотя бы одна ссылка с kind: events — страница, где видно события`);
    }
  }

  for (const { file, record } of data.people) {
    if (!record.consent?.by || !record.consent?.date) {
      errors.push(`${file}: нет consent — профиль публикуется только с согласия человека, см. CRITERIA.md`);
    } else if (text(record.consent.date) > today) {
      errors.push(`${file}: consent.date ${text(record.consent.date)} — дата из будущего`);
    }
  }

  const total = Object.fromEntries(COLLECTIONS.map((name) => [name, data[name].length]));
  return { errors, warnings, total };
}

function main() {
  const args = process.argv.slice(2);
  const option = (flag) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined);
  const root = resolve(option('--root') ?? '.');
  const { errors, warnings, total } = checkData(root, option('--today'));

  if (warnings.length) {
    console.log(`Давно не сверяли (${warnings.length}):`);
    for (const line of warnings) console.log(`  ! ${line}`);
  }
  if (errors.length) {
    console.error(`\nОшибки в данных (${errors.length}):`);
    for (const line of errors) console.error(`  ✗ ${line}`);
    process.exit(1);
  }
  const summary = Object.entries(total).map(([name, count]) => `${name} ${count}`).join(', ');
  console.log(`✓ Данные в порядке: ${summary}.`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
