import { getSection1Topics } from './index'
import { lessonNumberFromId } from '../shared/wordKey'

export type Section1ListOptions = {
  onLessonSelect: (lessonNumber: number) => void
  getLessonProgress?: (lessonNumber: number) => { mastered: number; total: number }
}

/** Список карточек тем (раздел 1) */
export function createSection1TopicList(options: Section1ListOptions): HTMLElement {
  const { onLessonSelect, getLessonProgress } = options
  const list = document.createElement('div')
  list.className = 'section1-list'

  for (const topic of getSection1Topics()) {
    const card = document.createElement('button')
    card.type = 'button'
    card.className = 'section1-card'
    const title = document.createElement('span')
    title.className = 'section1-card-title'
    title.textContent = topic.title
    card.appendChild(title)
    card.setAttribute('aria-label', topic.title)
    const lessonNum = lessonNumberFromId(topic.id)
    if (lessonNum > 0) {
      const progress = getLessonProgress?.(lessonNum) ?? { mastered: 0, total: 0 }
      if (progress.total === 0) {
        // Урок ещё не наполнен словами — не даём открыть пустой экран изучения.
        card.classList.add('section1-card--empty')
        card.disabled = true
        card.setAttribute('aria-disabled', 'true')

        const right = document.createElement('span')
        right.className = 'section1-card-right'
        const status = document.createElement('span')
        status.className = 'section1-card-status'
        status.textContent = 'скоро'
        right.appendChild(status)
        card.appendChild(right)
        list.appendChild(card)
        continue
      }

      const right = document.createElement('span')
      right.className = 'section1-card-right'

      const status = document.createElement('span')
      status.className = 'section1-card-status'
      if (progress.mastered >= progress.total) {
        status.textContent = `${progress.total}/${progress.total}`
      } else {
        status.textContent = `${progress.mastered}/${progress.total}`
      }
      right.appendChild(status)
      card.appendChild(right)
    }
    card.addEventListener('click', () => {
      if (lessonNum > 0) onLessonSelect(lessonNum)
    })
    list.appendChild(card)
  }

  return list
}
