import type { APIRoute } from 'astro';

import { ICO_SIZES, ico, platePng } from '../brand/favicons';
import { STILL } from '../brand/palette';

// Фавикон для браузеров, которые не берут SVG, и для всего, что по привычке
// спрашивает /favicon.ico. Знак стоит на плашке: темы вкладок файл не знает.

export const GET: APIRoute = async () => {
  const images = await Promise.all(ICO_SIZES.map(async (size) => ({ size, data: await platePng(STILL, size, 'rounded') })));
  return new Response(new Uint8Array(ico(images)), { headers: { 'Content-Type': 'image/x-icon' } });
};
