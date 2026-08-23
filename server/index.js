import { createServer } from 'node:http'
import { randomBytes } from 'node:crypto'

import { validateInitData, describeUser } from './lib/telegram.js'
import {
  isAllowed,
  allowUser,
  touchUser,
  consumePassword,
  createSession,
  getSession,
  dropSession,
  readProgress,
  writeProgress,
  getDataDir,
} from './lib/store.js'
import { startBot, notifyAdmin } from './bot.js'

const PORT = Number(process.env.PORT || 8790)
const MAX_BODY = 512 * 1024 // прогресс по всем урокам заведомо меньше

function json(res, status, payload) {
  const body = JSON.stringify(payload)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  })
  res.end(body)
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > MAX_BODY) {
        reject(new Error('body too large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      if (!chunks.length) return resolve({})
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      } catch {
        reject(new Error('invalid json'))
      }
    })
    req.on('error', reject)
  })
}

function bearer(req) {
  const header = req.headers.authorization || ''
  return header.startsWith('Bearer ') ? header.slice(7).trim() : null
}

function requireSession(req, res) {
  const session = getSession(bearer(req))
  if (!session) {
    json(res, 401, { ok: false, error: 'unauthorized' })
    return null
  }
  return session
}

function profileFromTelegram(user) {
  return {
    tgChatId: String(user.id),
    name: [user.first_name, user.last_name].filter(Boolean).join(' ') || null,
    username: user.username ?? null,
  }
}

function issueToken(userId) {
  const token = randomBytes(32).toString('hex')
  createSession(token, userId)
  return token
}

// --- Маршруты ---

/** Вход из Telegram Mini App: подпись initData проверяется ключом бота. */
async function authTelegram(req, res) {
  const { initData } = await readBody(req)
  const tgUser = validateInitData(initData)

  if (!tgUser) {
    json(res, 401, { ok: false, error: 'bad_signature' })
    return
  }

  const userId = `tg_${tgUser.id}`
  const profile = profileFromTelegram(tgUser)

  if (!isAllowed(userId)) {
    json(res, 403, { ok: false, error: 'denied', userId })
    return
  }

  const user = touchUser(userId, profile)
  json(res, 200, { ok: true, user, token: issueToken(userId) })
}

/** Вход из обычного браузера по одноразовому коду от админа. */
async function authPassword(req, res) {
  const { password } = await readBody(req)
  const code = String(password || '').trim().toUpperCase()

  if (!code) {
    json(res, 400, { ok: false, error: 'empty' })
    return
  }

  const entry = consumePassword(code)
  if (!entry) {
    json(res, 401, { ok: false, error: 'invalid_or_expired' })
    return
  }

  const user = allowUser(entry.userId, entry.profile)
  json(res, 200, { ok: true, user, token: issueToken(entry.userId) })

  await notifyAdmin(
    `🔓 <b>Вход по паролю</b>\n\n` +
      `👤 ${user.name ?? '—'}${user.username ? ` @${user.username}` : ''}\n` +
      `🆔 <code>${user.userId}</code>`,
  )
}

async function handle(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`)
  const path = url.pathname
  const method = req.method || 'GET'

  if (path === '/api/health') {
    json(res, 200, { ok: true })
    return
  }

  if (path === '/api/auth/telegram' && method === 'POST') return authTelegram(req, res)
  if (path === '/api/auth/password' && method === 'POST') return authPassword(req, res)

  if (path === '/api/auth/logout' && method === 'POST') {
    const token = bearer(req)
    if (token) dropSession(token)
    json(res, 200, { ok: true })
    return
  }

  if (path === '/api/me' && method === 'GET') {
    const session = requireSession(req, res)
    if (!session) return
    json(res, 200, { ok: true, userId: session.userId })
    return
  }

  if (path === '/api/progress') {
    const session = requireSession(req, res)
    if (!session) return

    if (method === 'GET') {
      json(res, 200, { ok: true, data: readProgress(session.userId) })
      return
    }

    if (method === 'PUT') {
      const body = await readBody(req)
      writeProgress(session.userId, { progress: body.progress ?? {}, prefs: body.prefs ?? {} })
      json(res, 200, { ok: true })
      return
    }
  }

  json(res, 404, { ok: false, error: 'not_found' })
}

const server = createServer((req, res) => {
  handle(req, res).catch((err) => {
    console.error('[api] error:', err.message)
    if (!res.headersSent) json(res, 400, { ok: false, error: err.message })
  })
})

// Слушаем только localhost — наружу пускает исключительно nginx.
server.listen(PORT, '127.0.0.1', () => {
  console.log(`[api] http://127.0.0.1:${PORT}, данные в ${getDataDir()}`)
})

startBot()
