// Тесты сопоставления в поиске: что находится, что нет и в каком порядке.
//
//   bun test tools/

import { expect, test } from 'bun:test';

import { prepare, search, words } from '../src/lib/search.ts';

const record = (type, title, sub = '', extra = '') => ({ type, title, sub, url: `/${type}/#${title}`, words: extra });

const index = prepare([
  record('events', 'Kuber Conf от AOT', '22 октября 2026 · Москва', 'AOT Kubernetes Инциденты и on-call'),
  record('events', 'SREcon26 Europe', '13–15 октября 2026 · Дублин, Ирландия', 'USENIX SLI, SLO и error budget'),
  record('talks', 'Error Budget: зачем продукту бюджет ошибок?', 'Михаил Савин, Егор Щапов · В SREду на кухне #7, 2026', 'для начинающих SLI, SLO и error budget'),
  record('talks', 'Надёжный деплой', 'Пётр Ёлкин · Meetup, 2025', 'Релизы и деплой'),
  record('people', 'Михаил Савин', 'можно спросить', 'Observability'),
]);

const titles = (query, scope) => search(index, query, scope).map((item) => item.title);

test('слова: нижний регистр, «ё» как «е», знаки — разделители', () => {
  expect(words('Надёжность: SLI/SLO и on-call!')).toEqual(['надежность', 'sli', 'slo', 'и', 'on', 'call']);
});

test('находит по началу слова в заголовке', () => {
  expect(titles('kub')).toEqual(['Kuber Conf от AOT']);
});

test('«ё» и «е» в запросе и в записи взаимозаменяемы', () => {
  expect(titles('надежный')).toEqual(['Надёжный деплой']);
  expect(titles('ёлкин')).toEqual(['Надёжный деплой']);
  expect(titles('елкин')).toEqual(['Надёжный деплой']);
});

test('находит по спикеру, городу и теме', () => {
  expect(titles('щапов')).toEqual(['Error Budget: зачем продукту бюджет ошибок?']);
  expect(titles('дублин')).toEqual(['SREcon26 Europe']);
  expect(titles('релизы')).toEqual(['Надёжный деплой']);
});

test('середина слова не считается совпадением', () => {
  expect(titles('uber')).toEqual([]);
});

test('все слова запроса должны найтись в одной записи', () => {
  expect(titles('error савин')).toEqual(['Error Budget: зачем продукту бюджет ошибок?']);
  expect(titles('error дублин')).toEqual(['SREcon26 Europe']);
  expect(titles('kuber дублин')).toEqual([]);
});

test('совпадение в заголовке выше совпадения в остальных полях', () => {
  expect(titles('савин')).toEqual(['Михаил Савин', 'Error Budget: зачем продукту бюджет ошибок?']);
  expect(titles('error')).toEqual(['Error Budget: зачем продукту бюджет ошибок?', 'SREcon26 Europe']);
});

test('при равном весе порядок как в индексе', () => {
  expect(titles('октября')).toEqual(['Kuber Conf от AOT', 'SREcon26 Europe']);
});

test('область ограничивает поиск одним разделом', () => {
  expect(titles('савин', 'talks')).toEqual(['Error Budget: зачем продукту бюджет ошибок?']);
  expect(titles('савин', 'events')).toEqual([]);
});

test('пустой запрос и запрос из одних знаков ничего не находят', () => {
  expect(titles('')).toEqual([]);
  expect(titles(' — ')).toEqual([]);
});
