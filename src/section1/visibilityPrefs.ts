/**
 * Глобальный режим показа полей карточки (картинка / испанское слово / перевод).
 * Один режим на всё приложение, хранится в localStorage и применяется сразу
 * на всех уроках — в отличие от прогресса это не учебные данные, а настройка экрана.
 */
export type VisibleField = 'image' | 'es' | 'ru'
export type VisibilityPrefs = Record<VisibleField, boolean>

const STORAGE_KEY = 'mnemonic-visibility-v1'
const DEFAULT_PREFS: VisibilityPrefs = { image: true, es: true, ru: true }

let cache: VisibilityPrefs | null = null

function loadPrefs(): VisibilityPrefs {
  if (cache) return cache
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed = raw ? (JSON.parse(raw) as Partial<VisibilityPrefs>) : null
    cache =
      parsed && typeof parsed === 'object'
        ? {
            image: typeof parsed.image === 'boolean' ? parsed.image : DEFAULT_PREFS.image,
            es: typeof parsed.es === 'boolean' ? parsed.es : DEFAULT_PREFS.es,
            ru: typeof parsed.ru === 'boolean' ? parsed.ru : DEFAULT_PREFS.ru,
          }
        : { ...DEFAULT_PREFS }
  } catch {
    cache = { ...DEFAULT_PREFS }
  }
  return cache
}

type PrefsListener = (prefs: VisibilityPrefs) => void

let prefsListener: PrefsListener | null = null

/** Подписка на сохранение — используется синхронизацией с сервером. */
export function onPrefsSaved(listener: PrefsListener | null): void {
  prefsListener = listener
}

/** Применяет настройки, пришедшие с сервера, без обратной отправки. */
export function hydrateVisibilityPrefs(raw: unknown): void {
  if (!raw || typeof raw !== 'object') return
  const parsed = raw as Partial<VisibilityPrefs>
  cache = {
    image: typeof parsed.image === 'boolean' ? parsed.image : DEFAULT_PREFS.image,
    es: typeof parsed.es === 'boolean' ? parsed.es : DEFAULT_PREFS.es,
    ru: typeof parsed.ru === 'boolean' ? parsed.ru : DEFAULT_PREFS.ru,
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cache))
  } catch {
    // см. savePrefs
  }
}

function savePrefs(prefs: VisibilityPrefs): void {
  cache = prefs
  prefsListener?.(prefs)
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs))
  } catch {
    // Приватный режим / заблокированное хранилище — режим останется в силе на сессию.
  }
}

export function getVisibilityPrefs(): VisibilityPrefs {
  return { ...loadPrefs() }
}

export function toggleGlobalFieldVisible(field: VisibleField): VisibilityPrefs {
  const prefs = loadPrefs()
  const next = { ...prefs, [field]: !prefs[field] }
  savePrefs(next)
  return next
}
