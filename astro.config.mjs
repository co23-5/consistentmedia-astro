// @ts-check
import { defineConfig } from 'astro/config';

import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';
import mdx from '@astrojs/mdx';

// https://astro.build/config
// Reines Static-Astro (kein Adapter). Formular-Endpoint und Preview-Passwort
// laufen als native Vercel-Function bzw. Vercel-Edge-Middleware (siehe /api und
// /middleware.ts), unabhaengig vom Astro-Build.
export default defineConfig({
  site: 'https://consistentmedia.de',
  output: 'static',
  trailingSlash: 'never',

  build: {
    inlineStylesheets: 'auto',
  },

  vite: {
    plugins: [tailwindcss()]
  },

  integrations: [sitemap(), mdx()],
});