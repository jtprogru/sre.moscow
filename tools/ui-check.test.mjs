// Тесты вывода проверки вёрстки: время словами, где встретилось нарушение,
// аннотация и отчёт для GitHub Actions. Сами замеры идут в браузере, их
// проверяет make ui-check.
//
//   bun test tools/

import { expect, test } from 'bun:test';

import { annotation, duration, report, whereabouts } from './ui-check.mjs';

/** Нарушение на каждой странице в каждом прогоне. */
const everywhere = (runs, pages) => runs.flatMap((run) => pages.map((path) => ({ path, run })));

const RUNS = ['webkit-ipad-portrait-light', 'webkit-ipad-portrait-dark'];
const PAGES = ['/', '/404.html', '/communities/', '/contribute/', '/events/', '/talks/'];

test('время до минуты — в секундах с десятыми, дольше — в минутах', () => {
  expect(duration(6100)).toBe('6.1 с');
  expect(duration(59_949)).toBe('59.9 с');
  expect(duration(59_950)).toBe('1 мин 0 с');
  expect(duration(243_400)).toBe('4 мин 3 с');
});

test('места нарушения сворачиваются в прогоны и страницы без повторов', () => {
  const where = whereabouts(everywhere(RUNS, PAGES));
  expect(where.runs).toBe('webkit-ipad-portrait-light, webkit-ipad-portrait-dark');
  expect(where.pages).toBe('/, /404.html, /communities/, /contribute/ и ещё 2');
});

test('аннотация — одна строка: перевод строки и процент в ней экранированы', () => {
  const line = annotation('ошибка в консоли: 100% сбой\nвторая строка', everywhere(RUNS, ['/']));
  expect(line.startsWith('::error title=make ui-check::')).toBe(true);
  expect(line).not.toContain('\n');
  expect(line).toContain('100%25 сбой%0Aвторая строка');
  expect(line).toContain('Страницы: /');
});

test('отчёт: вердикт, нарушение без живых тегов и строка на прогон', () => {
  const violations = new Map([['цель мельче 44 px: <a> «Доклады» — 59.8 × 37.6 px | шапка', everywhere(RUNS, PAGES)]]);
  const runs = RUNS.map((name) => ({ name, ms: 12_300, violations: 1 }));
  const text = report({ pages: PAGES.length, loads: 12, elapsed: 243_400, runs, violations, skipped: [] });

  expect(text).toContain('## make ui-check: вёрстка расходится с правилами (1)');
  expect(text).toContain('Страниц 6, прогонов 2, загрузок 12, время 4 мин 3 с.');
  expect(text).toContain('&lt;a&gt; «Доклады»');
  expect(text).not.toContain('<a>');
  expect(text).toContain('37.6 px \\| шапка');
  expect(text).toContain('| webkit-ipad-portrait-dark | 12.3 с | 1 |');
});

test('отчёт без нарушений говорит, что всё в порядке, а пропущенный движок называет', () => {
  const runs = [{ name: 'chromium-laptop-light', ms: 5000, violations: 0 }];
  const clean = report({ pages: 1, loads: 1, elapsed: 5000, runs, violations: new Map(), skipped: [] });
  expect(clean).toContain('## make ui-check: вёрстка в порядке');
  expect(clean).not.toContain('### Нарушения');

  const partial = report({ pages: 1, loads: 1, elapsed: 5000, runs, violations: new Map(), skipped: ['webkit'] });
  expect(partial).toContain('## make ui-check: проверено не во всех движках');
  expect(partial).toContain('Не проверено в webkit: движок не запустился.');
});
