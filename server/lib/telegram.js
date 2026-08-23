import { createHmac, timingSafeEqual } from 'node:crypto'
import { request as httpsRequest } from 'node:https'

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

const TG_HOST = 'api.telegram.org'

/**
 * DNS на этом сервере отдаёт для api.telegram.org адрес IPv6, до которого нет
 * маршрута — обычный fetch виснет до таймаута. Поэтому ходим по IPv4 напрямую,
 * подставляя имя хоста в SNI и заголовок Host, чтобы TLS-сертификат сходился.
 * При отказе адрес меняется на следующий.
 */
const TG_IPS = ['149.154.167.220', '149.154.167.99', '91.108.56.165']
let ipIndex = 0

// getUpdates висит до 30 с (long polling), таймаут должен быть заметно больше.
const REQUEST_TIMEOUT_MS = 60_000

function requestViaIp(ip, method, payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload ?? {})
    const req = httpsRequest(
      {
        host: ip,
        servername: TG_HOST,
        path: `/bot${BOT_TOKEN}/${method}`,
        method: 'POST',
        timeout: REQUEST_TIMEOUT_MS,
        headers: {
          Host: TG_HOST,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = ''
        res.setEncoding('utf8')
        res.on('data', (chunk) => (data += chunk))
        res.on('end', () => {
          try {
            resolve(JSON.parse(data))
          } catch {
            reject(new Error(`bad json (HTTP ${res.statusCode})`))
          }
        })
      },
    )

    req.on('timeout', () => req.destroy(new Error('timeout')))
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

export async function callTelegram(method, payload) {
  if (!BOT_TOKEN) return null

  let lastError = null
  for (let attempt = 0; attempt < TG_IPS.length; attempt++) {
    const ip = TG_IPS[ipIndex % TG_IPS.length]
    try {
      return await requestViaIp(ip, method, payload)
    } catch (err) {
      lastError = err
      ipIndex = (ipIndex + 1) % TG_IPS.length
      console.warn(`[tg] ${method} через ${ip} не прошёл (${err.message}), пробуем следующий IP`)
    }
  }

  console.error(`[tg] ${method} failed:`, lastError?.message)
  return null
}

export function sendMessage(chatId, text, extra = {}) {
  return callTelegram('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', ...extra })
}

export function describeUser(user) {
  if (!user) return 'неизвестный'
  const name = [user.first_name, user.last_name].filter(Boolean).join(' ') || 'без имени'
  return user.username ? `${name} @${user.username}` : name
}
