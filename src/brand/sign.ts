// Знак сайта: кольца Москвы и бюджет ошибок. Внешнее кольцо разомкнуто, короткая
// дуга акцентом — та доля, которую можно потратить.
//
// Геометрия записана один раз. Отсюда знак берут логотип в шапке, глаза совы,
// фавикон и иконки для телефона. Шаблон картинки для соцсетей, tools/og.html,
// пока держит свою копию.
//
// Дуги — обычные пути, без pathLength и штриховки: так знак одинаково рисуют
// браузеры и растеризатор, который делает PNG.

export interface SignColors {
  ring: string;
  accent: string;
}

/** На странице кольца красятся цветом текста, дуга и точка — акцентом. */
const INK: SignColors = { ring: 'currentColor', accent: 'var(--accent)' };

const round = (value: number): number => Number(value.toFixed(3));

/** Дуга окружности по часовой стрелке. from и to — доли оборота от двенадцати часов. */
function arc(cx: number, cy: number, r: number, from: number, to: number): string {
  const at = (turn: number) => `${round(cx + r * Math.sin(2 * Math.PI * turn))} ${round(cy - r * Math.cos(2 * Math.PI * turn))}`;
  return `M${at(from)} A${round(r)} ${round(r)} 0 ${to - from > 0.5 ? 1 : 0} 1 ${at(to)}`;
}

/**
 * Полный знак с центром в точке (cx, cy): от 28 px и крупнее. Сетка знака —
 * 32 × 32, k её масштабирует. Рисуется внутри svg с fill="none".
 */
export const sign = (cx = 16, cy = 16, k = 1, colors: SignColors = INK): string => `
  <path d="${arc(cx, cy, 13 * k, 0, 0.85)}" stroke="${colors.ring}" stroke-width="${round(3 * k)}"/>
  <path d="${arc(cx, cy, 13 * k, 0.875, 0.975)}" stroke="${colors.accent}" stroke-width="${round(3 * k)}"/>
  <circle cx="${cx}" cy="${cy}" r="${round(6.5 * k)}" stroke="${colors.ring}" stroke-width="${round(3 * k)}"/>
  <circle cx="${cx}" cy="${cy}" r="${round(1.75 * k)}" fill="${colors.accent}"/>`;

/**
 * Малый знак для 16–24 px: вкладка браузера и закладки. Штрих толще, разрыв
 * шире, внутреннее кольцо уходит, точка вырастает. В полном знаке на таком
 * размере кольца слипаются, и он читается как мишень.
 */
export const signSmall = (cx = 16, cy = 16, k = 1, colors: SignColors = INK): string => `
  <path d="${arc(cx, cy, 12.5 * k, 0, 0.72)}" stroke="${colors.ring}" stroke-width="${round(4 * k)}"/>
  <path d="${arc(cx, cy, 12.5 * k, 0.78, 0.94)}" stroke="${colors.accent}" stroke-width="${round(4 * k)}"/>
  <circle cx="${cx}" cy="${cy}" r="${round(4.75 * k)}" fill="${colors.accent}"/>`;
