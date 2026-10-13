// Тесты фото в профиле: что считается картинкой, что уходит на сайт и как
// выглядят инициалы, когда фото нет.
//
//   bun test tools/

import { afterAll, beforeAll, expect, spyOn, test } from 'bun:test';
import sharp from 'sharp';

import { PHOTO_SIZES, initials, loadPhoto, photoPath, renderPhoto } from '../src/lib/photo.ts';

const canvas = (width, height) => sharp({ create: { width, height, channels: 3, background: '#1e66f5' } });

let server;
let warn;
const hits = new Map();
// Адрес цифрами: localhost на части машин сначала разрешается в ::1, а сервер слушает IPv4.
const address = (path) => `http://127.0.0.1:${server.port}${path}`;

beforeAll(async () => {
  const landscape = await canvas(300, 200).png().toBuffer();
  const tagged = await canvas(64, 64).jpeg().withExif({ IFD0: { Copyright: 'секрет' } }).toBuffer();
  const routes = {
    '/landscape.png': () => new Response(landscape, { headers: { 'content-type': 'image/png' } }),
    '/tagged.jpg': () => new Response(tagged, { headers: { 'content-type': 'image/jpeg' } }),
    '/page.html': () => new Response('<html></html>', { headers: { 'content-type': 'text/html' } }),
    // Заголовок врёт про тип: формат определяется по содержимому.
    '/vector.png': () => new Response('<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"/>', { headers: { 'content-type': 'image/png' } }),
    '/huge.jpg': () => new Response(new Uint8Array(6 * 1024 * 1024), { headers: { 'content-type': 'image/jpeg' } }),
  };
  server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch(request) {
      const { pathname } = new URL(request.url);
      hits.set(pathname, (hits.get(pathname) ?? 0) + 1);
      return routes[pathname]?.() ?? new Response('нет такого', { status: 404 });
    },
  });
  warn = spyOn(console, 'warn').mockImplementation(() => {});
});

afterAll(() => {
  server.stop(true);
  warn.mockRestore();
});

test('картинка превращается в квадратный WebP каждого размера', async () => {
  const source = await loadPhoto(address('/landscape.png'));
  expect(warn.mock.calls).toEqual([]); // если не загрузилось, причина видна здесь
  expect(source).not.toBeNull();

  for (const [size, side] of Object.entries(PHOTO_SIZES)) {
    const { format, width, height } = await sharp(await renderPhoto(source, size)).metadata();
    expect({ size, format, width, height }).toEqual({ size, format: 'webp', width: side, height: side });
  }
});

test('EXIF исходника на сайт не попадает', async () => {
  const source = await loadPhoto(address('/tagged.jpg'));
  expect((await sharp(source).metadata()).exif).toBeDefined();
  expect((await sharp(await renderPhoto(source, 'card')).metadata()).exif).toBeUndefined();
});

test.each([
  ['/missing.png', 'сервер ответил 404'],
  ['/page.html', 'это не картинка'],
  ['/vector.png', 'формат svg'],
  ['/huge.jpg', 'больше 5 МБ'],
])('%s не загружается, причина попадает в журнал', async (path, reason) => {
  warn.mockClear();
  expect(await loadPhoto(address(path))).toBeNull();
  expect(warn).toHaveBeenCalledTimes(1);
  expect(warn.mock.calls[0][0]).toContain(address(path));
  expect(warn.mock.calls[0][0]).toContain(reason);
});

test('один адрес скачивается один раз за сборку', async () => {
  const url = address('/landscape.png?again');
  const [first, second] = await Promise.all([loadPhoto(url), loadPhoto(url)]);
  expect(await loadPhoto(url)).toBe(first);
  expect(second).toBe(first);
  expect(hits.get('/landscape.png')).toBe(2); // этот тест и первый, с другим адресом
});

test('адрес файла собирается из id профиля и размера', () => {
  expect(photoPath('ivan-petrov', 'card')).toBe('/people/ivan-petrov/photo-128.webp');
  expect(photoPath('ivan-petrov', 'profile')).toBe('/people/ivan-petrov/photo-384.webp');
});

test.each([
  ['Михаил Савин', 'МС'],
  ['иван', 'И'],
  ['Анна-Мария фон Берг', 'АФ'],
  ['  «Мишка» на сервере ', 'МН'],
  ['jtprogru', 'J'],
  ['—', ''],
])('инициалы: %s → %s', (name, expected) => {
  expect(initials(name)).toBe(expected);
});
