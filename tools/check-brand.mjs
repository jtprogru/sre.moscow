#!/usr/bin/env node
/*
 * Правила из BRAND.md, которые можно проверить без глаз.
 *
 * По исходникам в src/:
 *   — цвет записан только в tokens.css: в остальных файлах нет #rrggbb,
 *     rgb(), hsl() и их родни;
 *   — акцент один: --accent-400 и --accent-600 остаются в палитре и в вёрстку
 *     не идут;
 *   — кегль, начертание, интерлиньяж и трекинг берутся из токенов: в стилях
 *     нет font-size: 14px и подобного;
 *   — SVG рисуют компоненты и src/brand/, в разметке страниц его нет;
 *   — стрелки в ссылках — иконки, а не символы ← и →.
 *
 * По сборке в dist/:
 *   — у каждой кнопки есть иконка: внутри элемента с классом button стоит
 *     svg с классом icon. Кнопки из одной иконки и строка поиска носят свои
 *     классы и сюда не попадают: иконка в них и так есть;
 *   — комплект иконок сайта собран целиком, PNG нужного размера, манифест
 *     ссылается на существующие файлы, каждая страница комплект подключает;
 *   — в собранных SVG нет цветов мимо tokens.css.
 *
 * Кнопки и комплект видно только в dist/: кнопку собирают компоненты, иконки
 * рисует сборка.
 *
 *   bun tools/check-brand.mjs [--root <каталог>]
 */

import { existsSync, readFileSync } from 'node:fs';
import { extname, join, relative, resolve, sep } from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import { textOf, walk } from './check-copy.mjs';
import { parseTokens } from './tokens.mjs';

const TOKENS = 'src/styles/tokens.css';

const posix = (path) => path.split(sep).join('/');

/** Номер строки, на которую приходится позиция в тексте. */
const lineAt = (text, index) => text.slice(0, index).split('\n').length;

// ── Исходники ───────────────────────────────────────────────────────────────

/** Где цвет и размеры шрифта записаны по праву. */
const PALETTE_FILES = new Set([TOKENS, 'src/styles/fonts.css']);

/** Кто рисует SVG: компоненты знака, иконок и маскота. Поиск собирает иконку раздела в браузере. */
const SVG_HOMES = [
  'src/brand/',
  'src/components/Icon.astro',
  'src/components/Logo.astro',
  'src/components/Mark.astro',
  'src/components/Mascot.astro',
  'src/components/Search.astro',
];

const COLOR = /#(?:[0-9a-f]{8}|[0-9a-f]{6})\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(/gi;
// Короткая запись #fff похожа на якорь в адресе и на селектор по id, поэтому её
// ищем только в значении свойства: после двоеточия в той же строке, не в адресе
// и не перед открывающей скобкой правила.
const SHORT_COLOR = /:[^;{}\n]*?(?<=[\s:,(])(#(?:[0-9a-f]{4}|[0-9a-f]{3}))\b(?![^;\n]*\{)/gi;
const RETIRED_ACCENT = /--accent-(?:400|600)\b/g;
const TYPE = /\b(font-size|font-weight|line-height|letter-spacing)\s*:\s*([^;}"'<]+)/g;
const ARROW = /[←→↑↓↖↗↘↙]/g;
const COMMENT_LINE = /^\s*(?:\/\/|\/?\*|<!--)/;

/** Значения, которые разрешены без токена: наследование и сброс. */
const TYPE_KEYWORDS = new Set(['inherit', 'initial', 'unset', 'normal']);

export function checkSource(root) {
  const errors = [];
  const files = walk(join(root, 'src')).filter((path) => ['.css', '.astro', '.ts', '.mjs', '.js'].includes(extname(path)));

  for (const path of files) {
    const file = posix(relative(root, path));
    const text = readFileSync(path, 'utf8');
    const report = (index, message) => errors.push(`${file}:${lineAt(text, index)}: ${message}`);
    const styled = ['.css', '.astro'].includes(extname(path));

    if (!PALETTE_FILES.has(file)) {
      for (const match of text.matchAll(COLOR)) {
        report(match.index, `цвет ${match[0].replace(/\($/, '()')} записан мимо tokens.css — заведи роль там и возьми её через var()`);
      }
      if (styled) {
        for (const match of text.matchAll(SHORT_COLOR)) {
          report(match.index, `цвет ${match[1]} записан мимо tokens.css — заведи роль там и возьми её через var()`);
        }
        for (const match of text.matchAll(TYPE)) {
          const value = match[2].trim();
          if (value.startsWith('var(--') || TYPE_KEYWORDS.has(value)) continue;
          report(match.index, `${match[1]}: ${value} — размеры шрифта берутся из токенов, а роль текста задаётся в разделе «Роли текста» в global.css`);
        }
      }
      for (const match of text.matchAll(RETIRED_ACCENT)) {
        report(match.index, `${match[0]} в вёрстку не идёт: акцент на сайте один, --accent`);
      }
    }

    if (text.includes('<svg') && !SVG_HOMES.some((home) => file.startsWith(home))) {
      report(text.indexOf('<svg'), 'svg нарисован в разметке — иконку добавь в src/lib/icons.ts и поставь через <Icon />');
    }

    for (const [index, line] of text.split('\n').entries()) {
      if (COMMENT_LINE.test(line)) continue;
      const arrow = line.match(ARROW);
      if (arrow) errors.push(`${file}:${index + 1}: стрелка «${arrow[0]}» набрана текстом — поставь иконку через <Icon />`);
    }
  }
  return { errors, checked: files.length };
}

// ── Сборка ──────────────────────────────────────────────────────────────────

const OPENING = /<(a|button)\b([^>]*)>/gi;
const ICON = /<svg\b[^>]*\bclass="(?:[^"]*\s)?icon(?:\s[^"]*)?"/i;

/** Подписи кнопок, в которых нет иконки. */
export function buttonsWithoutIcon(html) {
  const missing = [];
  for (const match of html.matchAll(OPENING)) {
    const classes = /\bclass="([^"]*)"/i.exec(match[2])?.[1].split(/\s+/) ?? [];
    if (!classes.includes('button')) continue;

    const from = match.index + match[0].length;
    const to = html.indexOf(`</${match[1].toLowerCase()}>`, from);
    const inner = html.slice(from, to === -1 ? undefined : to);
    if (!ICON.test(inner)) missing.push(textOf(inner));
  }
  return missing;
}

/** Файлы комплекта помимо PNG из списка и то, чем страница их подключает. */
const KIT_LINKS = [
  { file: 'favicon.ico', link: /<link\b[^>]*\brel="icon"[^>]*\bhref="\/favicon\.ico"/i },
  { file: 'favicon.svg', link: /<link\b[^>]*\brel="icon"[^>]*\bhref="\/favicon\.svg"/i },
  { file: 'apple-touch-icon.png', link: /<link\b[^>]*\brel="apple-touch-icon"[^>]*\bhref="\/apple-touch-icon\.png"/i },
  { file: 'manifest.webmanifest', link: /<link\b[^>]*\brel="manifest"[^>]*\bhref="\/manifest\.webmanifest"/i },
];

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Сторона квадратного PNG или описание того, что с файлом не так. */
function pngSide(data) {
  if (data.length < 24 || !data.subarray(0, 8).equals(PNG_SIGNATURE)) return 'это не PNG';
  const [width, height] = [data.readUInt32BE(16), data.readUInt32BE(20)];
  return width === height ? width : `${width} × ${height}, а нужен квадрат`;
}

/**
 * Комплект иконок в dist/. icons — список PNG из src/brand/favicons.ts:
 * имя файла и сторона в пикселях.
 */
export function kitErrors(dist, icons) {
  const errors = [];
  const read = (file) => (existsSync(join(dist, file)) ? readFileSync(join(dist, file)) : undefined);

  for (const { file } of KIT_LINKS) {
    if (!read(file)) errors.push(`dist/${file}: файла нет — его рисует сборка, см. src/brand/favicons.ts`);
  }
  for (const { file, size } of icons) {
    const data = read(file);
    if (!data) {
      if (!KIT_LINKS.some((item) => item.file === file)) errors.push(`dist/${file}: файла нет — его рисует сборка, см. src/brand/favicons.ts`);
      continue;
    }
    const side = pngSide(data);
    if (side !== size) errors.push(`dist/${file}: ${typeof side === 'number' ? `сторона ${side} px` : side}, по списку иконок — ${size} px`);
  }

  const ico = read('favicon.ico');
  if (ico && (ico.length < 6 || ico.readUInt16LE(0) !== 0 || ico.readUInt16LE(2) !== 1 || ico.readUInt16LE(4) === 0)) {
    errors.push('dist/favicon.ico: это не файл иконки — заголовок не сходится');
  }

  const manifest = read('manifest.webmanifest');
  if (manifest) {
    try {
      for (const icon of JSON.parse(manifest.toString('utf8')).icons ?? []) {
        if (!read(String(icon.src).replace(/^\//, ''))) errors.push(`dist/manifest.webmanifest: иконки ${icon.src} в сборке нет`);
      }
    } catch {
      errors.push('dist/manifest.webmanifest: файл не разбирается как JSON');
    }
  }
  return errors;
}

/** Цвета из SVG, которых нет среди ролей tokens.css. */
export function foreignColors(svg, themes) {
  const known = new Set([...Object.values(themes.light), ...Object.values(themes.dark)]);
  return [...new Set((svg.match(/#[0-9a-f]{6}\b/gi) ?? []).map((color) => color.toLowerCase()))].filter((color) => !known.has(color));
}

/**
 * @param {string} root
 * @param {{ icons?: { file: string, size: number }[] }} [kit] без списка иконок комплект не проверяется
 */
export function checkDist(root, { icons } = {}) {
  const dist = join(root, 'dist');
  if (!existsSync(dist)) return { errors: ['dist/: сборки нет — сначала make build'], checked: 0 };

  const errors = [];
  const files = walk(dist);
  const pages = files.filter((path) => path.endsWith('.html'));

  for (const path of pages) {
    const file = posix(relative(root, path));
    const html = readFileSync(path, 'utf8');
    for (const label of buttonsWithoutIcon(html)) {
      errors.push(`${file}: кнопка «${label}» без иконки — добавь <Icon /> перед подписью`);
    }
    if (icons) {
      for (const { file: asset, link } of KIT_LINKS) {
        if (!link.test(html)) errors.push(`${file}: страница не подключает /${asset} — ссылки на комплект стоят в src/layouts/Base.astro`);
      }
    }
  }

  if (icons) errors.push(...kitErrors(dist, icons));

  const tokens = join(root, TOKENS);
  if (existsSync(tokens)) {
    const themes = parseTokens(readFileSync(tokens, 'utf8'));
    for (const path of files.filter((item) => item.endsWith('.svg'))) {
      for (const color of foreignColors(readFileSync(path, 'utf8'), themes)) {
        errors.push(`${posix(relative(root, path))}: цвета ${color} нет в tokens.css — картинки красятся ролями палитры`);
      }
    }
  }
  return { errors, checked: pages.length };
}

/** Обе половины разом. Исходники проверяются, если в корне есть src/. */
export function checkBrand(root, kit) {
  const dist = checkDist(root, kit);
  const source = existsSync(join(root, 'src')) ? checkSource(root) : { errors: [], checked: 0 };
  return { errors: [...source.errors, ...dist.errors], checked: dist.checked, sources: source.checked };
}

async function main() {
  const args = process.argv.slice(2);
  const root = resolve(args.includes('--root') ? args[args.indexOf('--root') + 1] : '.');

  const { APP_ICONS } = await import(pathToFileURL(join(root, 'src/brand/favicons.ts')).href);
  const { errors, checked, sources } = checkBrand(root, { icons: APP_ICONS });

  if (errors.length) {
    console.error(`Сайт расходится с BRAND.md (${errors.length}):`);
    for (const line of errors) console.error(`  ✗ ${line}`);
    process.exit(1);
  }
  console.log(`✓ Правила бренда соблюдены: исходников проверено ${sources}, страниц — ${checked}.`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main();
