/**
 * Клиент для серверной авторизации и синхронизации прогресса.
 *
 * Офлайн-сборка (`dist/index.html`, открытая через file://) сервера не знает —
 * там авторизация пропускается, а прогресс остаётся в localStorage, как раньше.
 */

const TOKEN_KEY = 'mnemonic-auth-token'

export type AuthUser = {
  userId: string
  name?: string | null
  username?: string | null
  tgChatId?: string
}

export type ProgressPayload = {
  progress: Record<string, unknown>
  prefs: Record<string, unknown>
}

/** На file:// нет ни сервера, ни смысла в авторизации — приложение работает локально. */
export const isOfflineBuild = typeof location !== 'undefined' && location.protocol === 'file:'

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function setToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token)
  } catch {
    // Приватный режим — сессия проживёт до перезагрузки вкладки.
  }
}

export function clearToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY)
  } catch {
    // см. setToken
  }
}

type ApiResult<T> = { ok: true; data: T } | { ok: false; status: number; error: string }

async function request<T>(path: string, init?: RequestInit): Promise<ApiResult<T>> {
  const token = getToken()
  try {
    const res = await fetch(path, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init?.headers,
      },
    })

    const payload = await res.json().catch(() => ({}))
    if (!res.ok || payload?.ok === false) {
      return { ok: false, status: res.status, error: payload?.error ?? `http_${res.status}` }
    }
    return { ok: true, data: payload as T }
  } catch {
    return { ok: false, status: 0, error: 'network' }
  }
}

export function authViaTelegram(initData: string) {
  return request<{ user: AuthUser; token: string }>('/api/auth/telegram', {
    method: 'POST',
    body: JSON.stringify({ initData }),
  })
}

export function authViaPassword(password: string) {
  return request<{ user: AuthUser; token: string }>('/api/auth/password', {
    method: 'POST',
    body: JSON.stringify({ password }),
  })
}

export function fetchMe() {
  return request<{ userId: string; user: AuthUser | null }>('/api/me')
}

export function fetchProgress() {
  return request<{ data: ProgressPayload | null }>('/api/progress')
}

export function pushProgress(payload: ProgressPayload) {
  return request<{ ok: true }>('/api/progress', {
    method: 'PUT',
    body: JSON.stringify(payload),
  })
}

export async function logout(): Promise<void> {
  await request('/api/auth/logout', { method: 'POST' })
  clearToken()
}
