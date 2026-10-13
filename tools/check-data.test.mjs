// Негативные тесты проверок данных: каждое правило должно ронять проверку
// с сообщением, по которому понятно, какой файл и что в нём не так.
//
//   bun test tools/

import { expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { checkData } from './check-data.mjs';

const TODAY = '2026-10-09';

const organizer = `name: Org
links:
  - kind: events
    url: https://example.org/events
added: 2026-10-01
verified: 2026-10-01
`;

const event = `title: Meetup
start: "2026-11-05T19:00:00+03:00"
format: offline
city: Москва
url: https://example.org/meetup
organizer:
  name: Org
  ref: org
`;

const pastEvent = event.replace('2026-11-05', '2026-09-05');

const recap = `recaps:
  - title: Recap
    url: https://example.org/blog/recap
    author:
      name: Имя
`;

/** Собирает временный каталог с data/ из карты «путь → содержимое» и проверяет его. */
function check(files) {
  const root = mkdtempSync(join(tmpdir(), 'check-data-'));
  for (const [path, content] of Object.entries(files)) {
    const file = join(root, 'data', path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, content);
  }
  return checkData(root, TODAY);
}

test('корректные данные проходят', () => {
  const result = check({ 'organizers/org.yaml': organizer, 'events/2026-11-meetup.yaml': event });
  expect(result.errors).toEqual([]);
  expect(result.warnings).toEqual([]);
});

test('событие кончается раньше, чем началось', () => {
  const { errors } = check({
    'organizers/org.yaml': organizer,
    'events/2026-11-meetup.yaml': `${event}end: 2026-11-04\n`,
  });
  expect(errors).toEqual([expect.stringContaining('end 2026-11-04 раньше start')]);
});

test('приём заявок закрывается после начала события', () => {
  const { errors } = check({
    'organizers/org.yaml': organizer,
    'events/2026-11-meetup.yaml': `${event}cfp:\n  url: https://example.org/cfp\n  deadline: 2026-11-20\n`,
  });
  expect(errors).toEqual([expect.stringContaining('cfp.deadline 2026-11-20 позже начала события')]);
});

test('событие ссылается на несуществующего организатора', () => {
  const { errors } = check({ 'events/2026-11-meetup.yaml': event });
  expect(errors).toEqual([expect.stringContaining('файла data/organizers/org.yaml нет')]);
});

test('очное событие без города', () => {
  const { errors } = check({
    'organizers/org.yaml': organizer,
    'events/2026-11-meetup.yaml': event.replace('city: Москва\n', ''),
  });
  expect(errors).toEqual([expect.stringContaining('нужен city')]);
});

test('месяц в имени файла расходится с датой события', () => {
  const { errors } = check({ 'organizers/org.yaml': organizer, 'events/2026-12-meetup.yaml': event });
  expect(errors).toEqual([expect.stringContaining('не совпадает со start')]);
});

test('дубль адреса внутри коллекции, включая косметические отличия', () => {
  const { errors } = check({
    'organizers/org.yaml': organizer,
    'events/2026-11-meetup.yaml': event,
    'events/2026-11-meetup-copy.yaml': event.replace('https://example.org/meetup', 'https://www.example.org/meetup/'),
  });
  expect(errors).toEqual([expect.stringContaining('уже есть в data/events/2026-11-meetup-copy.yaml')]);
});

test('разбор прошедшего события проходит и без профиля автора', () => {
  const { errors } = check({ 'organizers/org.yaml': organizer, 'events/2026-09-meetup.yaml': `${pastEvent}${recap}` });
  expect(errors).toEqual([]);
});

test('разбор у события, которое ещё не началось', () => {
  const { errors } = check({ 'organizers/org.yaml': organizer, 'events/2026-11-meetup.yaml': `${event}${recap}` });
  expect(errors).toEqual([expect.stringContaining('recaps у события, которое начнётся только')]);
});

test('автор разбора ссылается на несуществующий профиль', () => {
  const { errors } = check({
    'organizers/org.yaml': organizer,
    'events/2026-09-meetup.yaml': `${pastEvent}${recap}      person: nobody\n`,
  });
  expect(errors).toEqual([expect.stringContaining('recaps[0].author.person указывает на «nobody»')]);
});

test('один разбор приложен к двум событиям', () => {
  const { errors } = check({
    'organizers/org.yaml': organizer,
    'events/2026-09-meetup.yaml': `${pastEvent}${recap}`,
    'events/2026-09-meetup-two.yaml': `${pastEvent.replace('/meetup', '/meetup-two')}${recap}`,
  });
  expect(errors).toEqual([
    expect.stringContaining('разбор https://example.org/blog/recap уже есть в data/events/2026-09-meetup-two.yaml'),
  ]);
});

test('организатор без ссылки вида events', () => {
  const { errors } = check({ 'organizers/org.yaml': organizer.replace('kind: events', 'kind: recordings') });
  expect(errors).toEqual([expect.stringContaining('kind: events')]);
});

test('профиль без согласия и согласие из будущего', () => {
  const { errors } = check({
    'people/no-consent.yaml': 'name: Имя\n',
    'people/future.yaml': 'name: Имя\nconsent:\n  by: self\n  date: 2027-01-01\n',
  });
  expect(errors).toEqual([
    expect.stringContaining('data/people/future.yaml: consent.date 2027-01-01'),
    expect.stringContaining('data/people/no-consent.yaml: нет consent'),
  ]);
});

test('доклад ссылается на несуществующие профиль и событие', () => {
  const { errors } = check({
    'talks/2025-talk.yaml': `title: Talk
speakers:
  - name: Имя
    person: nobody
event:
  name: Conf
  ref: 2025-05-conf
date: 2025-05-20
video: https://example.org/video
`,
  });
  expect(errors).toEqual([
    expect.stringContaining('speakers[0].person указывает на «nobody»'),
    expect.stringContaining('event.ref указывает на «2025-05-conf»'),
  ]);
});

test('запись не сверяли дольше полугода — предупреждение, не ошибка', () => {
  const { errors, warnings } = check({
    'organizers/org.yaml': organizer.replace(/2026-10-01/g, '2026-01-01'),
  });
  expect(errors).toEqual([]);
  expect(warnings).toEqual([expect.stringContaining('не сверяли')]);
});

test('битый YAML называет файл', () => {
  const { errors } = check({ 'communities/broken.yaml': 'title: [незакрытый список\n' });
  expect(errors).toEqual([expect.stringContaining('data/communities/broken.yaml: YAML не разбирается')]);
});
