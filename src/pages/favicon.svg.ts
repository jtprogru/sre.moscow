import type { APIRoute } from 'astro';

import { faviconSvg } from '../brand/favicons';
import { THEMES } from '../brand/palette';

// Фавикон для вкладки: малый знак, цвета из tokens.css, тёмная тема внутри файла.

export const GET: APIRoute = () =>
  new Response(faviconSvg(THEMES.light, THEMES.dark), { headers: { 'Content-Type': 'image/svg+xml; charset=utf-8' } });
