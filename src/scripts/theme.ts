// Тема сайта: три режима — как в системе, светлая, тёмная.
//
// «Как в системе» — это отсутствие выбора: без data-theme на <html> и без
// записи в хранилище страница следует за системной темой сама и меняется
// вместе с ней. Выбор до первой отрисовки применяет инлайн-скрипт в
// src/layouts/Base.astro, здесь — органы управления: кнопка в шапке, которая
// перебирает режимы по кругу, и три подписанных варианта в меню на телефоне.

const MODES = ['system', 'light', 'dark'] as const;
type Mode = (typeof MODES)[number];

const NAME: Record<Mode, string> = { system: 'авто, как в системе', light: 'светлая', dark: 'тёмная' };

const isMode = (value: string): value is Mode => (MODES as readonly string[]).includes(value);

export function initTheme(): void {
  const root = document.documentElement;
  const toggle = document.querySelector<HTMLButtonElement>('[data-theme-toggle]');
  const choices = [...document.querySelectorAll<HTMLInputElement>('[data-theme-choice] input')];
  const metas = [...document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')];
  const colors: Record<string, string> = Object.fromEntries(metas.map((meta) => [meta.dataset.scheme ?? '', meta.content]));

  const mode = (): Mode => (root.dataset.theme === 'light' || root.dataset.theme === 'dark' ? root.dataset.theme : 'system');
  const after = (current: Mode): Mode => MODES[(MODES.indexOf(current) + 1) % MODES.length];

  const sync = () => {
    const current = mode();

    if (toggle) {
      const label = `Тема: ${NAME[current]}. Следующая: ${NAME[after(current)]}`;
      toggle.setAttribute('aria-label', label);
      toggle.title = label;
    }
    for (const choice of choices) choice.checked = choice.value === current;

    // Панель браузера красится в фон страницы. Тема выбрана вручную — цвет
    // один при любой системной теме.
    for (const meta of metas) {
      meta.content = colors[current === 'system' ? (meta.dataset.scheme ?? '') : current] ?? meta.content;
    }
  };

  const set = (next: Mode) => {
    if (next === 'system') delete root.dataset.theme;
    else root.dataset.theme = next;
    try {
      if (next === 'system') localStorage.removeItem('theme');
      else localStorage.setItem('theme', next);
    } catch {
      // Хранилище недоступно — выбор просто не запомнится.
    }
    sync();
  };

  toggle?.addEventListener('click', () => set(after(mode())));
  for (const choice of choices) {
    choice.addEventListener('change', () => {
      if (isMode(choice.value)) set(choice.value);
    });
  }

  sync();
  if (toggle) toggle.hidden = false;
}
