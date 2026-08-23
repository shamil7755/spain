import { fetchProgress, isOfflineBuild, pushProgress } from './api'
import { hydrateProgress, onProgressSaved, snapshotProgress } from '../section3/progress'
import {
  getVisibilityPrefs,
  hydrateVisibilityPrefs,
  onPrefsSaved,
} from '../section1/visibilityPrefs'

/** Пауза перед отправкой: во время урока ответы идут пачками, шлём один раз в конце. */
const PUSH_DELAY_MS = 1500

let timer: ReturnType<typeof setTimeout> | null = null
let pending = false

function schedulePush(): void {
  pending = true
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => void flush(), PUSH_DELAY_MS)
}

async function flush(): Promise<void> {
  if (!pending) return
  pending = false
  if (timer) {
    clearTimeout(timer)
    timer = null
  }

  await pushProgress({
    progress: snapshotProgress() as unknown as Record<string, unknown>,
    prefs: getVisibilityPrefs() as unknown as Record<string, unknown>,
  })
}

/** Тянет прогресс с сервера до первой отрисовки, иначе счётчики уроков мигнут старыми. */
export async function hydrateFromServer(): Promise<void> {
  if (isOfflineBuild) return

  const res = await fetchProgress()
  if (!res.ok || !res.data.data) return

  hydrateProgress(res.data.data.progress)
  hydrateVisibilityPrefs(res.data.data.prefs)
}

export function startProgressSync(): void {
  if (isOfflineBuild) return

  onProgressSaved(schedulePush)
  onPrefsSaved(schedulePush)

  // Уход со страницы — досылаем то, что не успело уйти по таймеру.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void flush()
  })
  window.addEventListener('pagehide', () => void flush())
}
