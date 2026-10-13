import type { APIRoute, GetStaticPaths } from 'astro';
import { getCollection } from 'astro:content';

import { PHOTO_SIZES, loadPhoto, renderPhoto, type PhotoSize } from '../../../lib/photo';

// Уменьшенные копии фото из профилей: /people/<id>/photo-128.webp и photo-384.webp.
// Файлы появляются только у тех, чья картинка скачалась. Остальным страница
// рисует инициалы и сюда не ссылается.

interface Props {
  url: string;
  size: PhotoSize;
}

export const getStaticPaths = (async () => {
  const people = (await getCollection('people')).filter((person) => person.data.photo);
  const loaded = await Promise.all(people.map(async (person) => ((await loadPhoto(person.data.photo!)) ? person : null)));

  return loaded
    .filter((person) => person !== null)
    .flatMap((person) =>
      (Object.keys(PHOTO_SIZES) as PhotoSize[]).map((size) => ({
        params: { id: person.id, size: String(PHOTO_SIZES[size]) },
        props: { url: person.data.photo!, size } satisfies Props,
      })),
    );
}) satisfies GetStaticPaths;

export const GET: APIRoute<Props> = async ({ props }) => {
  const source = await loadPhoto(props.url);
  if (!source) return new Response(null, { status: 404 });
  return new Response(new Uint8Array(await renderPhoto(source, props.size)), { headers: { 'Content-Type': 'image/webp' } });
};
