import './styles/main.css'
import { ALL_LESSON_WORDS } from './section1'
import { mountApp } from './mount'
import { ensureAuthorized } from './auth/gate'
import { hydrateFromServer, startProgressSync } from './auth/sync'

const root = document.querySelector<HTMLElement>('#app')
if (!root) {
  throw new Error('#app не найден')
}

async function start(host: HTMLElement): Promise<void> {
  // До авторизации приложение не монтируем: на экране заглушка или ввод пароля.
  await ensureAuthorized(host)

  // Прогресс подтягиваем до первой отрисовки, чтобы счётчики уроков были сразу верные.
  await hydrateFromServer()
  startProgressSync()

  host.replaceChildren()
  mountApp(host)

  document.documentElement.dataset.lessonWordSets = String(ALL_LESSON_WORDS.length)
}

void start(root)
