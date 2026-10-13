// Негативные тесты правил бренда: сломанная разметка должна ронять проверку
// с сообщением, по которому понятно, где и что не так.
//
//   bun test tools/

import { expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { buttonsWithoutIcon, checkBrand, checkDist, checkSource, foreignColors, kitErrors } from './check-brand.mjs';

const icon = '<svg class="icon" width="16" height="16" viewBox="0 0 24 24"><path d="M5 12h14"/></svg>';

test('кнопка с иконкой проходит, в любой форме записи классов', () => {
  expect(buttonsWithoutIcon(`<a class="button" href="/talks/">${icon} Доклады</a>`)).toEqual([]);
  expect(buttonsWithoutIcon(`<a href="/x/" class="button button--ghost button--small" target="_blank">${icon}Добавить</a>`)).toEqual([]);
  expect(buttonsWithoutIcon(`<button class="button" type="submit"><svg class="icon big" viewBox="0 0 24 24"></svg>Ок</button>`)).toEqual([]);
});

test('кнопка без иконки названа по подписи', () => {
  expect(buttonsWithoutIcon('<a class="button button--ghost" href="/events/">\n  Календарь\n</a>')).toEqual(['Календарь']);
});

test('чужой svg иконкой не считается', () => {
  expect(buttonsWithoutIcon('<a class="button" href="/"><svg class="logo__mark"></svg> На главную</a>')).toEqual(['На главную']);
});

test('иконка соседней кнопки не засчитывается этой', () => {
  const html = `<a class="button" href="/a/">Первая</a><a class="button" href="/b/">${icon}Вторая</a>`;
  expect(buttonsWithoutIcon(html)).toEqual(['Первая']);
});

test('кнопки из одной иконки, строка поиска и обычные ссылки не проверяются', () => {
  const html = `<a class="icon-button menu-button" href="#sections">${icon}</a><button class="search-trigger">Поиск</button><a href="/talks/">Все доклады</a><a class="tag" href="/x/">Тема</a>`;
  expect(buttonsWithoutIcon(html)).toEqual([]);
});

test('по дереву: ошибка называет страницу и кнопку', () => {
  const root = mkdtempSync(join(tmpdir(), 'check-brand-'));
  mkdirSync(join(root, 'dist/talks'), { recursive: true });
  writeFileSync(join(root, 'dist/index.html'), `<a class="button" href="/talks/">${icon}Доклады</a>`);
  writeFileSync(join(root, 'dist/talks/index.html'), '<a class="button" href="/contribute/">Добавить доклад</a>');

  const { errors, checked } = checkBrand(root);
  expect(checked).toBe(2);
  expect(errors).toEqual([expect.stringContaining('dist/talks/index.html')]);
  expect(errors[0]).toContain('Добавить доклад');
});

test('сборки нет — об этом и сказано', () => {
  expect(checkBrand(mkdtempSync(join(tmpdir(), 'check-brand-'))).errors).toEqual([expect.stringContaining('make build')]);
});

// ── Исходники ───────────────────────────────────────────────────────────────

/** Дерево из файлов: { 'src/a.css': '…' } → временный каталог. */
function tree(files) {
  const root = mkdtempSync(join(tmpdir(), 'check-brand-'));
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(join(root, path, '..'), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  return root;
}

const TOKENS = ':root {\n  --bg: light-dark(#eff1f5, #24273a);\n  --fg: light-dark(#4c4f69, #cad3f5);\n  --accent: light-dark(#0b7285, #7dc4e4);\n  --accent-400: #209fb5;\n  --fs-sm: 0.875rem;\n}\n';

test('чистые исходники проходят: токены, наследование, якоря и комментарии не мешают', () => {
  const root = tree({
    'src/styles/tokens.css': TOKENS,
    'src/styles/fonts.css': '@font-face { font-family: X; font-weight: 400; }',
    'src/styles/global.css': '.a { color: var(--fg); font-size: var(--fs-sm); }\npre code { font-size: inherit; }\n#add { color: var(--accent); }\n',
    'src/pages/index.astro': '---\n// доклады → сообщества: порядок разделов\n---\n<a class="back" href="https://sre.moscow/contribute/#add">Назад</a>\n<style>\n  a:hover #fed { color: var(--fg); }\n</style>\n',
    'src/components/Icon.astro': '<svg class="icon"><slot /></svg>',
    'src/brand/sign.ts': 'export const sign = () => `<svg><circle r="1"/></svg>`;',
  });
  expect(checkSource(root)).toEqual({ errors: [], checked: 6 });
});

test.each([
  ['src/styles/global.css', '.a {\n  color: #ff0000;\n}', 'src/styles/global.css:2', 'цвет #ff0000'],
  ['src/styles/global.css', '.a { background: #fff; }', 'src/styles/global.css:1', 'цвет #fff'],
  ['src/components/Card.astro', '<p style="color: rgb(0 0 0)">x</p>', 'src/components/Card.astro:1', 'цвет rgb()'],
  ['src/lib/chart.ts', "export const line = '#209fb5';", 'src/lib/chart.ts:1', 'цвет #209fb5'],
  ['src/styles/global.css', '.a { border-color: var(--accent-400); }', 'src/styles/global.css:1', '--accent-400'],
  ['src/styles/global.css', '.a {\n  font-size: 14px;\n}', 'src/styles/global.css:2', 'font-size: 14px'],
  ['src/pages/x.astro', '<style>\n  h1 { letter-spacing: -0.02em; font-weight: 600 }\n</style>', 'src/pages/x.astro:2', 'letter-spacing: -0.02em'],
  ['src/pages/x.astro', '<p>текст</p>\n<svg viewBox="0 0 24 24"><path d="M0 0"/></svg>', 'src/pages/x.astro:2', 'svg нарисован в разметке'],
  ['src/pages/x.astro', '<a href="/people/">← Все люди</a>', 'src/pages/x.astro:1', 'стрелка «←»'],
])('%s: «%s» валит проверку', (path, content, where, what) => {
  const { errors } = checkSource(tree({ 'src/styles/tokens.css': TOKENS, [path]: content }));
  expect(errors.length).toBeGreaterThan(0);
  expect(errors[0]).toContain(where);
  expect(errors[0]).toContain(what);
});

// ── Комплект иконок ─────────────────────────────────────────────────────────

/** Заголовок PNG нужного размера: проверке хватает подписи и IHDR. */
function png(width, height = width) {
  const data = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(data);
  data.writeUInt32BE(13, 8);
  data.write('IHDR', 12, 'latin1');
  data.writeUInt32BE(width, 16);
  data.writeUInt32BE(height, 20);
  return data;
}

const ico = () => {
  const data = Buffer.alloc(6);
  data.writeUInt16LE(1, 2);
  data.writeUInt16LE(1, 4);
  return data;
};

const ICONS = [
  { file: 'apple-touch-icon.png', size: 180 },
  { file: 'icon-192.png', size: 192 },
];

const LINKS =
  '<link rel="icon" href="/favicon.ico" sizes="32x32"><link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="apple-touch-icon" href="/apple-touch-icon.png"><link rel="manifest" href="/manifest.webmanifest">';

const kit = (overrides = {}) => ({
  'src/styles/tokens.css': TOKENS,
  'dist/index.html': `<head>${LINKS}</head>`,
  'dist/favicon.ico': ico(),
  'dist/favicon.svg': '<svg><circle stroke="#4c4f69" fill="#0b7285"/></svg>',
  'dist/apple-touch-icon.png': png(180),
  'dist/icon-192.png': png(192),
  'dist/manifest.webmanifest': JSON.stringify({ icons: [{ src: '/icon-192.png' }] }),
  ...overrides,
});

test('целый комплект проходит', () => {
  expect(checkDist(tree(kit()), { icons: ICONS })).toEqual({ errors: [], checked: 1 });
});

test('без списка иконок комплект не проверяется', () => {
  expect(checkDist(tree({ 'dist/index.html': '<p>пусто</p>' })).errors).toEqual([]);
});

test.each([
  ['нет файла', { 'dist/favicon.ico': undefined }, 'dist/favicon.ico: файла нет'],
  ['PNG не того размера', { 'dist/icon-192.png': png(96) }, 'dist/icon-192.png: сторона 96 px, по списку иконок — 192 px'],
  ['PNG не квадратный', { 'dist/apple-touch-icon.png': png(180, 120) }, 'dist/apple-touch-icon.png: 180 × 120, а нужен квадрат'],
  ['вместо PNG текст', { 'dist/icon-192.png': 'не картинка, а строка подлиннее' }, 'dist/icon-192.png: это не PNG'],
  ['битый ico', { 'dist/favicon.ico': 'текст' }, 'dist/favicon.ico: это не файл иконки'],
  ['манифест ссылается в пустоту', { 'dist/manifest.webmanifest': JSON.stringify({ icons: [{ src: '/icon-512.png' }] }) }, 'иконки /icon-512.png в сборке нет'],
  ['манифест не JSON', { 'dist/manifest.webmanifest': '{' }, 'не разбирается как JSON'],
  ['страница без ссылок на комплект', { 'dist/index.html': '<head></head>' }, 'dist/index.html: страница не подключает /favicon.ico'],
  ['чужой цвет в SVG', { 'dist/favicon.svg': '<svg><circle fill="#209FB5"/></svg>' }, 'dist/favicon.svg: цвета #209fb5 нет в tokens.css'],
])('комплект: %s', (_, overrides, message) => {
  const files = Object.fromEntries(Object.entries(kit(overrides)).filter(([, content]) => content !== undefined));
  const { errors } = checkDist(tree(files), { icons: ICONS });
  expect(errors).toContainEqual(expect.stringContaining(message));
});

test('цвета SVG сверяются с обеими темами', () => {
  const themes = { light: { fg: '#4c4f69' }, dark: { fg: '#cad3f5' } };
  expect(foreignColors('<svg><path stroke="#4C4F69"/><path stroke="#cad3f5"/><path stroke="#123456"/><path fill="#123456"/></svg>', themes)).toEqual(['#123456']);
  expect(kitErrors(mkdtempSync(join(tmpdir(), 'check-brand-')), []).length).toBe(4);
});
