import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs'
import { join, dirname } from 'node:path'

/**
 * Простое файловое хранилище на JSON. Данные лежат вне git-репозитория,
 * чтобы `git pull` на сервере никогда не затирал пользователей и прогресс.
 */

const DATA_DIR = process.env.DATA_DIR || '/mnt/different-project/mnemo-data'

function ensureDir(dir) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
}

function readJson(path, fallback) {
  try {
    if (!existsSync(path)) return fallback
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return fallback
  }
}

/** Пишем через временный файл: обрыв на середине не оставит битый JSON. */
function writeJson(path, value) {
  ensureDir(dirname(path))
  const tmp = `${path}.tmp`
  writeFileSync(tmp, JSON.stringify(value, null, 2), 'utf8')
  renameSync(tmp, path)
}

const paths = {
  allowedUsers: () => join(DATA_DIR, 'allowed_users.json'),
  passwords: () => join(DATA_DIR, 'passwords.json'),
  sessions: () => join(DATA_DIR, 'sessions.json'),
  progress: (userId) => join(DATA_DIR, 'progress', `${userId}.json`),
}

export function getDataDir() {
  return DATA_DIR
}

// --- Пользователи ---

export function listAllowedUsers() {
  return readJson(paths.allowedUsers(), {})
}

export function isAllowed(userId) {
  return Boolean(listAllowedUsers()[userId])
}

export function allowUser(userId, profile) {
  const users = listAllowedUsers()
  users[userId] = {
    ...users[userId],
    ...profile,
    userId,
    addedAt: users[userId]?.addedAt ?? new Date().toISOString(),
    lastSeenAt: new Date().toISOString(),
  }
  writeJson(paths.allowedUsers(), users)
  return users[userId]
}

export function touchUser(userId, profile) {
  const users = listAllowedUsers()
  if (!users[userId]) return null
  users[userId] = { ...users[userId], ...profile, lastSeenAt: new Date().toISOString() }
  writeJson(paths.allowedUsers(), users)
  return users[userId]
}

export function revokeUser(userId) {
  const users = listAllowedUsers()
  if (!users[userId]) return false
  delete users[userId]
  writeJson(paths.allowedUsers(), users)

  const sessions = readJson(paths.sessions(), {})
  for (const [token, session] of Object.entries(sessions)) {
    if (session.userId === userId) delete sessions[token]
  }
  writeJson(paths.sessions(), sessions)
  return true
}

// --- Одноразовые пароли ---

const PASSWORD_TTL_MS = 30 * 60 * 1000

export function createPassword(code, tgChatId, profile) {
  const all = readJson(paths.passwords(), {})
  all[code] = {
    code,
    userId: `tg_${tgChatId}`,
    profile: profile ?? {},
    expiresAt: Date.now() + PASSWORD_TTL_MS,
  }
  writeJson(paths.passwords(), all)
  return all[code]
}

/** Одноразовый: найденный код сразу удаляется, повторно ввести нельзя. */
export function consumePassword(code) {
  const all = readJson(paths.passwords(), {})
  const entry = all[code]
  if (!entry) return null

  delete all[code]
  writeJson(paths.passwords(), all)

  if (entry.expiresAt < Date.now()) return null
  return entry
}

// --- Сессии ---

const SESSION_TTL_MS = 180 * 24 * 60 * 60 * 1000

export function createSession(token, userId) {
  const sessions = readJson(paths.sessions(), {})
  sessions[token] = { userId, createdAt: Date.now(), expiresAt: Date.now() + SESSION_TTL_MS }
  writeJson(paths.sessions(), sessions)
}

export function getSession(token) {
  if (!token) return null
  const sessions = readJson(paths.sessions(), {})
  const session = sessions[token]
  if (!session) return null
  if (session.expiresAt < Date.now()) return null
  if (!isAllowed(session.userId)) return null
  return session
}

export function dropSession(token) {
  const sessions = readJson(paths.sessions(), {})
  if (!sessions[token]) return
  delete sessions[token]
  writeJson(paths.sessions(), sessions)
}

// --- Прогресс ---

export function readProgress(userId) {
  return readJson(paths.progress(userId), null)
}

export function writeProgress(userId, payload) {
  writeJson(paths.progress(userId), { ...payload, updatedAt: new Date().toISOString() })
}
