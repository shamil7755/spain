import { ALL_LESSON_WORDS } from '../section1/lessons'
import { normalizeWord } from '../shared/wordKey'

// Только 'know' и 'learn' приходят из UI (кнопка/свайп «повторить» была убрана из интерфейса).
type AttemptKind = 'know' | 'learn'
type CategoryId = 'all' | 'easy' | 'medium' | 'hard' | 'favorites'
export type MasteryCategory = 'easy' | 'medium' | 'hard'

type WordProgress = {
  seen: boolean
  seenCount: number
  knowCount: number
  learnCount: number
  consecutiveKnow: number
  mastered: boolean
  masteryCategory?: MasteryCategory
  wrongBeforeMastery: number
  isFavorite: boolean
  attempts: AttemptKind[]
}

type ProgressState = Record<string, WordProgress>

export type WordCategoryItem = {
  lessonNumber: number
  es: string
  ru: string
  asset?: string
  hint?: string
  key: string
  category: CategoryId
  isFavorite: boolean
}

const STORAGE_KEY = 'mnemonic-progress-v1'

function toWordKey(lessonNumber: number, es: string): string {
  return `${lessonNumber}:${normalizeWord(es)}`
}

// Прогресс живёт только в рамках одной вкладки браузера, поэтому спокойно держим его
// разобранным в памяти и читаем localStorage только один раз за сессию — раньше каждый
// показ или ответ на карточку заново парсил весь JSON.
let cache: ProgressState | null = null

function loadState(): ProgressState {
  if (cache) return cache
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed = raw ? (JSON.parse(raw) as ProgressState) : {}
    cache = parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    cache = {}
  }
  return cache
}

function saveState(state: ProgressState): void {
  cache = state
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Приватный режим, заполненная квота или заблокированное хранилище (в т.ч. на file://) —
    // прогресс останется доступен из памяти на время сессии, но не переживёт перезагрузку.
  }
}

function ensureWord(state: ProgressState, key: string): WordProgress {
  if (!state[key]) {
    state[key] = {
      seen: false,
      seenCount: 0,
      knowCount: 0,
      learnCount: 0,
      consecutiveKnow: 0,
      mastered: false,
      masteryCategory: undefined,
      wrongBeforeMastery: 0,
      isFavorite: false,
      attempts: [],
    }
  }
  return state[key]
}

export type WordProgressSnapshot = {
  seenCount: number
  knowCount: number
  learnCount: number
  consecutiveKnow: number
  mastered: boolean
  masteryCategory?: MasteryCategory
}

function toSnapshot(item: WordProgress): WordProgressSnapshot {
  return {
    seenCount: item.seenCount,
    knowCount: item.knowCount,
    learnCount: item.learnCount,
    consecutiveKnow: item.consecutiveKnow,
    mastered: item.mastered,
    masteryCategory: item.masteryCategory,
  }
}

function masteryCategoryByWrongAnswers(wrongBeforeMastery: number): MasteryCategory {
  if (wrongBeforeMastery <= 1) return 'easy'
  if (wrongBeforeMastery <= 3) return 'medium'
  return 'hard'
}

export function markWordSeen(lessonNumber: number, es: string): WordProgressSnapshot {
  const key = toWordKey(lessonNumber, es)
  const state = loadState()
  const item = ensureWord(state, key)
  item.seen = true
  item.seenCount += 1
  saveState(state)
  return toSnapshot(item)
}

export function recordWordAttempt(
  lessonNumber: number,
  es: string,
  kind: AttemptKind
): WordProgressSnapshot {
  const key = toWordKey(lessonNumber, es)
  const state = loadState()
  const item = ensureWord(state, key)

  // seenCount уже увеличен в markWordSeen при показе этой же карточки — здесь его
  // не трогаем, чтобы не считать один просмотр дважды.
  item.seen = true
  item.attempts.push(kind)
  if (item.attempts.length > 12) {
    item.attempts = item.attempts.slice(-12)
  }

  if (kind === 'know') {
    item.knowCount += 1
    item.consecutiveKnow += 1
  } else {
    item.learnCount += 1
    item.consecutiveKnow = 0
    if (!item.mastered) item.wrongBeforeMastery += 1
  }

  if (!item.mastered && item.consecutiveKnow >= 3) {
    item.mastered = true
    item.masteryCategory = masteryCategoryByWrongAnswers(item.wrongBeforeMastery)
  }

  saveState(state)
  return toSnapshot(item)
}

function categoryOfProgress(item: WordProgress): CategoryId {
  if (item.mastered) {
    return item.masteryCategory ?? 'easy'
  }
  return 'all'
}

export function getCategoryWords(category: CategoryId): WordCategoryItem[] {
  const state = loadState()
  const out: WordCategoryItem[] = []

  for (const lesson of ALL_LESSON_WORDS) {
    for (const group of lesson.groups) {
      for (const word of group.entries) {
        const key = toWordKey(lesson.lessonNumber, word.es)
        const progress = state[key]
        if (!progress?.seen) continue

        const itemCategory = categoryOfProgress(progress)
        const matchCategory =
          category === 'all'
            ? true
            : category === 'favorites'
              ? progress.isFavorite
              : category === itemCategory
        if (matchCategory) {
          out.push({
            lessonNumber: lesson.lessonNumber,
            es: word.es,
            ru: word.ru,
            asset: word.asset,
            hint: word.hint,
            key,
            category: itemCategory,
            isFavorite: progress.isFavorite,
          })
        }
      }
    }
  }

  return out
}

export function isWordMastered(lessonNumber: number, es: string): boolean {
  const state = loadState()
  const key = toWordKey(lessonNumber, es)
  return Boolean(state[key]?.mastered)
}

export function toggleFavoriteByKey(key: string): boolean {
  const state = loadState()
  const item = ensureWord(state, key)
  item.isFavorite = !item.isFavorite
  saveState(state)
  return item.isFavorite
}

export function setFavoriteForKeys(keys: string[], isFavorite: boolean): void {
  const state = loadState()
  for (const key of keys) {
    ensureWord(state, key).isFavorite = isFavorite
  }
  saveState(state)
}

/**
 * Ручной перенос между Легко/Средняя/Сложно (массовое действие в блоке 3). Слово, которое
 * ещё не было освоено (не набрало 3 «знаю» подряд), в эти вкладки иначе не попадает —
 * поэтому перенос принудительно помечает его освоенным, а категория больше не пересчитывается
 * (как и при обычном освоении — `recordWordAttempt` трогает `masteryCategory` только один раз).
 */
export function moveWordsToCategory(keys: string[], category: MasteryCategory): void {
  const state = loadState()
  for (const key of keys) {
    const item = ensureWord(state, key)
    item.mastered = true
    item.masteryCategory = category
  }
  saveState(state)
}

export function getLessonMasteredCount(lessonNumber: number): { mastered: number; total: number } {
  const lesson = ALL_LESSON_WORDS.find((l) => l.lessonNumber === lessonNumber)
  if (!lesson) return { mastered: 0, total: 0 }

  const state = loadState()
  let total = 0
  let mastered = 0

  for (const group of lesson.groups) {
    for (const word of group.entries) {
      total += 1
      const key = toWordKey(lessonNumber, word.es)
      if (state[key]?.mastered) mastered += 1
    }
  }
  return { mastered, total }
}

export function resetLessonProgress(lessonNumber: number): void {
  const state = loadState()
  const next: ProgressState = {}
  const prefix = `${lessonNumber}:`

  for (const [key, value] of Object.entries(state)) {
    if (!key.startsWith(prefix)) {
      next[key] = value
    }
  }
  saveState(next)
}
