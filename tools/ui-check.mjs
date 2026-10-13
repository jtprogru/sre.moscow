#!/usr/bin/env node
/*
 * Проверка вёрстки в браузерах: то, что видно только на собранной странице
 * и только на конкретном экране.
 *
 *   — горизонтальной прокрутки нет;
 *   — на сенсорном экране кнопка, метка-ссылка, пункт меню и поле не меньше
 *     44 × 44 px;
 *   — текст не мельче 12 px, поле ввода не мельче 16 px;
 *   — шапка стоит в одну строку: до 768 px и от 1024 px;
 *   — картинки загрузились, в консоли нет ошибок;
 *   — меню на телефоне и поиск проходятся с клавиатуры;
 *   — каталог переключается между списком и карточками и помнит выбор,
 *     фильтры на телефоне раскрываются кнопкой.
 *
 * Ходит по всем страницам dist/ в обеих темах по матрице профилей, движки
 * работают параллельно. Скриншоты складывает в ui-check/, чтобы посмотреть
 * глазами: с эталоном они не сравниваются, сглаживание шрифтов на разных
 * системах разное.
 *
 *   node tools/ui-check.mjs [--engine chromium] [--profile laptop] [--page /people/] [--no-shots] [--strict]
 *
 * Движок, которого на машине нет, пропускается с предупреждением. С флагом
 * --strict и в CI это ошибка. Поставить движки: bunx playwright install.
 *
 * Проверка идёт минуты, поэтому не молчит: сначала план, потом строка на
 * каждый прогон с его временем и числом нарушений. Прогон — «движок-экран-тема»
 * по всем страницам либо «движок-экран-controls»: поиск, меню и каталог. В
 * GitHub Actions итог виден и без лога: нарушения уходят аннотациями, отчёт
 * с таблицей прогонов — на страницу запуска.
 *
 * Запускается через Node: на него рассчитан Playwright.
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, relative, resolve, sep } from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import { walk } from './check-copy.mjs';

/** Матрица: экран, сенсорный ли он и в каких движках его смотрим. */
export const PROFILES = [
  { name: 'android', width: 360, height: 740, touch: true, engines: ['chromium'] },
  { name: 'iphone', width: 390, height: 844, touch: true, engines: ['webkit'] },
  { name: 'ipad-portrait', width: 768, height: 1024, touch: true, engines: ['webkit'] },
  { name: 'ipad-landscape', width: 1024, height: 768, touch: true, engines: ['webkit'] },
  { name: 'laptop', width: 1280, height: 800, touch: false, engines: ['chromium', 'firefox', 'webkit'] },
  { name: 'monitor', width: 1920, height: 1080, touch: false, engines: ['chromium', 'firefox'] },
];

const THEMES = ['light', 'dark'];

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json',
  '.ics': 'text/calendar; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

/** Раздаёт dist/ так же, как хостинг: каталог отвечает своим index.html, чего нет — 404.html. */
export function serve(dist) {
  const server = createServer((request, response) => {
    const path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    let file = resolve(dist, `.${path}`);
    if (!file.startsWith(dist)) file = join(dist, '404.html');
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
    const found = existsSync(file);
    if (!found) file = join(dist, '404.html');

    response.writeHead(found ? 200 : 404, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' });
    response.end(readFileSync(file));
  });
  return new Promise((done) => server.listen(0, '127.0.0.1', () => done(server)));
}

/** Адреса всех страниц сборки. */
export function pagesOf(dist) {
  return walk(dist)
    .filter((path) => path.endsWith('.html'))
    .map((path) => `/${relative(dist, path).split(sep).join('/')}`.replace(/index\.html$/, ''))
    .sort();
}

/** Время словами: «6.1 с», «4 мин 3 с». */
export const duration = (ms) => {
  const seconds = Math.round(ms / 1000);
  return ms < 59_950 ? `${(ms / 1000).toFixed(1)} с` : `${Math.floor(seconds / 60)} мин ${seconds % 60} с`;
};

/**
 * Где встретилось нарушение, без повторов: в каких прогонах и на каких
 * страницах. Восемьдесят мест читаются как «четыре прогона, все страницы».
 */
export function whereabouts(places, limit = 4) {
  const list = (items) => {
    const unique = [...new Set(items)];
    return unique.slice(0, limit).join(', ') + (unique.length > limit ? ` и ещё ${unique.length - limit}` : '');
  };
  return { runs: list(places.map((place) => place.run)), pages: list(places.map((place) => place.path)) };
}

// Команды GitHub Actions читаются из лога построчно, служебные символы в них
// экранируются: docs.github.com/actions/reference/workflow-commands-for-github-actions
const commandData = (text) => text.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
const commandProperty = (text) => commandData(text).replace(/:/g, '%3A').replace(/,/g, '%2C');

/** Нарушение аннотацией: GitHub покажет её на странице запуска и во вкладке Checks у PR. */
export const annotation = (violation, places) => {
  const where = whereabouts(places);
  return `::error title=${commandProperty('make ui-check')}::${commandData(`${violation}. Прогоны: ${where.runs}. Страницы: ${where.pages}`)}`;
};

/** Ячейка таблицы в markdown: в названиях нарушений стоят теги вроде <a>. */
const cell = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\|/g, '\\|');

/**
 * Отчёт для страницы запуска в GitHub Actions: вердикт, нарушения и время
 * каждого прогона.
 */
export function report({ pages, loads, elapsed, runs, violations, skipped }) {
  const verdict = violations.size ? `вёрстка расходится с правилами (${violations.size})` : skipped.length ? 'проверено не во всех движках' : 'вёрстка в порядке';
  const lines = [`## make ui-check: ${verdict}`, '', `Страниц ${pages}, прогонов ${runs.length}, загрузок ${loads}, время ${duration(elapsed)}.`, ''];
  if (skipped.length) lines.push(`Не проверено в ${skipped.join(', ')}: движок не запустился.`, '');

  if (violations.size) {
    lines.push('### Нарушения', '', '| Нарушение | Прогоны | Страницы |', '| --- | --- | --- |');
    for (const [violation, places] of violations) {
      const where = whereabouts(places);
      lines.push(`| ${cell(violation)} | ${cell(where.runs)} | ${cell(where.pages)} |`);
    }
    lines.push('');
  }

  lines.push('### Прогоны', '', '| Прогон | Время | Нарушений |', '| --- | ---: | ---: |');
  for (const run of runs) lines.push(`| ${run.name} | ${duration(run.ms)} | ${run.violations} |`);
  return `${lines.join('\n')}\n`;
}

/**
 * Замеры на странице. Выполняется в браузере, поэтому ничего снаружи не видит.
 * Возвращает список нарушений: { rule, detail }.
 */
function audit({ touch, width }) {
  const TAP = 44;
  const found = [];
  const seen = new Set();
  const report = (rule, detail) => {
    if (seen.has(rule + detail)) return;
    seen.add(rule + detail);
    found.push({ rule, detail });
  };

  const visible = (element) => {
    if (element.getClientRects().length === 0) return false;
    const style = getComputedStyle(element);
    return style.visibility !== 'hidden' && Number(style.opacity) !== 0;
  };
  const name = (element) => {
    const classes = typeof element.className === 'string' && element.className ? `.${element.className.trim().split(/\s+/).join('.')}` : '';
    const text = (element.getAttribute('aria-label') ?? element.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 32);
    return `<${element.tagName.toLowerCase()}${classes}>${text ? ` «${text}»` : ''}`;
  };
  const px = (value) => Math.round(value * 10) / 10;

  const page = document.documentElement;
  if (page.scrollWidth > page.clientWidth) {
    const edge = page.clientWidth;
    const culprit = [...document.body.querySelectorAll('*')].find((element) => visible(element) && element.getBoundingClientRect().right > edge + 1);
    report('горизонтальная прокрутка', `страница шире экрана на ${page.scrollWidth - page.clientWidth} px${culprit ? `, вылезает ${name(culprit)}` : ''}`);
  }

  if (touch) {
    const targets = '.button, .icon-button, .search-trigger, a.tag, label.choice, .site-nav a, .menu__nav a, button, select, textarea, input:not([type="hidden"]):not([type="radio"]):not([type="checkbox"])';
    for (const element of document.querySelectorAll(targets)) {
      if (!visible(element)) continue;
      const box = element.getBoundingClientRect();
      if (box.width < TAP - 0.5 || box.height < TAP - 0.5) report('цель мельче 44 px', `${name(element)} — ${px(box.width)} × ${px(box.height)} px`);
    }
  }

  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const element = node.parentElement;
    if (!node.textContent.trim() || !element || element.closest('svg, script, style, noscript') || !visible(element)) continue;
    const size = Number.parseFloat(getComputedStyle(element).fontSize);
    if (size < 12) report('текст мельче 12 px', `${name(element)} — ${px(size)} px`);
  }

  for (const field of document.querySelectorAll('input:not([type="hidden"]):not([type="radio"]):not([type="checkbox"]), select, textarea')) {
    if (!visible(field)) continue;
    const size = Number.parseFloat(getComputedStyle(field).fontSize);
    if (size < 16) report('поле мельче 16 px', `${name(field)} — ${px(size)} px: iOS Safari при фокусе приблизит страницу`);
  }

  // От 768 до 1023 px разделы стоят второй строкой — так задумано.
  if (width < 768 || width >= 1024) {
    const row = [...document.querySelectorAll('.site-header .logo, .site-header .site-nav a, .site-header__tools > *')].filter(visible);
    const centers = row.map((element) => {
      const box = element.getBoundingClientRect();
      return box.top + box.height / 2;
    });
    if (centers.length > 1 && Math.max(...centers) - Math.min(...centers) > 12) {
      report('шапка в две строки', `элементы шапки разошлись по высоте на ${px(Math.max(...centers) - Math.min(...centers))} px`);
    }
  }

  for (const image of document.images) {
    if (visible(image) && image.complete && image.naturalWidth === 0) report('картинка не загрузилась', image.getAttribute('src') ?? '');
  }
  return found;
}

/** Поиск с клавиатуры: открыть, набрать, пройтись стрелкой, закрыть. */
async function searchByKeyboard(page) {
  const problems = [];
  const open = () => page.evaluate(() => document.querySelector('[data-search]')?.open === true);

  await page.keyboard.press('/');
  if (!(await open())) return ['клавиша «/» не открыла поиск'];

  await page.keyboard.type('slo');
  try {
    await page.waitForSelector('[data-search] [role="option"]', { timeout: 5000 });
  } catch {
    problems.push('по запросу «slo» в поиске нет результатов');
  }
  const first = await page.evaluate(() => document.querySelector('[data-search-input]')?.getAttribute('aria-activedescendant'));
  await page.keyboard.press('ArrowDown');
  const second = await page.evaluate(() => document.querySelector('[data-search-input]')?.getAttribute('aria-activedescendant'));
  if (!first || !second || first === second) problems.push('стрелка вниз не переводит выбор на следующий результат');

  await page.keyboard.press('Escape');
  if (await open()) problems.push('Esc не закрыл поиск с первого нажатия');
  return problems;
}

/** Меню на телефоне с клавиатуры: открыть с кнопки, остаться внутри, закрыть, вернуть фокус. */
async function menuByKeyboard(page) {
  const problems = [];
  const open = () => page.evaluate(() => document.querySelector('[data-menu]')?.open === true);

  await page.focus('[data-menu-open]');
  await page.keyboard.press('Enter');
  if (!(await open())) return ['Enter на кнопке меню его не открыл'];

  for (let step = 0; step < 12; step += 1) await page.keyboard.press('Tab');
  const inside = await page.evaluate(() => document.querySelector('[data-menu]')?.contains(document.activeElement) === true);
  if (!inside) problems.push('Tab уводит фокус из открытого меню');

  await page.keyboard.press('Escape');
  if (await open()) problems.push('Esc не закрыл меню');
  const returned = await page.evaluate(() => document.activeElement?.matches('[data-menu-open]') === true);
  if (!returned) problems.push('после закрытия меню фокус не вернулся на кнопку');
  return problems;
}

/** Каталог: вид переключается и запоминается, фильтры на телефоне свёрнуты в кнопку. */
async function catalogControls(page, width) {
  const problems = [];
  const state = () =>
    page.evaluate(() => {
      const cards = [...document.querySelectorAll('.catalog .card')].filter((card) => card.getClientRects().length > 0);
      const text = document.querySelector('.catalog .card__text');
      return {
        view: document.documentElement.dataset.view,
        columns: new Set(cards.map((card) => Math.round(card.getBoundingClientRect().left))).size,
        text: text ? text.getClientRects().length > 0 : false,
      };
    });
  const choose = (view) => page.locator(`[data-view-switch] label:has(input[value="${view}"])`).click();

  await choose('list');
  const list = await state();
  if (list.view !== 'list' || list.columns !== 1 || list.text) problems.push(`вид «списком» не включился: ${JSON.stringify(list)}`);

  await choose('cards');
  const cards = await state();
  if (cards.view !== 'cards' || !cards.text) problems.push(`вид «карточками» не включился: ${JSON.stringify(cards)}`);
  if (width >= 768 && cards.columns < 2) problems.push(`карточки на ${width} px стоят в одну колонку`);

  await page.reload({ waitUntil: 'networkidle' });
  if ((await state()).view !== 'cards') problems.push('выбранный вид не пережил перезагрузку страницы');

  const toggle = page.locator('[data-filters-toggle]');
  const fields = page.locator('.filters__fields');
  if (width < 600) {
    if (await fields.isVisible()) problems.push('на телефоне поля фильтров раскрыты сразу');
    await toggle.click();
    if (!(await fields.isVisible()) || (await toggle.getAttribute('aria-expanded')) !== 'true') problems.push('кнопка «Фильтры» не раскрыла поля');
  } else {
    if (await toggle.isVisible()) problems.push('кнопка «Фильтры» видна на широком экране');
    if (!(await fields.isVisible())) problems.push('поля фильтров на широком экране скрыты');
  }
  return problems;
}

/** Страница, на которой проверяются переключатель вида и фильтры. */
const CATALOG = '/talks/';

/** Имя прогона с управлением: стоит там же, где у остальных тема. */
const CONTROLS = 'controls';

const slug = (path) => path.replace(/^\/|\/$/g, '').replace(/\.html$/, '').replaceAll('/', '_') || 'index';

async function main() {
  const args = process.argv.slice(2);
  const option = (flag) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined);
  const root = resolve(option('--root') ?? '.');
  const dist = join(root, 'dist');
  const out = resolve(root, option('--out') ?? 'ui-check');
  const strict = args.includes('--strict') || Boolean(process.env.CI);
  const shots = !args.includes('--no-shots');

  if (!existsSync(dist)) {
    console.error('dist/: сборки нет — сначала make build');
    process.exit(1);
  }

  const pages = pagesOf(dist).filter((path) => !option('--page') || path === option('--page'));
  const profiles = PROFILES.filter((profile) => !option('--profile') || profile.name === option('--profile'));
  const engines = [...new Set(profiles.flatMap((profile) => profile.engines))].filter((engine) => !option('--engine') || engine === option('--engine'));

  const playwright = await import('playwright');
  const server = await serve(dist);
  const base = `http://127.0.0.1:${server.address().port}`;

  if (shots) rmSync(out, { recursive: true, force: true });

  // Прогон — один движок на одном экране: все страницы в одной теме либо
  // управление — поиск, меню и каталог, которые от темы не зависят и потому
  // идут отдельно, раз на экран. Движки работают параллельно, прогоны внутри
  // движка — по очереди: так строки одного браузера не перемешаны между собой.
  const stages = pages.includes('/') || pages.includes(CATALOG) ? [...THEMES, CONTROLS] : THEMES;
  const plan = engines.map((engine) => ({ engine, screens: profiles.filter((item) => item.engines.includes(engine)) }));
  const names = plan.flatMap(({ engine, screens }) => screens.flatMap((profile) => stages.map((stage) => `${engine}-${profile.name}-${stage}`)));
  const pad = Math.max(0, ...names.map((name) => name.length));
  const started = Date.now();

  /** нарушение → где встретилось: [{ path, run }] */
  const violations = new Map();
  /** прогон → { name, ms, violations } */
  const results = new Map();
  const skipped = [];
  let total = names.length;
  let loads = 0;
  let done = 0;

  console.log(`Вёрстка: страниц ${pages.length}, прогонов ${total}, движки параллельно — ${plan.map(({ engine, screens }) => `${engine}: ${screens.length * stages.length}`).join(', ')}.`);
  console.log(`Прогон — движок, экран и тема${stages.includes(CONTROLS) ? `; ${CONTROLS} — поиск, меню и каталог: раз на экран, от темы не зависят` : ''}.`);

  const check = async ({ engine, screens }) => {
    let browser;
    try {
      browser = await playwright[engine].launch();
    } catch (error) {
      skipped.push(engine);
      total -= screens.length * stages.length;
      console.warn(`! ${engine} не запустился и пропущен: ${String(error.message).split('\n')[0]}`);
      return;
    }
    console.log(`${engine} ${browser.version()}`);

    for (const profile of screens) {
      for (const stage of stages) {
        const run = `${engine}-${profile.name}-${stage}`;
        const began = Date.now();
        const hits = new Set();
        const note = (rule, detail, path) => {
          const key = `${rule}: ${detail}`;
          violations.set(key, [...(violations.get(key) ?? []), { path, run }]);
          hits.add(key);
        };

        const context = await browser.newContext({
          viewport: { width: profile.width, height: profile.height },
          colorScheme: stage === CONTROLS ? 'light' : stage,
          hasTouch: profile.touch,
          // Firefox не знает isMobile, а без него Chromium не включает pointer: coarse.
          ...(profile.touch && engine !== 'firefox' ? { isMobile: true } : {}),
        });
        const page = await context.newPage();
        let current = '';
        page.on('pageerror', (error) => note('ошибка в скрипте', error.message, current));
        page.on('console', (message) => {
          // 404-я страница законно получает 404 на свой адрес.
          if (message.type() === 'error' && !/404/.test(message.text())) note('ошибка в консоли', message.text(), current);
        });

        if (stage === CONTROLS) {
          if (pages.includes('/')) {
            current = '/';
            await page.goto(`${base}/`, { waitUntil: 'networkidle' });
            for (const problem of await searchByKeyboard(page)) note('поиск с клавиатуры', problem, '/');
            if (profile.width < 768) {
              await page.goto(`${base}/`, { waitUntil: 'networkidle' });
              for (const problem of await menuByKeyboard(page)) note('меню с клавиатуры', problem, '/');
            }
          }
          if (pages.includes(CATALOG)) {
            current = CATALOG;
            await page.goto(base + CATALOG, { waitUntil: 'networkidle' });
            for (const problem of await catalogControls(page, profile.width)) note('каталог', problem, CATALOG);
          }
        } else {
          if (shots) mkdirSync(join(out, run), { recursive: true });
          for (const path of pages) {
            current = path;
            await page.goto(base + path, { waitUntil: 'networkidle' });
            await page.evaluate(() => document.fonts.ready);
            loads += 1;
            for (const { rule, detail } of await page.evaluate(audit, { touch: profile.touch, width: profile.width })) note(rule, detail, path);
            if (shots) await page.screenshot({ path: join(out, run, `${slug(path)}.jpg`), type: 'jpeg', quality: 80, fullPage: true });
          }
        }
        await context.close();

        done += 1;
        const ms = Date.now() - began;
        results.set(run, { name: run, ms, violations: hits.size });
        console.log(`  [${String(done).padStart(String(total).length)}/${total}] ${run.padEnd(pad)} ${duration(ms).padStart(7)}  ${hits.size ? `✗ нарушений: ${hits.size}` : '✓'}`);
      }
    }
    await browser.close();
  };

  await Promise.all(plan.map(check));
  server.close();

  // В отчёте прогоны стоят по плану, а не в том порядке, в каком закончились.
  const runs = names.flatMap((name) => results.get(name) ?? []);

  const elapsed = Date.now() - started;
  const ran = engines.filter((engine) => !skipped.includes(engine));
  const summary = `страниц ${pages.length}, прогонов ${runs.length}, загрузок ${loads}, движки: ${ran.join(', ') || 'ни одного'}, время: ${duration(elapsed)}`;

  if (violations.size) {
    console.error(`Вёрстка расходится с правилами (${violations.size}); ${summary}:`);
    for (const [violation, places] of violations) {
      const where = whereabouts(places);
      console.error(`  ✗ ${violation}`);
      console.error(`      прогоны: ${where.runs}`);
      console.error(`      страницы: ${where.pages}`);
    }
  }

  // Аннотаций GitHub берёт десять на шаг, остальные нарушения — в отчёте и в логе.
  if (process.env.GITHUB_ACTIONS) for (const [violation, places] of [...violations].slice(0, 10)) console.log(annotation(violation, places));
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, report({ pages: pages.length, loads, elapsed, runs, violations, skipped }));
  if (skipped.length) {
    console.warn(`! Не проверено в ${skipped.join(', ')}: движок не установлен. Поставить: bunx playwright install ${skipped.join(' ')}`);
  }
  if (violations.size || (strict && skipped.length) || ran.length === 0) process.exit(1);

  console.log(`✓ Вёрстка в порядке: ${summary}.${shots ? ` Скриншоты — в ${relative(root, out) || out}/.` : ''}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main();
