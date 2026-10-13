// Подписи для значений перечислений из src/content.config.ts. В данных живут
// короткие латинские id, читатель видит русский текст.

export const LANG = { ru: 'на русском', en: 'на английском' } as const;
export const LANG_SHORT = { ru: 'RU', en: 'EN' } as const;

export const FORMAT = { offline: 'очно', online: 'онлайн', hybrid: 'очно и онлайн' } as const;

export const PRICE = { free: 'бесплатно', paid: 'платно' } as const;

export const LEVEL = {
  intro: 'для начинающих',
  practitioner: 'для практиков',
  advanced: 'для опытных',
} as const;

export const STATUS = { active: 'живое', quiet: 'затихло', archived: 'архив' } as const;

export const COMMUNITY_KIND = {
  chat: 'чат',
  channel: 'канал',
  forum: 'форум',
  podcast: 'подкаст',
  newsletter: 'рассылка',
  meetup: 'митап-группа',
} as const;

export const PLATFORM = {
  telegram: 'Telegram',
  slack: 'Slack',
  discord: 'Discord',
  youtube: 'YouTube',
  vk: 'VK',
  matrix: 'Matrix',
  email: 'почта',
  web: 'сайт',
} as const;

export const ORGANIZER_KIND = {
  company: 'компания',
  'conference-organizer': 'организатор конференций',
  community: 'сообщество',
} as const;

export const LINK_KIND = {
  events: 'События',
  recordings: 'Записи докладов',
  announcements: 'Анонсы',
  cfp: 'Приём заявок',
} as const;

export const OPEN_TO = {
  questions: 'можно спросить',
  mentoring: 'менторит',
  speaking: 'выступает',
} as const;

export const PERSON_LINK = {
  telegram: 'Telegram',
  github: 'GitHub',
  linkedin: 'LinkedIn',
  mastodon: 'Mastodon',
  youtube: 'YouTube',
  site: 'Сайт',
} as const;

/** Русское название страны по коду ISO 3166-1 alpha-2. */
const regions = new Intl.DisplayNames('ru', { type: 'region' });
export const countryName = (code: string): string => regions.of(code) ?? code;
