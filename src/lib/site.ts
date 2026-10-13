// Всё, что относится к сайту целиком и встречается больше чем на одной странице.

// Канон слов. Название, дескриптор, слоган и заявление о независимости набраны
// один раз — здесь. Страницы, подвал, <title> и картинки берут их отсюда, а
// tools/check-copy.mjs сверяет с этим файлом README.md, package.json и dist/.
// Меняешь формулировку — меняй её здесь, проверка покажет, где ещё поправить.
const descriptor = 'каталог SRE-сообщества';

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

export const SITE = {
  name: 'sre.moscow',
  url: 'https://sre.moscow',
  // Чем сайт себя называет. Вместе с названием даёт <title> главной.
  descriptor,
  // Заголовок главной и картинки для соцсетей. Последнее слово красится акцентом.
  slogan: 'Где говорят про надёжность',
  description: `${capitalize(descriptor)}: чаты и каналы, доклады с записями, люди, к которым можно обратиться, календарь мероприятий и организаторы, за которыми стоит следить.`,
  // Независимость значит «ни одной компании», а не «ничей»: кто ведёт каталог
  // и куда ведёт главная кнопка, сказано в последнем уточнении.
  independence: {
    // Подвал каждой страницы, картинка главной, README.
    short: 'Независимое сообщество инженеров. Не принадлежит ни одной компании и никем не спонсируется.',
    // Вместе с короткой формой — полная: /contribute/, README, BRAND.md.
    details: [
      'Место в каталоге не продаётся.',
      'Мейнтейнеры участвуют как частные лица.',
      'Каталог ведёт автор блога «Мишка на сервере», и главная кнопка сайта ведёт в его чат.',
    ],
  },
  repo: 'https://github.com/jtprogru/sre.moscow',
  // Главная кнопка сайта. Если url пустой, кнопка ведёт в раздел сообществ:
  // лучше честный каталог, чем ссылка-заглушка.
  chat: {
    title: 'Bear Chat',
    url: 'https://t.me/jtprogru_chat',
  },
} as const;

export const REPO = {
  issues: `${SITE.repo}/issues/new/choose`,
  issue: (template: string) => `${SITE.repo}/issues/new?template=${template}.yml`,
  file: (path: string) => `${SITE.repo}/blob/main/${path}`,
  tree: (path: string) => `${SITE.repo}/tree/main/${path}`,
} as const;

// Словарь разделов: так они названы в меню, в <title> и в заголовке страницы.
// heading нужен, только когда заголовок страницы отличается от пункта меню.
// icon — имя из src/lib/icons.ts: по нему раздел узнаётся в результатах поиска.
// menu: false убирает раздел из верхнего меню и из меню на телефоне; в подвале,
// в поиске и на странице 404 он остаётся.
//
// Порядок значим. Впереди то, что каталог отбирает сам и чего не соберёт
// автоматическая афиша: доклады с причиной посмотреть, сообщества, люди.
// События идут после: сайт — не календарь, и первым пунктом они делали его им.
export const NAV = [
  { href: '/talks/', label: 'Доклады', icon: 'presentation' },
  { href: '/communities/', label: 'Сообщества', icon: 'messages-square' },
  { href: '/people/', label: 'Люди', icon: 'users' },
  { href: '/events/', label: 'События', icon: 'calendar' },
  { href: '/organizers/', label: 'Организаторы', icon: 'megaphone', menu: false },
  { href: '/contribute/', label: 'Участвовать', icon: 'circle-plus', heading: 'Как участвовать' },
] as const;

type NavItem = (typeof NAV)[number];

/** Пункты верхнего меню и меню на телефоне. К организаторам ведут события, поиск и подвал. */
export const MENU = NAV.filter((item) => !('menu' in item) || item.menu);

/** Заголовок страницы раздела — он же её <title> без названия сайта. */
export const heading = (href: NavItem['href']): string => {
  const item: NavItem = NAV.find((entry) => entry.href === href)!;
  return 'heading' in item ? item.heading : item.label;
};
