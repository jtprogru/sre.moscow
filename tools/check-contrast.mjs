#!/usr/bin/env node
/*
 * Проверка контраста цветовых ролей ≥ WCAG AA.
 *
 * Берёт роли из src/styles/tokens.css (разбор — в tools/tokens.mjs) и считает
 * WCAG contrast ratio для каждой пары «текст / фон», которой сайт действительно
 * набирает текст, и для акцента там, где он работает графикой. Падает с кодом 1,
 * если хоть одна пара ниже порога.
 *
 * По образцу mishka-ds/scripts/check-contrast.mjs: значения ролей приехали
 * оттуда вместе с правками контраста, и эта проверка не даёт им разойтись
 * при правке палитры. Зависимостей нет: формула WCAG детерминирована.
 *
 *   node tools/check-contrast.mjs
 */

import process from 'node:process';

import { contrast, readTokens } from './tokens.mjs';

const AA_NORMAL = 4.5; // текст любого размера: акцент один, поблажки для крупного нет
const AA_GRAPHIC = 3.0; // графика и границы элементов управления, WCAG 1.4.11

const themes = readTokens();

// Только те сочетания, которые есть в src/styles/global.css. Новая пара
// «текст на фоне» в стилях — новая строка здесь.
const pairs = [
  ['fg', 'bg', 'основной текст / фон страницы', AA_NORMAL],
  ['fg', 'bg-elev', 'основной текст / карточка', AA_NORMAL],
  ['fg-muted', 'bg', 'подписи / фон страницы', AA_NORMAL],
  ['fg-muted', 'bg-elev', 'подписи / карточка', AA_NORMAL],
  ['fg-muted', 'bg-sunken', 'метка темы', AA_NORMAL],
  ['fg-subtle', 'bg', 'тихие подписи / фон страницы', AA_NORMAL],
  ['fg-subtle', 'bg-elev', 'тихие подписи / карточка', AA_NORMAL],
  ['accent', 'bg', 'ссылка / фон страницы', AA_NORMAL],
  ['accent', 'bg-elev', 'ссылка / карточка', AA_NORMAL],
  ['accent-hover', 'bg', 'ссылка при наведении / фон', AA_NORMAL],
  ['on-accent', 'accent', 'текст кнопки / заливка акцентом', AA_NORMAL],
  ['on-accent', 'accent-hover', 'текст кнопки при наведении', AA_NORMAL],
  ['code-fg', 'code-bg', 'код / подложка кода', AA_NORMAL],
  ['code-fg', 'code-inline-bg', 'код в строке', AA_NORMAL],
  ['c-tip-text', 'bg-elev', 'значок «можно» / карточка', AA_NORMAL],
  ['c-tip-text', 'bg', 'значок «можно» / фон страницы', AA_NORMAL],
  ['c-warn-text', 'bg-elev', 'значок «затихло» / карточка', AA_NORMAL],
  ['c-warn-text', 'bg', 'значок «затихло» / фон страницы', AA_NORMAL],
  ['c-danger-text', 'bg-elev', 'значок ошибки / карточка', AA_NORMAL],
  ['fg', 'accent-soft', 'выбранная область поиска', AA_NORMAL],
  // Акцент как графика: дуга знака, подчёркивание пункта меню, рамка при
  // наведении и у :target, обводка фокуса. На утопленном фоне текстом он не
  // работает (в светлой теме ниже 4.5), а рамкой и обводкой — должен.
  ['accent', 'bg', 'акцент как графика / фон страницы', AA_GRAPHIC],
  ['accent', 'bg-elev', 'акцент как графика / карточка', AA_GRAPHIC],
  ['accent', 'bg-sunken', 'акцент как графика / метка', AA_GRAPHIC],
];

let failed = 0;

for (const [theme, vars] of Object.entries(themes)) {
  console.log(`\n=== ${theme} ===`);
  for (const [fgName, bgName, label, threshold] of pairs) {
    const fg = vars[fgName];
    const bg = vars[bgName];
    if (!fg || !bg) {
      console.log(`  ⚠ ${label}: роли нет в tokens.css (--${fgName}=${fg}, --${bgName}=${bg})`);
      failed += 1;
      continue;
    }
    const ratio = contrast(fg, bg);
    const ok = ratio >= threshold;
    if (!ok) failed += 1;
    const level = threshold === AA_GRAPHIC ? 'AA графика' : 'AA';
    console.log(
      `  ${ok ? '✓' : '✗'} ${label.padEnd(34)} ${fg} на ${bg}  ${ratio.toFixed(2)}:1  ${level}${ok ? '' : `  ниже ${threshold}`}`,
    );
  }
}

if (failed) {
  console.error(`\n✗ ${failed} пар(а) ниже порога. Правь src/styles/tokens.css.`);
  process.exit(1);
}
console.log('\n✓ Все пары проходят порог WCAG.');
