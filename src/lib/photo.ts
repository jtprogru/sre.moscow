// Фото в профиле: в данных лежит ссылка, на сайт уходит уменьшенная копия.
//
// Сборка сама скачивает картинку, обрезает до квадрата и раздаёт со своего
// адреса. Посетитель не ходит на чужой сервер, из файла уходит EXIF, а размер
// не зависит от того, что лежит по ссылке. Если картинка не скачалась, сборка
// не падает: в профиле стоят инициалы, в журнале остаётся строка с причиной.

import sharp from 'sharp';

/** Сторона квадрата в пикселях: в карточке фото стоит в 56 px, в профиле до 128 px. */
export const PHOTO_SIZES = { card: 128, profile: 384 } as const;

export type PhotoSize = keyof typeof PHOTO_SIZES;

export const photoPath = (id: string, size: PhotoSize): string => `/people/${id}/photo-${PHOTO_SIZES[size]}.webp`;

const MAX_BYTES = 5 * 1024 * 1024;
const MAX_PIXELS = 40_000_000;
const TIMEOUT_MS = 10_000;

// Растровые форматы. AVIF библиотека называет heif. SVG сюда не входит:
// это документ со ссылками и скриптами, а не снимок.
const FORMATS = new Set(['jpeg', 'png', 'webp', 'gif', 'heif']);

async function download(url: string): Promise<Buffer> {
  const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), headers: { accept: 'image/*' } });
  if (!response.ok) throw new Error(`сервер ответил ${response.status}`);
  if (!response.body) throw new Error('пустой ответ');

  // Заголовку длины верить нельзя, поэтому считаем сами и обрываем на пороге.
  const chunks: Uint8Array[] = [];
  let size = 0;
  const reader = response.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > MAX_BYTES) {
      await reader.cancel();
      throw new Error('файл больше 5 МБ');
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

async function fetchPhoto(url: string): Promise<Buffer | null> {
  try {
    const source = await download(url);
    const format = await sharp(source, { limitInputPixels: MAX_PIXELS })
      .metadata()
      .then((meta) => meta.format, () => undefined);
    if (!format || !FORMATS.has(format)) {
      throw new Error(`${format ? `формат ${format}` : 'это не картинка'}, нужен JPEG, PNG, WebP, AVIF или GIF`);
    }
    return source;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.warn(`Фото не загрузилось, в профиле будут инициалы: ${url} — ${reason}`);
    return null;
  }
}

// Одна загрузка на адрес за сборку: фото нужно и странице, и эндпоинту с файлами,
// а сборщик может разложить их по разным чанкам.
const CACHE = Symbol.for('sre.moscow/photos');
const store = globalThis as { [CACHE]?: Map<string, Promise<Buffer | null>> };
const cache = (store[CACHE] ??= new Map());

/** Исходная картинка по ссылке из профиля или `null`, если её не удалось получить. */
export function loadPhoto(url: string): Promise<Buffer | null> {
  let photo = cache.get(url);
  if (!photo) {
    photo = fetchPhoto(url);
    cache.set(url, photo);
  }
  return photo;
}

/** Квадрат нужного размера в WebP. Неквадратная картинка обрезается вокруг самого заметного места кадра. */
export const renderPhoto = (source: Buffer, size: PhotoSize): Promise<Buffer> =>
  sharp(source, { limitInputPixels: MAX_PIXELS })
    .autoOrient()
    .resize(PHOTO_SIZES[size], PHOTO_SIZES[size], { fit: 'cover', position: sharp.strategy.attention })
    .webp({ quality: 80 })
    .toBuffer();

/** Инициалы для профиля без фото: первые буквы первых двух слов имени. */
export const initials = (name: string): string =>
  name
    .split(/\s+/)
    .map((word) => word.match(/[\p{L}\p{N}]/u)?.[0] ?? '')
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
