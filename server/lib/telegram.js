import { createHmac, timingSafeEqual } from 'node:crypto'

const BOT_TOKEN = process.env.BOT_TOKEN || ''

/**
 * Проверка подписи initData из Telegram Mini App.
 * Telegram подписывает данные ключом бота — подделать ID пользователя нельзя,
 * поэтому внутри Telegram пароль не нужен вообще.
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 */
export function validateInitData(initData, maxAgeSeconds = 86400) {
  if (!initData || !BOT_TOKEN) return null

  let params
  try {
    params = new URLSearchParams(initData)
  } catch {
    return null
  }

  const hash = params.get('hash')
  if (!hash) return null
  params.delete('hash')

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n')

  const secretKey = createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest()
  const computed = createHmac('sha256', secretKey).update(dataCheckString).digest('hex')

  const a = Buffer.from(computed, 'hex')
  const b = Buffer.from(hash, 'hex')
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null

  const authDate = Number(params.get('auth_date'))
  if (!authDate || Date.now() / 1000 - authDate > maxAgeSeconds) return null

  try {
    const user = JSON.parse(params.get('user') ?? 'null')
    if (!user?.id) return null
    return user
  } catch {
    return null
  }
}

const API = `https://api.telegram.org/bot${BOT_TOKEN}`

export async function callTelegram(method, payload) {
  if (!BOT_TOKEN) return null
  try {
    const res = await fetch(`${API}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    return await res.json()
  } catch (err) {
    console.error(`[tg] ${method} failed:`, err.message)
    return null
  }
}

export function sendMessage(chatId, text, extra = {}) {
  return callTelegram('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', ...extra })
}

export function describeUser(user) {
  if (!user) return 'неизвестный'
  const name = [user.first_name, user.last_name].filter(Boolean).join(' ') || 'без имени'
  return user.username ? `${name} @${user.username}` : name
}
