import type { LessonWordsFile } from './types'
import l01 from './lesson-01/words.json'
import l02 from './lesson-02/words.json'
import l03 from './lesson-03/words.json'
import l04 from './lesson-04/words.json'
import l05 from './lesson-05/words.json'
import l06 from './lesson-06/words.json'
import l07 from './lesson-07/words.json'
import l08 from './lesson-08/words.json'
import l09 from './lesson-09/words.json'
import l10 from './lesson-10/words.json'
import l11 from './lesson-11/words.json'
import l12 from './lesson-12/words.json'
import l13 from './lesson-13/words.json'
import l14 from './lesson-14/words.json'
import l15 from './lesson-15/words.json'
import l16 from './lesson-16/words.json'

/** Все уроки по порядку — нужен явный экспорт, чтобы JSON попадал в офлайн-бандл. */
export const ALL_LESSON_WORDS: readonly LessonWordsFile[] = [
  l01 as LessonWordsFile,
  l02 as LessonWordsFile,
  l03 as LessonWordsFile,
  l04 as LessonWordsFile,
  l05 as LessonWordsFile,
  l06 as LessonWordsFile,
  l07 as LessonWordsFile,
  l08 as LessonWordsFile,
  l09 as LessonWordsFile,
  l10 as LessonWordsFile,
  l11 as LessonWordsFile,
  l12 as LessonWordsFile,
  l13 as LessonWordsFile,
  l14 as LessonWordsFile,
  l15 as LessonWordsFile,
  l16 as LessonWordsFile,
]

/** Слова урока по номеру 1…16 (папки `lesson-01` … `lesson-16`). */
export function getLessonWords(lessonNumber: number): LessonWordsFile | undefined {
  if (!Number.isInteger(lessonNumber) || lessonNumber < 1 || lessonNumber > ALL_LESSON_WORDS.length) {
    return undefined
  }
  return ALL_LESSON_WORDS[lessonNumber - 1]
}
