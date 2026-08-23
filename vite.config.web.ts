import { defineConfig } from 'vite'

/** Веб-сборка для хостинга: картинки отдельными файлами, грузятся по мере надобности. */
export default defineConfig({
  base: './',
  build: {
    outDir: 'dist-web',
    assetsInlineLimit: 4096,
    // WebView в Telegram отстаёт от десктопных браузеров, особенно на iOS:
    // при слишком свежем синтаксисе бандл не разбирается и экран остаётся пустым.
    target: ['es2020', 'chrome87', 'safari14'],
  },
})
