import './styles/main.css'
import { ALL_LESSON_WORDS } from './section1'
import { mountApp } from './mount'
import { displayName, ensureAuthorized } from './auth/gate'
import { hydrateFromServer, startProgressSync } from './auth/sync'
import { setupTelegramUi } from './auth/telegramUi'

const root = document.querySelector<HTMLElement>('#app')
if (!root) {
  throw new Error('#app не найден')
}

async function start(host: HTMLElement): Promise<void> {
  // Полный экран и отступы просим сразу: иначе заглушка успевает моргнуть в окне обычного размера.
  setupTelegramUi()

  // До авторизации приложение не монтируем: на экране заглушка или ввод пароля.
  const session = await ensureAuthorized(host)

  // Прогресс подтягиваем до первой отрисовки, чтобы счётчики уроков были сразу верные.
  await hydrateFromServer()
  startProgressSync()

  host.replaceChildren()
  mountApp(host, { userName: displayName(session) })

  document.documentElement.dataset.lessonWordSets = String(ALL_LESSON_WORDS.length)
}

void start(root)
