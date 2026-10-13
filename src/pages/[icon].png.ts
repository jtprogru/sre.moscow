import type { APIRoute, GetStaticPaths } from 'astro';

import { APP_ICONS, platePng, type Plate } from '../brand/favicons';
import { STILL } from '../brand/palette';

// Иконки для домашнего экрана и манифеста: apple-touch-icon.png, icon-192.png,
// icon-512.png и icon-maskable-512.png. Список — в src/brand/favicons.ts.

interface Props {
  size: number;
  plate: Plate;
}

export const getStaticPaths = (() =>
  APP_ICONS.map(({ file, size, plate }) => ({
    params: { icon: file.replace(/\.png$/, '') },
    props: { size, plate } satisfies Props,
  }))) satisfies GetStaticPaths;

export const GET: APIRoute<Props> = async ({ props }) =>
  new Response(new Uint8Array(await platePng(STILL, props.size, props.plate)), { headers: { 'Content-Type': 'image/png' } });
