import settings from './settings.json'
import type { Section1Settings, Section1Topic } from './types'

export type { WordPair, WordGroup, LessonWordsFile } from './lessons'
export { ALL_LESSON_WORDS, getLessonWords } from './lessons'

const cfg: Section1Settings = settings

export function getSection1Panel(): { heading: string; hint: string } {
  return { ...cfg.panel }
}

export function getSection1Topics(): readonly Section1Topic[] {
  const { count, titleFormat } = cfg.topics
  return Array.from({ length: count }, (_, i) => {
    const n = i + 1
    return {
      id: `lesson-${n}`,
      title: titleFormat.replaceAll('{n}', String(n)),
    }
  })
}
