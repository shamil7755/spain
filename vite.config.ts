import { defineConfig } from 'vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

/** Один HTML со встроенными CSS/JS — открытие офлайн через file:// */
export default defineConfig({
  base: './',
  plugins: [viteSingleFile()],
})
