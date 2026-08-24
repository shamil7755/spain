import { lessonFolderKey, normalizeWord } from '../shared/wordKey'

/**
 * Картинки уроков лежат в `src/assets/cards/lesson-XX/<слово>.(png|jpg|jpeg|webp)`.
 * Для обратной совместимости поддерживается и старый путь: `src/assets/cards/<слово>.*`.
 */
const modules = import.meta.glob('../assets/cards/**/*.{png,jpg,jpeg,webp}', {
  eager: true,
  import: 'default',
}) as Record<string, string>

function fileStemFromPath(path: string): string {
  const name = path.split('/').pop() ?? ''
  return name.replace(/\.(png|jpg|jpeg|webp)$/i, '').toLowerCase()
}

const BY_LESSON_AND_STEM: Record<string, string> = {}
const BY_STEM: Record<string, string> = {}
for (const path of Object.keys(modules)) {
  const stem = fileStemFromPath(path)
  const url = modules[path]
  const parts = path.split('/')
  const folder = parts[parts.length - 2] ?? ''

  if (folder.startsWith('lesson-') && stem && url) {
    BY_LESSON_AND_STEM[`${folder}/${stem}`] = url
    continue
  }

  if (stem && url) {
    BY_STEM[stem] = url
  }
}

/**
 * @param asset Явное имя файла из `words.json` (поле `asset`) — используется вместо
 *   нормализации `es`, когда слово содержит символы, недопустимые в имени файла
 *   (слэш, пробелы), например «¡Encantado/a!» или «¿Cómo te llamas?».
 */
export function getCardImageSrc(lessonNumber: number, es: string, asset?: string): string | undefined {
  const key = normalizeWord(asset ?? es)
  if (!key) return undefined
  const perLesson = BY_LESSON_AND_STEM[`${lessonFolderKey(lessonNumber)}/${key}`]
  return perLesson ?? BY_STEM[key]
}

/**
 * Картинки уроков весят по 1–2.5 МБ, и в веб-сборке они качаются по сети, а не зашиты
 * в бандл. Без предзагрузки открытие «глаза» показывает белое поле, пока файл ещё едет.
 *
 * Качаем строго по одной: параллельные загрузки отбирают канал у картинки, которая нужна
 * прямо сейчас, а в WebView Telegram число одновременных соединений заметно меньше, чем
 * в браузере. Очередь идёт до конца урока и не ждёт перелистывания карточек.
 */
const preloaded = new Set<string>()

let queue: string[] = []
let isLoading = false

function pump(): void {
  if (isLoading) return

  let next = queue.shift()
  while (next && preloaded.has(next)) next = queue.shift()
  if (!next) return

  const src = next
  preloaded.add(src)
  isLoading = true

  const img = new Image()
  img.decoding = 'async'
  const step = () => {
    isLoading = false
    pump()
  }
  img.addEventListener('load', step, { once: true })
  img.addEventListener('error', step, { once: true })
  img.src = src
}

/** Ставит картинки в очередь предзагрузки в порядке показа; уже скачанные пропускаются. */
export function queueCardImages(sources: (string | undefined)[]): void {
  queue = sources.filter((src): src is string => typeof src === 'string' && !preloaded.has(src))
  pump()
}
