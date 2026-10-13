import type { APIRoute } from 'astro';

import { APP_ICONS } from '../brand/favicons';
import { STILL } from '../brand/palette';
import { SITE } from '../lib/site';

// Манифест нужен ради иконки и названия, когда сайт добавляют на домашний экран.
// Приложением сайт не притворяется: открывается в обычном браузере.

export const GET: APIRoute = () => {
  const manifest = {
    name: SITE.name,
    short_name: SITE.name,
    description: `${SITE.name} — ${SITE.descriptor}. ${SITE.slogan}`,
    lang: 'ru',
    start_url: '/',
    display: 'browser',
    background_color: STILL.bg,
    theme_color: STILL.bg,
    icons: APP_ICONS.filter(({ file }) => file.startsWith('icon-')).map(({ file, size, plate }) => ({
      src: `/${file}`,
      sizes: `${size}x${size}`,
      type: 'image/png',
      purpose: plate === 'maskable' ? 'maskable' : 'any',
    })),
  };
  return new Response(JSON.stringify(manifest, null, 2), { headers: { 'Content-Type': 'application/manifest+json; charset=utf-8' } });
};
