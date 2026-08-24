/**
 * Настройка окна Mini App: полный экран, безопасные отступы и ярлык на главном экране.
 *
 * Все вызовы необязательные: методы появлялись в разных версиях Bot API, а в браузере
 * их нет вовсе. Поэтому каждый проверяется перед вызовом, и отсутствие любого из них
 * не ломает приложение.
 */

type Inset = { top?: number; bottom?: number; left?: number; right?: number }

type TelegramWebApp = {
  initData?: string
  ready?: () => void
  expand?: () => void
  requestFullscreen?: () => void
  exitFullscreen?: () => void
  disableVerticalSwipes?: () => void
  setHeaderColor?: (color: string) => void
  setBackgroundColor?: (color: string) => void
  addToHomeScreen?: () => void
  checkHomeScreenStatus?: (cb: (status: string) => void) => void
  onEvent?: (event: string, handler: () => void) => void
  isFullscreen?: boolean
  safeAreaInset?: Inset
  contentSafeAreaInset?: Inset
}

function telegram(): TelegramWebApp | null {
  return (window as unknown as { Telegram?: { WebApp?: TelegramWebApp } }).Telegram?.WebApp ?? null
}

/** Отступы отдаём в CSS: в полноэкранном режиме сверху находятся часы и кнопки Telegram. */
function applyInsets(tg: TelegramWebApp): void {
  const safe = tg.safeAreaInset ?? {}
  const content = tg.contentSafeAreaInset ?? {}
  const root = document.documentElement

  const top = (safe.top ?? 0) + (content.top ?? 0)
  const bottom = (safe.bottom ?? 0) + (content.bottom ?? 0)

  root.style.setProperty('--tg-safe-top', `${top}px`)
  root.style.setProperty('--tg-safe-bottom', `${bottom}px`)
  root.classList.toggle('tg-fullscreen', Boolean(tg.isFullscreen))
}

function themeColor(): string {
  const styles = getComputedStyle(document.documentElement)
  return styles.getPropertyValue('--color-bg').trim() || '#0f1115'
}

export function setupTelegramUi(): void {
  const tg = telegram()
  if (!tg) return

  tg.ready?.()
  tg.expand?.()

  // Свайп вниз закрывал приложение прямо посреди урока — в карточках это мешает.
  tg.disableVerticalSwipes?.()
  tg.requestFullscreen?.()

  const color = themeColor()
  tg.setHeaderColor?.(color)
  tg.setBackgroundColor?.(color)

  applyInsets(tg)
  tg.onEvent?.('fullscreenChanged', () => applyInsets(tg))
  tg.onEvent?.('safeAreaChanged', () => applyInsets(tg))
  tg.onEvent?.('contentSafeAreaChanged', () => applyInsets(tg))
}

/** Ярлык можно добавить не везде: старые клиенты и обычный браузер этого не умеют. */
export function homeScreenSupported(): boolean {
  return typeof telegram()?.addToHomeScreen === 'function'
}

export function addToHomeScreen(): void {
  telegram()?.addToHomeScreen?.()
}

/**
 * Статус приходит асинхронно: 'added' — ярлык уже есть, 'missed' — можно добавить,
 * 'unsupported' — клиент не умеет. Если метода нет, считаем, что предлагать нечего.
 */
export function checkHomeScreen(callback: (canAdd: boolean) => void): void {
  const tg = telegram()
  if (!tg?.checkHomeScreenStatus) {
    callback(false)
    return
  }
  try {
    tg.checkHomeScreenStatus((status) => callback(status === 'missed'))
  } catch {
    callback(false)
  }
}
