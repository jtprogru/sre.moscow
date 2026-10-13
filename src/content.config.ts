import { defineCollection, reference } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

import { topicIds } from './lib/topics';

// Единственное место, где описана форма данных. Одна запись — один YAML-файл
// в data/<коллекция>/, имя файла становится id записи.
//
// Здесь проверяется то, что видно в одной записи: типы, перечисления,
// обязательные поля, длины. Всё, для чего нужны соседние записи или сравнение
// полей между собой — дубли URL, порядок дат, живые ссылки на другие
// коллекции, — проверяет tools/check-data.mjs: reference() существование
// записи не проверяет, он только превращает строку в { collection, id }.
//
// Объекты строгие: опечатка в имени ключа валит сборку, а не теряется молча.

const collection = (name: string) => glob({ base: `./data/${name}`, pattern: '*.yaml' });

// ── Общие поля ──────────────────────────────────────────────────────────────

const url = z.url({ protocol: /^https?$/, error: 'нужен полный адрес с https://' });

// Картинку по этой ссылке скачивает сборка, поэтому только https.
const httpsUrl = z.url({ protocol: /^https$/, error: 'нужен адрес картинки с https://' });

const lang = z.enum(['ru', 'en']);

const topics = z
  .array(z.enum(topicIds, { error: 'темы нет в data/topics.yaml' }))
  .min(1, 'нужна хотя бы одна тема')
  .refine((list) => new Set(list).size === list.length, 'темы повторяются');

const status = z.enum(['active', 'quiet', 'archived']).default('active');

const format = z.enum(['offline', 'online', 'hybrid']);

// YAML-парсер Astro превращает дату без кавычек в объект Date. Для календарной
// даты это безвредно: полночь UTC однозначно возвращается в ГГГГ-ММ-ДД, и
// кавычки можно не ставить. Дата со временем в такое поле не пройдёт: она
// остаётся полной ISO-строкой и не совпадает с форматом.
const calendarDate = z.preprocess(
  (value) => {
    if (!(value instanceof Date)) return value;
    const iso = value.toISOString();
    return iso.endsWith('T00:00:00.000Z') ? iso.slice(0, 10) : iso;
  },
  z.iso.date('дата в формате ГГГГ-ММ-ДД'),
);

// Момент события: либо календарная дата (событие на весь день), либо дата и
// время со смещением. Со временем без кавычек нельзя: парсер приведёт его
// к UTC и смещение пропадёт, а из него сайт берёт местное время события.
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(Z|[+-]\d{2}:\d{2})$/;
const UNQUOTED = Symbol('unquoted');

const moment = z.preprocess(
  (value) => {
    if (!(value instanceof Date)) return value;
    const iso = value.toISOString();
    return iso.endsWith('T00:00:00.000Z') ? iso.slice(0, 10) : UNQUOTED;
  },
  z.unknown().transform((value, ctx): string => {
    if (value === UNQUOTED) {
      ctx.addIssue({
        code: 'custom',
        message: 'время со смещением возьми в кавычки: "2026-11-05T19:00:00+03:00" — без них теряется часовой пояс',
      });
      return z.NEVER;
    }
    const valid =
      typeof value === 'string' &&
      (DATE.test(value) || DATE_TIME.test(value)) &&
      !Number.isNaN(Date.parse(value));
    if (!valid) {
      ctx.addIssue({
        code: 'custom',
        message: 'ожидается ГГГГ-ММ-ДД или "ГГГГ-ММ-ДДTчч:мм:сс+03:00"',
      });
      return z.NEVER;
    }
    return value;
  }),
);

// ── Коллекции ───────────────────────────────────────────────────────────────

const communities = defineCollection({
  loader: collection('communities'),
  schema: z.strictObject({
    title: z.string().min(1),
    kind: z.enum(['chat', 'channel', 'forum', 'podcast', 'newsletter', 'meetup']),
    platform: z.enum(['telegram', 'slack', 'discord', 'youtube', 'vk', 'matrix', 'email', 'web']),
    url,
    lang,
    description: z.string().min(1).max(200),
    topics,
    status,
    /** Когда запись появилась в каталоге. */
    added: calendarDate,
    /** Когда ссылку в последний раз открывали и сверяли. */
    verified: calendarDate,
  }),
});

const talks = defineCollection({
  loader: collection('talks'),
  schema: z.strictObject({
    title: z.string().min(1),
    // Имя — обычная строка: доклад существует и без профиля спикера.
    speakers: z
      .array(z.strictObject({ name: z.string().min(1), person: reference('people').optional() }))
      .min(1),
    event: z.strictObject({ name: z.string().min(1), ref: reference('events').optional() }),
    date: calendarDate,
    lang,
    video: url,
    slides: url.optional(),
    topics,
    level: z.enum(['intro', 'practitioner', 'advanced']),
    /** Одна фраза: зачем это смотреть. Ценность каталога в отборе. */
    why: z.string().min(1).max(200),
    /** Когда запись появилась в каталоге: по этой дате она попадает в RSS. */
    added: calendarDate,
  }),
});

const people = defineCollection({
  loader: collection('people'),
  schema: z.strictObject({
    name: z.string().min(1),
    /** Ссылка на фото. На сайт уходит уменьшенная копия, см. src/lib/photo.ts. */
    photo: httpsUrl.optional(),
    bio: z.string().min(1).max(300),
    topics,
    links: z
      .strictObject({
        telegram: url.optional(),
        github: url.optional(),
        linkedin: url.optional(),
        mastodon: url.optional(),
        youtube: url.optional(),
        site: url.optional(),
      })
      .refine((links) => Object.keys(links).length > 0, 'нужна хотя бы одна ссылка'),
    open_to: z.array(z.enum(['questions', 'mentoring', 'speaking'])).default([]),
    // Обязательное поле: профиль без согласия человека не собирается.
    consent: z.strictObject({ by: z.string().min(1), date: calendarDate }),
  }),
});

const events = defineCollection({
  loader: collection('events'),
  schema: z.strictObject({
    title: z.string().min(1),
    start: moment,
    end: moment.optional(),
    format,
    city: z.string().min(1).optional(),
    /** ISO 3166-1 alpha-2: RU, KZ, DE. */
    country: z.string().regex(/^[A-Z]{2}$/, 'двухбуквенный код страны: RU, KZ, DE').optional(),
    lang,
    url,
    // Название — обычная строка: событие добавляется и без карточки организатора.
    organizer: z.strictObject({
      name: z.string().min(1),
      ref: reference('organizers').optional(),
    }),
    cfp: z.strictObject({ url, deadline: calendarDate }).optional(),
    price: z.enum(['free', 'paid']),
    topics,
    /** Название серии, если событие — очередной выпуск митапа или конференции. */
    series: z.string().min(1).optional(),
    /** Тексты участников о прошедшем событии. Что считается разбором — в CRITERIA.md. */
    recaps: z
      .array(
        z.strictObject({
          title: z.string().min(1),
          url,
          // Имя — обычная строка: разбор добавляется и без профиля автора.
          author: z.strictObject({ name: z.string().min(1), person: reference('people').optional() }),
        }),
      )
      .default([]),
    /** Когда запись появилась в каталоге: по этой дате она попадает в RSS. */
    added: calendarDate,
  }),
});

const organizers = defineCollection({
  loader: collection('organizers'),
  schema: z.strictObject({
    name: z.string().min(1),
    kind: z.enum(['company', 'conference-organizer', 'community']),
    links: z
      .array(
        z.strictObject({
          kind: z.enum(['events', 'recordings', 'announcements', 'cfp']),
          url,
          label: z.string().min(1).optional(),
        }),
      )
      .min(1),
    series: z
      .array(
        z.strictObject({
          name: z.string().min(1),
          url: url.optional(),
          cadence: z.string().min(1).optional(),
        }),
      )
      .default([]),
    formats: z.array(format).min(1),
    cities: z.array(z.string().min(1)).default([]),
    lang,
    topics,
    /** Одна фраза: зачем следить за этим организатором. */
    why: z.string().min(1).max(200),
    status,
    added: calendarDate,
    verified: calendarDate,
  }),
});

export const collections = { communities, talks, people, events, organizers };
