import './styles/main.css'
import { ALL_LESSON_WORDS } from './section1'
import { mountApp } from './mount'

const root = document.querySelector<HTMLElement>('#app')
if (!root) {
  throw new Error('#app не найден')
}

mountApp(root)

document.documentElement.dataset.lessonWordSets = String(ALL_LESSON_WORDS.length)
