import { sign } from './sign';

// Маскот сайта — сова на дежурстве. Глаза у неё — знак сайта, на груди полоса
// состояний. Сцен две: сова сидит на панели бюджета ошибок и сова одна.
//
// Рисунок собран из простых фигур и красится только токенами, поэтому сам
// меняется вместе с темой. Правила, где и какая сцена стоит, — в BRAND.md.

export interface Scene {
  viewBox: string;
  /** Что видит скринридер вместо рисунка. */
  label: string;
  body: string;
}

const STROKE = 6;

/** Сова в поле 360 × 360, лапы стоят на высоте 306. */
const owl = (): string => {
  const eye = (cx: number) => `<circle cx="${cx}" cy="150" r="44" fill="var(--bg)"/>${sign(cx, 150, 3.05)}`;

  // Полоса состояний на груди: семь столбиков, один короткий и акцентный.
  const bars = Array.from({ length: 7 }, (_, i) => {
    const off = i === 4;
    return `<rect x="${136 + i * 13}" y="${off ? 236 : 226}" width="8" height="${off ? 16 : 26}" rx="2.5" fill="${off ? 'var(--accent)' : 'var(--border-strong)'}"/>`;
  }).join('');

  return `
  <path d="M90 116 L84 56 L140 80 Z M270 116 L276 56 L220 80 Z" fill="var(--bg-elev)" stroke="currentColor" stroke-width="${STROKE}" stroke-linejoin="round"/>
  <path d="M180 58 C258 58 290 118 290 190 C290 256 250 298 180 298 C110 298 70 256 70 190 C70 118 102 58 180 58 Z" fill="var(--bg-elev)" stroke="currentColor" stroke-width="${STROKE}"/>
  <path d="M82 178 C76 222 88 258 112 280 M278 178 C284 222 272 258 248 280" stroke="currentColor" stroke-width="${STROKE}" stroke-linecap="round"/>
  ${eye(132)}${eye(228)}
  <path d="M168 184 L192 184 L180 208 Z" fill="currentColor" stroke="currentColor" stroke-width="5" stroke-linejoin="round"/>
  ${bars}
  <path d="M146 298v8M158 298v8M170 298v8M190 298v8M202 298v8M214 298v8" stroke="currentColor" stroke-width="${STROKE}" stroke-linecap="round"/>`;
};

// Остаток бюджета ошибок по ходу окна, в процентах: медленный расход и два
// инцидента. В конце 42, а окно — семь с половиной миллионов лет: столько
// считал Глубокий Мыслитель из «Автостопом по галактике», прежде чем ответить.
const BUDGET = [100, 99, 98, 97, 96, 95, 94, 93, 72, 70, 69, 68, 67, 66, 65, 64, 54, 52, 51, 50, 49, 48, 47, 46, 45, 44, 44, 43, 43, 42];
const ANSWER = BUDGET[BUDGET.length - 1];
const WINDOW = '7,5 МЛН ЛЕТ';

// Столбики полосы состояний, на которые пришлись инциденты из BUDGET.
const BARS = 20;
const INCIDENTS: Record<number, string> = { 5: 'var(--c-danger)', 10: 'var(--c-warn)' };

/** Панель бюджета ошибок размером w × h, рисуется от нуля. */
const panel = (w: number, h: number): string => {
  const pad = 26;
  const left = pad;
  const right = w - pad;
  const top = 98;
  const bottom = h - 92;

  const x = (i: number) => left + (i / (BUDGET.length - 1)) * (right - left);
  const y = (value: number) => bottom - (value / 100) * (bottom - top);
  const line = BUDGET.map((value, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(value).toFixed(1)}`).join(' ');

  const step = (right - left + 5) / BARS;
  const bars = Array.from({ length: BARS }, (_, i) => {
    const fill = INCIDENTS[i] ?? 'var(--border-strong)';
    return `<rect x="${(left + i * step).toFixed(1)}" y="${bottom + 20}" width="${(step - 5).toFixed(1)}" height="38" rx="3" fill="${fill}"/>`;
  }).join('');

  const mono = 'style="font-family: var(--font-mono)"';

  return `
  <rect width="${w}" height="${h}" rx="16" fill="var(--bg-elev)" stroke="currentColor" stroke-width="${STROKE}"/>
  <text x="${left}" y="44" ${mono} font-size="13" letter-spacing="0.9" fill="var(--fg-muted)">БЮДЖЕТ ОШИБОК</text>
  <text x="${left}" y="66" ${mono} font-size="12" letter-spacing="0.7" fill="var(--fg-subtle)">ОКНО ${WINDOW}</text>
  <text x="${right}" y="68" text-anchor="end" style="font-family: var(--font-sans); font-weight: var(--fw-bold)" font-size="46" letter-spacing="-0.5" fill="currentColor">${ANSWER}%</text>
  <line x1="${left}" x2="${right}" y1="${bottom}" y2="${bottom}" stroke="var(--border-strong)" stroke-width="1.5"/>
  <path d="${line} L${right} ${bottom} L${left} ${bottom} Z" fill="var(--accent-soft)" opacity="0.6"/>
  <path d="${line}" stroke="var(--accent)" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"/>
  <circle cx="${x(BUDGET.length - 1).toFixed(1)}" cy="${y(ANSWER).toFixed(1)}" r="7" fill="var(--bg-elev)" stroke="var(--accent)" stroke-width="4"/>
  ${bars}`;
};

/** Сова сидит на панели бюджета ошибок. Главная на широком экране. */
export const owlOnPanel = (): Scene => {
  const edge = 178; // верхний край панели
  const scale = 0.6;
  return {
    viewBox: '0 0 360 440',
    label: `Сова на дежурстве сидит на панели: бюджета ошибок осталось ${ANSWER} процента, окно — семь с половиной миллионов лет`,
    body: `
  <g transform="translate(6 ${edge})">${panel(348, 256)}</g>
  <g transform="translate(132 ${(edge - 3 - 306 * scale).toFixed(1)}) scale(${scale})">${owl()}</g>`,
  };
};

/** Сова одна. Телефон и страницы, где она встречает читателя: например, 404. */
export const owlAlone = (): Scene => ({
  viewBox: '0 0 360 312',
  label: 'Сова на дежурстве',
  body: `<g transform="translate(0 -40)">${owl()}</g>`,
});
