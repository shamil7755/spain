/** Пара «испанский — русский» для карточек */

export type WordPair = {
  es: string
  ru: string
  hint?: string
  /**
   * Явное имя файла картинки/звука (без расширения), когда его нельзя вывести из `es`
   * автоматической нормализацией — например, для фраз со слэшем («¡Encantado/a!») или
   * пробелами («¿Cómo te llamas?»), из которых не получится корректное имя файла.
   */
  asset?: string
}

export type WordGroup = {
  /** Подпись блока на экране (например «Глаголы», «Фразы») */
  label: string
  entries: WordPair[]
}

/** Содержимое `lessons/lesson-XX/words.json` */
export type LessonWordsFile = {
  lessonNumber: number
  groups: WordGroup[]
}
