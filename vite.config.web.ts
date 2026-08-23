import { defineConfig } from 'vite'

/** Веб-сборка для хостинга: картинки отдельными файлами, грузятся по мере надобности. */
export default defineConfig({
  base: './',
  build: {
    outDir: 'dist-web',
    assetsInlineLimit: 4096,
  },
})
