import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// Сайт полностью статический: без адаптера, бэкенда и клиентского фреймворка.
// Деплой — .github/workflows/deploy-site.yml на push в main и раз в сутки.
export default defineConfig({
  site: 'https://sre.moscow',
  trailingSlash: 'always',
  build: {
    format: 'directory',
  },
  integrations: [sitemap()],
});
