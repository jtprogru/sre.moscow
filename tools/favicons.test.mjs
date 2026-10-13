// Тесты знака и комплекта иконок: где кончаются дуги, какого размера картинки
// и чем они покрашены.
//
//   bun test tools/

import { expect, test } from 'bun:test';
import sharp from 'sharp';

import { APP_ICONS, ICO_SIZES, faviconSvg, ico, platePng, plateSvg } from '../src/brand/favicons.ts';
import { sign, signSmall } from '../src/brand/sign.ts';
import { foreignColors } from './check-brand.mjs';
import { readTokens } from './tokens.mjs';

const themes = readTokens();

/** Концы первой дуги из разметки знака: [[x0, y0], [x1, y1]]. */
const ends = (markup) => {
  const [, x0, y0, x1, y1] = /d="M([\d.]+) ([\d.]+) A[\d. ]+ ([\d.]+) ([\d.]+)"/.exec(markup).map(Number);
  return [[x0, y0], [x1, y1]];
};

test('кольцо полного знака начинается в двенадцать часов и разомкнуто на 15%', () => {
  const [[x0, y0], [x1, y1]] = ends(sign());
  expect([x0, y0]).toEqual([16, 3]);
  // 85% оборота: точка слева вверху, симметрично началу не стоит
  expect(x1).toBeCloseTo(16 + 13 * Math.sin(2 * Math.PI * 0.85), 2);
  expect(y1).toBeCloseTo(16 - 13 * Math.cos(2 * Math.PI * 0.85), 2);
});

test('знак масштабируется вокруг своего центра', () => {
  expect(ends(sign(100, 50, 2))[0]).toEqual([100, 24]);
  expect(sign(100, 50, 2)).toContain('stroke-width="6"');
});

test('в малом знаке нет внутреннего кольца, а разрыв шире', () => {
  expect(sign().match(/<circle/g)).toHaveLength(2);
  expect(signSmall().match(/<circle/g)).toHaveLength(1);
  expect(signSmall()).toContain('stroke-width="4"');
});

test('на странице знак красится цветом текста и акцентом, в картинке — тем, что передали', () => {
  expect(sign()).toContain('stroke="currentColor"');
  expect(sign()).toContain('fill="var(--accent)"');
  expect(sign(16, 16, 1, { ring: '#111111', accent: '#222222' })).not.toContain('currentColor');
});

test('фавикон: обе темы внутри файла, чужих цветов нет', () => {
  const svg = faviconSvg(themes.light, themes.dark);
  expect(svg).toContain('prefers-color-scheme:dark');
  for (const color of [themes.light.fg, themes.light.accent, themes.dark.fg, themes.dark.accent]) expect(svg).toContain(color);
  expect(foreignColors(svg, themes)).toEqual([]);
});

test('до 48 px на плашке стоит малый знак, крупнее — полный', () => {
  expect(plateSvg(themes.dark, 48, 'rounded').match(/<circle/g)).toHaveLength(1);
  expect(plateSvg(themes.dark, 180, 'square').match(/<circle/g)).toHaveLength(2);
  expect(foreignColors(plateSvg(themes.dark, 180, 'square'), themes)).toEqual([]);
});

test('иконки получаются заявленного размера', async () => {
  for (const { file, size, plate } of APP_ICONS) {
    const { format, width, height } = await sharp(await platePng(themes.dark, size, plate)).metadata();
    expect({ file, format, width, height }).toEqual({ file, format: 'png', width: size, height: size });
  }
});

test('в маскируемой иконке знак не выходит из круга в 80%', async () => {
  const size = 512;
  const { data } = await sharp(await platePng(themes.dark, size, 'maskable')).raw().toBuffer({ resolveWithObject: true });
  const [r, g, b] = [1, 3, 5].map((i) => Number.parseInt(themes.dark.bg.slice(i, i + 2), 16));
  let farthest = 0;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const i = (y * size + x) * 4;
      if (data[i] === r && data[i + 1] === g && data[i + 2] === b) continue;
      farthest = Math.max(farthest, Math.hypot(x - size / 2, y - size / 2));
    }
  }
  expect(farthest).toBeGreaterThan(0);
  expect(farthest).toBeLessThan(size * 0.4);
});

test('ico: заголовок, по записи на размер, картинки лежат по своим смещениям', async () => {
  const images = await Promise.all(ICO_SIZES.map(async (size) => ({ size, data: await platePng(themes.dark, size, 'rounded') })));
  const file = ico(images);

  expect([file.readUInt16LE(0), file.readUInt16LE(2), file.readUInt16LE(4)]).toEqual([0, 1, images.length]);
  for (const [index, { size, data }] of images.entries()) {
    const entry = 6 + index * 16;
    expect(file.readUInt8(entry)).toBe(size);
    const [length, offset] = [file.readUInt32LE(entry + 8), file.readUInt32LE(entry + 12)];
    expect(length).toBe(data.length);
    expect(file.subarray(offset, offset + length).equals(data)).toBe(true);
  }
});
