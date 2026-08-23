import type { LessonWordsFile, WordPair } from './lessons/types'

/** Все пары слов урока подряд (порядок групп и записей как в JSON). */
export function flattenLessonWords(lesson: LessonWordsFile): WordPair[] {
  return lesson.groups.flatMap((g) => g.entries)
}
