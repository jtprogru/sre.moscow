/*
 * Цветовые роли сайта — из того же файла, которым пользуется вёрстка.
 *
 * Разбирает src/styles/tokens.css и отдаёт значения ролей по темам. Отсюда
 * цвет берут проверка контраста и генераторы картинок: фавиконы и OG красятся
 * тем же --accent, что и ссылки на странице, и разойтись им негде.
 *
 * Читается только базовая палитра — всё до первого @media: блок
 * prefers-contrast переопределяет роли заведомо более контрастными значениями,
 * в картинки он не идёт и отдельной проверки не требует.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const TOKENS_FILE = resolve(dirname(fileURLToPath(import.meta.url)), '../src/styles/tokens.css');

const ROLE = /--([\w-]+):\s*light-dark\(\s*(#[0-9a-f]{6})\s*,\s*(#[0-9a-f]{6})\s*\)/gi;

/**
 * Роли по темам: `{ light: { bg: '#eff1f5', … }, dark: { bg: '#24273a', … } }`.
 *
 * @param {string} css
 * @returns {{ light: Record<string, string>, dark: Record<string, string> }}
 */
export function parseTokens(css) {
  const cut = css.indexOf('@media');
  const base = cut === -1 ? css : css.slice(0, cut);

  /** @type {{ light: Record<string, string>, dark: Record<string, string> }} */
  const themes = { light: {}, dark: {} };
  for (const [, name, light, dark] of base.matchAll(ROLE)) {
    themes.light[name] = light.toLowerCase();
    themes.dark[name] = dark.toLowerCase();
  }
  return themes;
}

export const readTokens = (file = TOKENS_FILE) => parseTokens(readFileSync(file, 'utf8'));

const luminance = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const channel = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/** WCAG contrast ratio двух цветов #rrggbb. */
export const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
