#!/usr/bin/env bun
/*
 * Обложка репозитория: картинка в шапке README.md и Social preview на GitHub.
 *
 * Шаблон один, тем две. Тёмная обложка идёт в Social preview и в README на
 * тёмной теме GitHub, светлая — в README на светлой. Знак и сова берутся из
 * src/brand/, слова — из src/lib/site.ts, цвет и шрифты — из src/styles/:
 * своей копии у обложки нет ни для чего.
 *
 * Страницу снимает Chromium из Playwright: растеризатор SVG не набирает текст
 * нашими woff2. PNG лежат в репозитории и пересобираются руками, когда меняется
 * знак, сова, палитра или слова:
 *
 *   make cover
 *
 * Social preview сам из репозитория не берётся: .github/cover-dark.png
 * загружается руками в Settings → General → Social preview.
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { owlOnPanel } from '../src/brand/mascot.ts';
import { sign } from '../src/brand/sign.ts';
import { SITE } from '../src/lib/site.ts';

const ROOT = resolve(fileURLToPath(import.meta.url), '../..');

/** Размер, который GitHub просит для Social preview. */
export const WIDTH = 1280;
export const HEIGHT = 640;

/** Обложки по темам, пути от корня репозитория. */
export const COVERS = { light: '.github/cover-light.png', dark: '.github/cover-dark.png' };

const escape = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;');

/**
 * Страница обложки в теме theme. Композиция повторяет первый экран главной:
 * сова на панели слева, заголовок справа. Кегли здесь свои: картинку смотрят
 * уменьшенной, шкала сайта для неё мелка.
 */
export function coverHtml(theme) {
  const style = (file) => pathToFileURL(join(ROOT, 'src/styles', file)).href;
  const scene = owlOnPanel();
  const [word, tld] = SITE.name.split('.');
  // Акцентом красится последнее слово слогана, как в заголовке главной.
  const cut = SITE.slogan.lastIndexOf(' ');

  return `<!doctype html>
<html lang="ru" data-theme="${theme}">
  <head>
    <meta charset="utf-8" />
    <link rel="stylesheet" href="${style('tokens.css')}" />
    <link rel="stylesheet" href="${style('fonts.css')}" />
    <style>
      html, body { margin: 0; }
      body {
        box-sizing: border-box;
        width: ${WIDTH}px;
        height: ${HEIGHT}px;
        padding: 64px 72px;
        display: grid;
        grid-template-columns: 419px minmax(0, 1fr);
        gap: 64px;
        background: var(--bg);
        color: var(--fg);
        font-family: var(--font-sans);
      }
      .scene { width: 419px; height: 512px; }
      .text { display: flex; flex-direction: column; justify-content: space-between; }
      .logo { display: flex; align-items: center; gap: 20px; font-size: 52px; font-weight: var(--fw-bold); line-height: var(--lh-none); letter-spacing: var(--ls-tight); }
      .logo svg { flex: none; width: 68px; height: 68px; }
      .logo__dot { color: var(--accent); }
      .logo__tld { font-weight: var(--fw-regular); color: var(--fg-muted); }
      .eyebrow { margin: 0 0 16px; color: var(--fg-subtle); font-family: var(--font-mono); font-size: 22px; letter-spacing: var(--ls-caps); text-transform: uppercase; }
      h1 { margin: 0; font-size: 80px; font-weight: var(--fw-bold); line-height: var(--lh-tight); letter-spacing: var(--ls-tight); }
      h1 em { font-style: normal; color: var(--accent); }
      .note { margin: 0; color: var(--fg-muted); font-size: 24px; line-height: var(--lh-snug); }
    </style>
  </head>
  <body>
    <svg class="scene" viewBox="${scene.viewBox}" fill="none">${scene.body}</svg>
    <div class="text">
      <div class="logo">
        <svg viewBox="0 0 32 32" fill="none">${sign()}</svg>
        <span>${escape(word)}<span class="logo__dot">.</span><span class="logo__tld">${escape(tld)}</span></span>
      </div>
      <div>
        <p class="eyebrow">${escape(SITE.descriptor)}</p>
        <h1>${escape(SITE.slogan.slice(0, cut))} <em>${escape(SITE.slogan.slice(cut + 1))}</em></h1>
      </div>
      <p class="note">${escape(SITE.independence.short)}</p>
    </div>
  </body>
</html>
`;
}

async function main() {
  // Playwright нужен только здесь: тесты читают из модуля размеры и пути.
  const { chromium } = await import('playwright');
  const tmp = mkdtempSync(join(tmpdir(), 'sre-moscow-cover-'));
  const browser = await chromium.launch();

  try {
    for (const [theme, file] of Object.entries(COVERS)) {
      const html = join(tmp, `${theme}.html`);
      writeFileSync(html, coverHtml(theme));

      const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1 });
      await page.goto(pathToFileURL(html).href);

      // Снимок без наших шрифтов или цветов выглядит правдоподобно, поэтому
      // проверяем явно: все начертания загружены, роли из tokens.css на месте.
      const ready = await page.evaluate(async () => {
        await Promise.all([...document.fonts].map((face) => face.load()));
        return { faces: document.fonts.size, tokens: getComputedStyle(document.documentElement).getPropertyValue('--bg') !== '' };
      });
      if (!ready.faces) throw new Error('обложка: src/styles/fonts.css не подключился, шрифтов на странице нет');
      if (!ready.tokens) throw new Error('обложка: src/styles/tokens.css не подключился, цветовых ролей на странице нет');

      await page.screenshot({ path: join(ROOT, file) });
      await page.close();
      console.log(`✓ ${file}`);
    }
  } finally {
    await browser.close();
    rmSync(tmp, { recursive: true, force: true });
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main();
