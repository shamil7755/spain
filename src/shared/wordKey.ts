/**
 * Единая нормализация испанского слова — общий ключ для прогресса, картинок и звука.
 *
 * Раньше эта функция была скопирована в четырёх модулях; любое расхождение между
 * копиями приводило бы к тому, что прогресс пишется по одному ключу, а картинка
 * ищется по другому. Менять правила нормализации можно только здесь.
 */
export function normalizeWord(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .replace(/^[!¡¿?]+/gu, '')
    .replace(/[!?.,…]+$/gu, '')
    .trim()
}

/** Имя папки урока в ассетах: 1 → `lesson-01`. */
export function lessonFolderKey(lessonNumber: number): string {
  return `lesson-${String(lessonNumber).padStart(2, '0')}`
}

/** Номер урока из идентификатора темы (`lesson-01` → 1); 0, если формат не подошёл. */
export function lessonNumberFromId(id: string): number {
  const match = /^lesson-(\d+)$/.exec(id)
  return match ? Number(match[1]) : 0
}
