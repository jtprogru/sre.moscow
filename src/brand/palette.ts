// Цвета тем для всего, что рисуется при сборке: панель браузера, фавикон,
// иконки. Источник один — src/styles/tokens.css, разбирает его тот же код,
// которым пользуется проверка контраста.

import { parseTokens } from '../../tools/tokens.mjs';
import tokens from '../styles/tokens.css?raw';
import type { Palette } from './favicons';

/** Роли, без которых знак не нарисовать. Пропала роль из tokens.css — сборка падает здесь, а не рисует пустоту. */
function palette(theme: string, roles: Record<string, string>): Palette {
  const { bg, fg, accent } = roles;
  if (!bg || !fg || !accent) throw new Error(`tokens.css: в теме ${theme} нет одной из ролей --bg, --fg, --accent`);
  return { bg, fg, accent };
}

const roles = parseTokens(tokens);

export const THEMES = { light: palette('light', roles.light), dark: palette('dark', roles.dark) };

/**
 * Тема картинок, которые не умеют переключаться: PNG-иконки и манифест.
 * Тёмная плашка видна и на светлой, и на тёмной полосе вкладок.
 */
export const STILL = THEMES.dark;
