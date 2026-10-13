#!/usr/bin/env bun
/*
 * Проверка слов: сайт называет себя одинаково везде.
 *
 * Канон живёт в src/lib/site.ts: название, дескриптор, слоган, заявление о
 * независимости и словарь разделов. Проверка сверяет с ним всё, что набрано
 * не через него, и состоит из двух частей.
 *
 * По исходникам (--source):
 *   — запрещённых слов нет ни в одной форме: сайт называет себя каталогом;
 *   — дескриптор дословно стоит в README.md и package.json, заявление о
 *     независимости — в README.md целиком: короткая форма и все уточнения;
 *   — BRAND.md цитирует канон без расхождений: дескриптор, слоган, заявление;
 *   — слоган и короткая форма стоят в шаблоне картинки tools/og.html, пока
 *     картинка собирается из него руками;
 *   — в src/ канон набран один раз: строка из site.ts, повторённая руками
 *     в другом файле, рано или поздно разойдётся с оригиналом.
 *
 * По сборке (--dist):
 *   — <title> собран по формуле: «название — дескриптор» у главной,
 *     «заголовок — название» у раздела, название хвостом у остальных;
 *   — в подвале каждой страницы стоит короткая форма заявления;
 *   — заголовок страницы раздела совпадает со словарём разделов.
 *
 * data/ не проверяется: там чужие описания, и слова в них чужие.
 *
 *   bun tools/check-copy.mjs [--source] [--dist] [--root <каталог>]
 *
 * Без флагов идут обе части. Канон читается прямо из TypeScript, поэтому
 * запуск через bun — как у остальных проверок в Makefile.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative, resolve, sep } from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

// Где ищем запрещённые слова. tools/ сюда не входит: проверка называет слово,
// которое ищет, и нашла бы саму себя.
const SOURCES = ['src', '.github', 'README.md', 'CONTRIBUTING.md', 'CRITERIA.md', 'package.json', 'Makefile'];
const CANON = 'src/lib/site.ts';
const BINARY = new Set(['.woff2', '.woff', '.ttf', '.otf', '.png', '.jpg', '.jpeg', '.webp', '.gif', '.ico', '.pdf']);

const FORBIDDEN = [{ pattern: /витрин/iu, word: 'витрина', why: 'сайт называет себя каталогом' }];

const posix = (path) => path.split(sep).join('/');

/** Все файлы под path; path может быть и файлом. Чего нет — того нет. */
export function walk(path) {
  if (!existsSync(path)) return [];
  if (statSync(path).isFile()) return [path];
  return readdirSync(path, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap((entry) => walk(join(path, entry.name)));
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

const decode = (html) =>
  html
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&([a-z]+);/gi, (match, name) => ENTITIES[name.toLowerCase()] ?? match);

/** Текст фрагмента разметки: без тегов, с раскрытыми сущностями, пробелы схлопнуты. */
export const textOf = (html) => decode(html.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();

const quote = (value) => `«${value}»`;

export function checkSource(root, { SITE }) {
  const errors = [];
  const read = (file) => readFileSync(join(root, file), 'utf8');

  const files = SOURCES.flatMap((source) => walk(join(root, source)))
    .filter((path) => !BINARY.has(extname(path).toLowerCase()))
    .map((path) => posix(relative(root, path)));

  for (const file of files) {
    const lines = read(file).split('\n');
    for (const [index, line] of lines.entries()) {
      for (const { pattern, word, why } of FORBIDDEN) {
        if (pattern.test(line)) errors.push(`${file}:${index + 1}: слово ${quote(word)} — ${why}`);
      }
    }
  }

  // Что и где обязано стоять дословно. Файла нет — значит, и сверять нечего:
  // так шаблон картинки спокойно исчезнет, когда её начнёт собирать сборка.
  const independence = [SITE.independence.short, ...SITE.independence.details];
  const required = [
    { file: 'README.md', text: read, phrases: [SITE.descriptor, ...independence] },
    { file: 'BRAND.md', text: read, phrases: [SITE.descriptor, SITE.slogan, ...independence] },
    { file: 'package.json', text: (file) => JSON.parse(read(file)).description ?? '', phrases: [SITE.descriptor] },
    { file: 'tools/og.html', text: (file) => textOf(read(file)), phrases: [SITE.slogan, SITE.independence.short] },
  ];

  for (const { file, text, phrases } of required) {
    if (!existsSync(join(root, file))) continue;
    const content = text(file);
    for (const phrase of phrases) {
      if (!content.includes(phrase)) errors.push(`${file}: нет дословного ${quote(phrase)} — сверь с ${CANON}`);
    }
  }

  // Регистр не важен: «Каталог …» с заглавной — та же строка, набранная заново.
  // Уточнения из полной формы сюда не входят: «место в каталоге не продаётся» —
  // обычная фраза, и в тексте страницы она уместна сама по себе.
  const canon = [SITE.descriptor, SITE.slogan, SITE.independence.short].map((phrase) => phrase.toLowerCase());
  for (const file of files.filter((path) => path.startsWith('src/') && path !== CANON)) {
    const content = read(file).toLowerCase();
    for (const phrase of canon) {
      if (content.includes(phrase)) errors.push(`${file}: ${quote(phrase)} набрано руками — возьми из SITE в ${CANON}`);
    }
  }

  return { errors, checked: files.length };
}

export function checkDist(root, { SITE, NAV }) {
  const errors = [];
  const dist = join(root, 'dist');
  if (!existsSync(dist)) return { errors: ['dist/: сборки нет — сначала make build'], checked: 0 };

  const headings = new Map(NAV.map((item) => [item.href, item.heading ?? item.label]));
  const pages = walk(dist).filter((path) => path.endsWith('.html'));

  for (const path of pages) {
    const file = posix(relative(root, path));
    // dist/talks/index.html → /talks/, dist/index.html → /, dist/404.html → /404.html
    const url = `/${posix(relative(dist, path))}`.replace(/index\.html$/, '');
    const html = readFileSync(path, 'utf8');
    const first = (pattern) => {
      const match = html.match(pattern);
      return match ? textOf(match[1]) : undefined;
    };

    const title = first(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const heading = headings.get(url);
    const expected = url === '/' ? `${SITE.name} — ${SITE.descriptor}` : heading && `${heading} — ${SITE.name}`;

    if (title === undefined) {
      errors.push(`${file}: нет <title>`);
    } else if (expected && title !== expected) {
      errors.push(`${file}: <title> ${quote(title)}, а по формуле ${quote(expected)}`);
    } else if (!expected && !(title.endsWith(` — ${SITE.name}`) && title.length > ` — ${SITE.name}`.length)) {
      errors.push(`${file}: <title> ${quote(title)} — в конце должно стоять ${quote(` — ${SITE.name}`)}`);
    }

    const footer = first(/(<footer[\s\S]*<\/footer>)/i);
    if (!footer?.includes(SITE.independence.short)) {
      errors.push(`${file}: в подвале нет заявления о независимости ${quote(SITE.independence.short)}`);
    }

    if (heading) {
      const h1 = first(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
      if (h1 !== heading) errors.push(`${file}: заголовок страницы ${quote(h1 ?? '')}, а в словаре разделов ${quote(heading)}`);
    }
  }

  return { errors, checked: pages.length };
}

async function main() {
  const args = process.argv.slice(2);
  const option = (flag) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined);
  const root = resolve(option('--root') ?? '.');
  const both = !args.includes('--source') && !args.includes('--dist');

  const canon = await import(pathToFileURL(join(root, CANON)).href);
  const errors = [];
  const done = [];

  if (both || args.includes('--source')) {
    const result = checkSource(root, canon);
    errors.push(...result.errors);
    done.push(`исходники — файлов: ${result.checked}`);
  }
  if (both || args.includes('--dist')) {
    const result = checkDist(root, canon);
    errors.push(...result.errors);
    done.push(`сборка — страниц: ${result.checked}`);
  }

  if (errors.length) {
    console.error(`Слова расходятся с каноном (${errors.length}):`);
    for (const line of errors) console.error(`  ✗ ${line}`);
    console.error(`\nКанон — ${CANON}, правила — BRAND.md.`);
    process.exit(1);
  }
  console.log(`✓ Слова в порядке: ${done.join('; ')}.`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main();
