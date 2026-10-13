// Негативные тесты проверки слов: каждое правило должно ронять проверку
// с сообщением, по которому понятно, какой файл и что в нём не так.
//
//   bun test tools/

import { expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { NAV, SITE } from '../src/lib/site.ts';
import { checkDist, checkSource } from './check-copy.mjs';

const canon = { SITE, NAV };
const independence = [SITE.independence.short, ...SITE.independence.details].join('\n');

const readme = `# ${SITE.name}\n\n${SITE.name} — ${SITE.descriptor}.\n\n${independence}\n`;
const pkg = JSON.stringify({ description: `${SITE.name} — ${SITE.descriptor}` });

const page = ({ title, h1 = '', footer = SITE.independence.short }) =>
  `<!doctype html><html><head><title>${title}</title></head><body><h1>${h1}</h1><footer><p>${footer}</p></footer></body></html>`;

const section = NAV[0];

/** Дерево, в котором всё в порядке; files дописывает или заменяет файлы. */
function tree(files = {}) {
  const root = mkdtempSync(join(tmpdir(), 'check-copy-'));
  const all = {
    'README.md': readme,
    'package.json': pkg,
    'dist/index.html': page({ title: `${SITE.name} — ${SITE.descriptor}` }),
    [`dist${section.href}index.html`]: page({ title: `${section.label} — ${SITE.name}`, h1: section.label }),
    'dist/404.html': page({ title: `Страницы нет — ${SITE.name}` }),
    ...files,
  };
  for (const [file, content] of Object.entries(all)) {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), content);
  }
  return root;
}

test('чистое дерево проходит обе части', () => {
  const root = tree();
  expect(checkSource(root, canon).errors).toEqual([]);
  expect(checkDist(root, canon).errors).toEqual([]);
});

test('запрещённое слово ловится в любой форме, с файлом и строкой', () => {
  const root = tree({ 'src/pages/index.astro': '<p>Первая строка</p>\n<p>На нашей ВИТРИНЕ всё есть</p>\n' });
  const { errors } = checkSource(root, canon);
  expect(errors).toHaveLength(1);
  expect(errors[0]).toContain('src/pages/index.astro:2');
  expect(errors[0]).toContain('каталог');
});

test('README без дескриптора и без заявления о независимости', () => {
  const { errors } = checkSource(tree({ 'README.md': `# ${SITE.name}\n\nПросто сайт.\n` }), canon);
  expect(errors.some((line) => line.startsWith('README.md') && line.includes(SITE.descriptor))).toBe(true);
  expect(errors.some((line) => line.startsWith('README.md') && line.includes(SITE.independence.short))).toBe(true);
});

test('в README пропало одно уточнение из полной формы', () => {
  const [dropped] = SITE.independence.details;
  const { errors } = checkSource(tree({ 'README.md': readme.replace(dropped, '') }), canon);
  expect(errors).toEqual([expect.stringContaining(dropped)]);
});

test('описание в package.json разошлось с дескриптором', () => {
  const { errors } = checkSource(tree({ 'package.json': JSON.stringify({ description: 'сайт про SRE' }) }), canon);
  expect(errors).toEqual([expect.stringContaining('package.json')]);
});

test('канон, набранный в src/ второй раз, ловится без учёта регистра', () => {
  const root = tree({
    'src/lib/site.ts': `export const slogan = '${SITE.slogan}';\n`,
    'src/pages/about.astro': `<h1>${SITE.slogan.toUpperCase()}</h1>\n`,
  });
  const { errors } = checkSource(root, canon);
  expect(errors).toHaveLength(1);
  expect(errors[0]).toContain('src/pages/about.astro');
});

test('шаблон картинки сверяется со слоганом, пока он есть', () => {
  const { errors } = checkSource(tree({ 'tools/og.html': '<h1>Другой слоган</h1>' }), canon);
  expect(errors.some((line) => line.startsWith('tools/og.html') && line.includes(SITE.slogan))).toBe(true);
});

test('<title> главной не по формуле', () => {
  const { errors } = checkDist(tree({ 'dist/index.html': page({ title: `${SITE.name} — что-то про SRE` }) }), canon);
  expect(errors).toEqual([expect.stringContaining(`${SITE.name} — ${SITE.descriptor}`)]);
});

test('<title> обычной страницы без названия сайта в хвосте', () => {
  const { errors } = checkDist(tree({ 'dist/404.html': page({ title: 'Страницы нет' }) }), canon);
  expect(errors).toEqual([expect.stringContaining('dist/404.html')]);
});

test('заголовок раздела разошёлся со словарём', () => {
  const file = `dist${section.href}index.html`;
  const { errors } = checkDist(tree({ [file]: page({ title: `${section.label} — ${SITE.name}`, h1: 'Календарь' }) }), canon);
  expect(errors).toEqual([expect.stringContaining(section.label)]);
  expect(errors[0]).toContain(file);
});

test('подвал без заявления о независимости', () => {
  const { errors } = checkDist(tree({ 'dist/404.html': page({ title: `Страницы нет — ${SITE.name}`, footer: 'Каталог ведёт сообщество.' }) }), canon);
  expect(errors).toEqual([expect.stringContaining('в подвале нет')]);
});

test('сборки нет — об этом и сказано', () => {
  const root = mkdtempSync(join(tmpdir(), 'check-copy-'));
  expect(checkDist(root, canon).errors).toEqual([expect.stringContaining('make build')]);
});
