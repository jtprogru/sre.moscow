// Тесты обложки репозитория: слова на ней из канона, а PNG в .github/ нужного
// размера и покрашены своей темой.
//
//   bun test tools/

import { expect, test } from 'bun:test';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

import { SITE } from '../src/lib/site.ts';
import { textOf } from './check-copy.mjs';
import { COVERS, HEIGHT, WIDTH, coverHtml } from './cover.mjs';
import { readTokens } from './tokens.mjs';

const ROOT = resolve(fileURLToPath(import.meta.url), '../..');
const themes = readTokens();
const other = { light: 'dark', dark: 'light' };

/** Картинка как она есть: размер, цвет угла и число пикселей каждого из цветов #rrggbb. */
async function pixels(file, colors) {
  const { data, info } = await sharp(resolve(ROOT, file)).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const hex = (i) => `#${data.subarray(i, i + 3).toString('hex')}`;
  const count = Object.fromEntries(colors.map((color) => [color, 0]));
  for (let i = 0; i < data.length; i += info.channels) {
    const color = hex(i);
    if (color in count) count[color] += 1;
  }
  return { width: info.width, height: info.height, corner: hex(0), count };
}

test('на обложке стоят дескриптор, слоган и короткая форма заявления', () => {
  const text = textOf(coverHtml('dark'));
  for (const phrase of [SITE.descriptor, SITE.slogan, SITE.independence.short]) expect(text).toContain(phrase);
});

test('тему обложки выбирает data-theme, как на сайте', () => {
  expect(coverHtml('light')).toContain('data-theme="light"');
  expect(coverHtml('dark')).toContain('data-theme="dark"');
});

// Падает, когда палитру поменяли, а обложку не пересобрали: make cover.
for (const [theme, file] of Object.entries(COVERS)) {
  test(`${file}: ${WIDTH} × ${HEIGHT} px, фон и акцент темы ${theme}`, async () => {
    const own = themes[theme].accent;
    const foreign = themes[other[theme]].accent;
    const image = await pixels(file, [own, foreign]);

    expect([image.width, image.height]).toEqual([WIDTH, HEIGHT]);
    expect(image.corner).toBe(themes[theme].bg);
    expect(image.count[own]).toBeGreaterThan(0);
    expect(image.count[foreign]).toBe(0);
  });
}
