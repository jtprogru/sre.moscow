// Поиск по каталогу. Модуль общий: страница /search.json собирает записи этой
// формы, окно поиска в браузере готовит из них индекс и ищет по нему.
//
// Движок свой и маленький. У событий, докладов и сообществ нет своих страниц,
// поэтому искать приходится по записям, а не по страницам, и на сотне записей
// один JSON закрывает задачу целиком. Чего он не умеет — словоформы: «инцидент»
// и «инцидентов» связывает только общее начало слова.

/** Каталоги, по которым идёт поиск, в порядке словаря разделов. */
export const SECTIONS = ['talks', 'communities', 'people', 'events', 'organizers'] as const;

export type SectionId = (typeof SECTIONS)[number];

export interface SearchRecord {
  type: SectionId;
  title: string;
  /** Вторая строка результата: дата и место, спикеры, вид площадки. */
  sub: string;
  /** Страница записи или якорь её строки в каталоге. */
  url: string;
  /** По чему запись находится, кроме заголовка и второй строки: темы, организатор, город. */
  words: string;
}

export interface SearchEntry {
  record: SearchRecord;
  title: string[];
  rest: string[];
}

// Совпадение в заголовке весит больше, чем в остальных полях.
const TITLE = 3;
const REST = 1;

/** Слова текста для сопоставления: нижний регистр, «ё» как «е», всё кроме букв и цифр — разделитель. */
export const words = (text: string): string[] =>
  text
    .toLowerCase()
    .replaceAll('ё', 'е')
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);

export const prepare = (records: SearchRecord[]): SearchEntry[] =>
  records.map((record) => ({
    record,
    title: words(record.title),
    rest: words(`${record.sub} ${record.words}`),
  }));

const starts = (list: string[], token: string): boolean => list.some((word) => word.startsWith(token));

/**
 * Записи, в которых каждое слово запроса начинает какое-нибудь слово записи.
 * Сначала те, где больше совпало в заголовке; при равном весе порядок как в индексе.
 */
export function search(index: SearchEntry[], query: string, scope?: SectionId): SearchRecord[] {
  const tokens = words(query);
  if (tokens.length === 0) return [];

  const found: { record: SearchRecord; score: number; position: number }[] = [];

  for (const [position, entry] of index.entries()) {
    if (scope && entry.record.type !== scope) continue;

    let score = 0;
    const matched = tokens.every((token) => {
      if (starts(entry.title, token)) score += TITLE;
      else if (starts(entry.rest, token)) score += REST;
      else return false;
      return true;
    });
    if (matched) found.push({ record: entry.record, score, position });
  }

  return found.sort((a, b) => b.score - a.score || a.position - b.position).map(({ record }) => record);
}
