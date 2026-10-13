// Комплект иконок сайта: фавикон для вкладки, иконки для домашнего экрана и
// манифеста. Всё рисуется при сборке из знака и цветов tokens.css, готовых
// картинок в public/ нет — разойтись с палитрой им негде.

import sharp from 'sharp';

import { sign, signSmall } from './sign';

/** Цвета одной темы, как их отдаёт tools/tokens.mjs. */
export interface Palette {
  bg: string;
  fg: string;
  accent: string;
}

const GRID = 32;

/** До этого размера включительно рисуется малый знак. */
const SMALL_UP_TO = 48;

/**
 * Фавикон для вкладки: малый знак без плашки. Цвета светлой темы записаны
 * атрибутами, тёмная тема перекрашивает их через media-запрос: браузер, который
 * стили в иконке не читает, покажет светлый вариант.
 */
export function faviconSvg(light: Palette, dark: Palette): string {
  const swap = (attr: 'stroke' | 'fill', from: string, to: string) => `[${attr}="${from}"]{${attr}:${to}}`;
  const repaint = swap('stroke', light.fg, dark.fg) + swap('stroke', light.accent, dark.accent) + swap('fill', light.accent, dark.accent);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${GRID} ${GRID}" fill="none">` +
    `<style>@media (prefers-color-scheme:dark){${repaint}}</style>` +
    signSmall(GRID / 2, GRID / 2, 1, { ring: light.fg, accent: light.accent }) +
    '\n</svg>\n'
  );
}

/**
 * Вид плашки. Картинка в PNG не знает темы страницы, поэтому знак стоит на
 * плашке цвета фона.
 *   rounded  — скруглённая, для вкладки и списка приложений
 *   square   — во весь квадрат: углы скругляет сама iOS
 *   maskable — во весь квадрат, знак внутри круга в 80%: Android обрезает края
 */
export type Plate = keyof typeof PLATES;

const PLATES = {
  rounded: { radius: 7, scale: 0.78 },
  square: { radius: 0, scale: 0.72 },
  maskable: { radius: 0, scale: 0.6 },
} as const;

/** Знак на плашке в SVG со стороной size пикселей. */
export function plateSvg(palette: Palette, size: number, plate: Plate): string {
  const { radius, scale } = PLATES[plate];
  const draw = size <= SMALL_UP_TO ? signSmall : sign;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${GRID} ${GRID}" fill="none">` +
    `<rect width="${GRID}" height="${GRID}" rx="${radius}" fill="${palette.bg}"/>` +
    draw(GRID / 2, GRID / 2, scale, { ring: palette.fg, accent: palette.accent }) +
    '\n</svg>\n'
  );
}

/** Знак на плашке в PNG со стороной size пикселей. */
export const platePng = (palette: Palette, size: number, plate: Plate): Promise<Buffer> =>
  sharp(Buffer.from(plateSvg(palette, size, plate))).resize(size, size).png().toBuffer();

/**
 * Файл .ico из готовых PNG. Формат — заголовок, по записи каталога на картинку
 * и сами картинки; PNG внутри .ico понимают все браузеры, которым он ещё нужен.
 */
export function ico(images: { size: number; data: Buffer }[]): Buffer {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(1, 2); // тип: иконка
  header.writeUInt16LE(images.length, 4);

  let offset = header.length + 16 * images.length;
  const entries = images.map(({ size, data }) => {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size % 256, 0); // 256 записывается нулём
    entry.writeUInt8(size % 256, 1);
    entry.writeUInt16LE(1, 4); // цветовых плоскостей
    entry.writeUInt16LE(32, 6); // бит на пиксель
    entry.writeUInt32LE(data.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += data.length;
    return entry;
  });
  return Buffer.concat([header, ...entries, ...images.map((image) => image.data)]);
}

/** Размеры внутри favicon.ico. */
export const ICO_SIZES = [16, 32, 48] as const;

/** Иконки для манифеста и домашнего экрана: имя файла, сторона и вид плашки. */
export const APP_ICONS = [
  { file: 'apple-touch-icon.png', size: 180, plate: 'square' },
  { file: 'icon-192.png', size: 192, plate: 'rounded' },
  { file: 'icon-512.png', size: 512, plate: 'rounded' },
  { file: 'icon-maskable-512.png', size: 512, plate: 'maskable' },
] as const satisfies readonly { file: string; size: number; plate: Plate }[];
