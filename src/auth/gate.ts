import {
  authViaPassword,
  authViaTelegram,
  clearToken,
  fetchMe,
  getToken,
  isOfflineBuild,
  setToken,
  type AuthUser,
} from './api'

type TelegramWebApp = {
  initData?: string
  initDataUnsafe?: { user?: { id: number; first_name?: string; username?: string } }
  ready: () => void
  expand: () => void
  openTelegramLink?: (url: string) => void
}

function telegram(): TelegramWebApp | null {
  return (window as unknown as { Telegram?: { WebApp?: TelegramWebApp } }).Telegram?.WebApp ?? null
}

const BOT_LINK = import.meta.env.VITE_BOT_LINK ?? 'https://t.me/spainlearning_bot'

export type Session = { user: AuthUser | null; offline: boolean }

function screen(root: HTMLElement, className: string): HTMLElement {
  const box = document.createElement('div')
  box.className = `auth-screen ${className}`
  root.replaceChildren(box)
  return box
}

function showSplash(root: HTMLElement): void {
  const box = screen(root, 'auth-splash')
  box.innerHTML = `
    <div class="auth-spinner" aria-hidden="true"></div>
    <p class="auth-text">Идёт проверка доступа…</p>
  `
}

function showError(root: HTMLElement, message: string, onRetry: () => void): void {
  const box = screen(root, 'auth-error')
  box.innerHTML = `
    <h1 class="auth-title">Нет связи с сервером</h1>
    <p class="auth-text">${message}</p>
  `
  const retry = document.createElement('button')
  retry.type = 'button'
  retry.className = 'auth-button'
  retry.textContent = 'Повторить'
  retry.addEventListener('click', onRetry)
  box.appendChild(retry)
}

function showPasswordScreen(root: HTMLElement, onSuccess: (user: AuthUser) => void): void {
  const box = screen(root, 'auth-password')

  const title = document.createElement('h1')
  title.className = 'auth-title'
  title.textContent = 'Нужен доступ'

  const hint = document.createElement('p')
  hint.className = 'auth-text'
  hint.textContent = 'Введите одноразовый пароль или запросите его у администратора.'

  const form = document.createElement('form')
  form.className = 'auth-form'

  const input = document.createElement('input')
  input.type = 'text'
  input.className = 'auth-input'
  input.placeholder = 'Пароль'
  input.autocomplete = 'one-time-code'
  input.maxLength = 12
  input.setAttribute('aria-label', 'Одноразовый пароль')

  const submit = document.createElement('button')
  submit.type = 'submit'
  submit.className = 'auth-button'
  submit.textContent = 'Войти'

  const request = document.createElement('button')
  request.type = 'button'
  request.className = 'auth-button auth-button--ghost'
  request.textContent = 'Запросить пароль'

  const error = document.createElement('p')
  error.className = 'auth-message'
  error.hidden = true

  request.addEventListener('click', () => {
    const url = `${BOT_LINK}?start=password`
    const tg = telegram()
    if (tg?.openTelegramLink) tg.openTelegramLink(url)
    else window.open(url, '_blank')
  })

  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    const value = input.value.trim()
    if (!value) return

    submit.disabled = true
    submit.textContent = 'Проверяем…'
    error.hidden = true

    const res = await authViaPassword(value)

    submit.disabled = false
    submit.textContent = 'Войти'

    if (res.ok) {
      setToken(res.data.token)
      onSuccess(res.data.user)
      return
    }

    error.hidden = false
    error.textContent =
      res.error === 'invalid_or_expired'
        ? 'Пароль неверный или истёк. Запросите новый.'
        : res.error === 'network'
          ? 'Сервер недоступен. Проверьте интернет.'
          : 'Не удалось войти. Попробуйте ещё раз.'
    input.select()
  })

  form.append(input, submit, request, error)
  box.append(title, hint, form)
  input.focus()
}

/**
 * Пропускает в приложение только авторизованного пользователя.
 * Порядок: сохранённая сессия → подпись Telegram → экран пароля.
 */
export function ensureAuthorized(root: HTMLElement): Promise<Session> {
  if (isOfflineBuild) return Promise.resolve({ user: null, offline: true })

  const tg = telegram()
  tg?.ready()
  tg?.expand()

  return new Promise((resolve) => {
    const done = (user: AuthUser | null) => resolve({ user, offline: false })

    async function attempt(): Promise<void> {
      showSplash(root)

      // 1. Уже входили с этого устройства.
      if (getToken()) {
        const me = await fetchMe()
        if (me.ok) return done(null)
        if (me.error === 'network') return showError(root, 'Не удалось связаться с сервером.', attempt)
        clearToken()
      }

      // 2. Внутри Telegram — вход по подписанным данным, пароль не нужен.
      const initData = tg?.initData
      if (initData) {
        const res = await authViaTelegram(initData)
        if (res.ok) {
          setToken(res.data.token)
          return done(res.data.user)
        }
        if (res.error === 'network') return showError(root, 'Не удалось связаться с сервером.', attempt)
      }

      // 3. Браузер или доступа ещё нет — просим пароль.
      showPasswordScreen(root, done)
    }

    void attempt()
  })
}
