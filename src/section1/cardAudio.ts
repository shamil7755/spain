import { lessonFolderKey, normalizeWord } from '../shared/wordKey'

const modules = import.meta.glob('../assets/audio/**/*.{mp3,wav,ogg,m4a,aac,webm}', {
  eager: true,
  import: 'default',
}) as Record<string, string>

function fileStem(path: string): string {
  const name = path.split('/').pop() ?? ''
  return name.replace(/\.(mp3|wav|ogg|m4a|aac|webm)$/i, '').toLowerCase()
}

const BY_LESSON_AND_STEM: Record<string, string> = {}
const BY_STEM: Record<string, string> = {}
for (const path of Object.keys(modules)) {
  const stem = fileStem(path)
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

/** @param asset см. {@link import('./cardImages').getCardImageSrc} — то же явное имя файла из `words.json`. */
export function getCardAudioSrc(lessonNumber: number, es: string, asset?: string): string | undefined {
  const key = normalizeWord(asset ?? es)
  if (!key) return undefined
  return BY_LESSON_AND_STEM[`${lessonFolderKey(lessonNumber)}/${key}`] ?? BY_STEM[key]
}

let player: HTMLAudioElement | null = null

/**
 * @returns проигрываемый `<audio>`-элемент (чтобы вызывающий мог подписаться на `ended`),
 *   либо `null`, если для слова нет звукового файла — тогда ничего не проигрывается.
 */
export function playCardAudio(lessonNumber: number, es: string, asset?: string): HTMLAudioElement | null {
  const src = getCardAudioSrc(lessonNumber, es, asset)
  if (!src) return null
  if (!player) {
    player = new Audio()
    player.preload = 'auto'
  }
  player.pause()
  player.src = src
  player.currentTime = 0
  void player.play().catch(() => {})
  return player
}
