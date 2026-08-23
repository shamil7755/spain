import { callTelegram, sendMessage, describeUser } from './lib/telegram.js'
import { createPassword, listAllowedUsers, revokeUser, allowUser } from './lib/store.js'

const ADMIN_CHAT_ID = String(process.env.ADMIN_CHAT_ID || '')
const APP_URL = process.env.APP_URL || 'https://spainlearn123.duckdns.org'

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // без похожих 0/O, 1/I

function generateCode(length = 6) {
  let code = ''
  for (let i = 0; i < length; i++) {
    code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]
  }
  return code
}

function isAdmin(chatId) {
  return String(chatId) === ADMIN_CHAT_ID
}

const openAppKeyboard = {
  inline_keyboard: [[{ text: '📚 Открыть карточки', web_app: { url: APP_URL } }]],
}

async function handleStart(msg, payload) {
  const chatId = msg.chat.id
  const user = msg.from

  if (payload === 'password') {
    await sendMessage(chatId, 'Запрос отправлен администратору. Пароль придёт сюда же.')
    if (ADMIN_CHAT_ID) {
      await sendMessage(
        ADMIN_CHAT_ID,
        `🔑 <b>Запрос доступа</b>\n\n` +
          `👤 ${describeUser(user)}\n` +
          `🆔 <code>${chatId}</code>\n\n` +
          `Выдать пароль: <code>/password ${chatId}</code>`,
      )
    }
    return
  }

  await sendMessage(
    chatId,
    `Привет, ${user.first_name || 'друг'}!\n\nЗдесь карточки для изучения испанского.`,
    { reply_markup: openAppKeyboard },
  )
}

async function handlePassword(msg, arg) {
  const chatId = msg.chat.id
  if (!isAdmin(chatId)) {
    await sendMessage(chatId, 'Эта команда доступна только администратору.')
    return
  }

  const targetId = (arg || '').trim()
  if (!/^\d+$/.test(targetId)) {
    await sendMessage(chatId, 'Формат: <code>/password 123456789</code>')
    return
  }

  const code = generateCode()
  createPassword(code, targetId, {})

  const sent = await sendMessage(
    targetId,
    `🔑 <b>Одноразовый пароль:</b>\n\n<code>${code}</code>\n\nДействует 30 минут.`,
  )

  if (sent?.ok) {
    await sendMessage(chatId, `Пароль <code>${code}</code> отправлен пользователю ${targetId}.`)
  } else {
    await sendMessage(
      chatId,
      `Пароль <code>${code}</code> создан, но отправить не удалось — ` +
        `пользователь ${targetId} не начинал диалог с ботом. Передай код вручную.`,
    )
  }
}

async function handleGrant(msg, arg) {
  const chatId = msg.chat.id
  if (!isAdmin(chatId)) return

  const targetId = (arg || '').trim()
  if (!/^\d+$/.test(targetId)) {
    await sendMessage(chatId, 'Формат: <code>/grant 123456789</code>')
    return
  }

  allowUser(`tg_${targetId}`, { tgChatId: targetId, grantedBy: 'admin' })
  await sendMessage(chatId, `Доступ выдан: <code>tg_${targetId}</code>`)
  await sendMessage(targetId, 'Доступ к приложению открыт.', { reply_markup: openAppKeyboard })
}

async function handleUsers(msg) {
  const chatId = msg.chat.id
  if (!isAdmin(chatId)) return

  const users = Object.values(listAllowedUsers())
  if (!users.length) {
    await sendMessage(chatId, 'Пока никого нет в списке доступа.')
    return
  }

  const lines = users.map((u) => {
    const name = u.username ? `${u.name ?? ''} @${u.username}` : (u.name ?? '—')
    const seen = u.lastSeenAt ? new Date(u.lastSeenAt).toLocaleString('ru-RU') : 'никогда'
    return `• <code>${u.userId}</code> — ${name}\n  был: ${seen}`
  })

  await sendMessage(chatId, `<b>Доступ есть у ${users.length}:</b>\n\n${lines.join('\n')}`)
}

async function handleRevoke(msg, arg) {
  const chatId = msg.chat.id
  if (!isAdmin(chatId)) return

  const targetId = (arg || '').trim().replace(/^tg_/, '')
  if (!/^\d+$/.test(targetId)) {
    await sendMessage(chatId, 'Формат: <code>/revoke 123456789</code>')
    return
  }

  const removed = revokeUser(`tg_${targetId}`)
  await sendMessage(chatId, removed ? `Доступ отозван: <code>tg_${targetId}</code>` : 'Такого пользователя нет.')
}

async function handleMessage(msg) {
  const text = msg.text?.trim()
  if (!text?.startsWith('/')) return

  const [rawCommand, ...rest] = text.split(/\s+/)
  const command = rawCommand.split('@')[0]
  const arg = rest.join(' ')

  switch (command) {
    case '/start':
      return handleStart(msg, arg)
    case '/password':
      return handlePassword(msg, arg)
    case '/grant':
      return handleGrant(msg, arg)
    case '/users':
      return handleUsers(msg)
    case '/revoke':
      return handleRevoke(msg, arg)
    case '/id':
      return sendMessage(msg.chat.id, `Твой chat id: <code>${msg.chat.id}</code>`)
    default:
      return
  }
}

/** Long polling — вебхук не нужен, лишний маршрут в nginx не заводим. */
export function startBot() {
  if (!process.env.BOT_TOKEN) {
    console.warn('[bot] BOT_TOKEN не задан — бот выключен')
    return
  }

  let offset = 0
  let stopped = false

  async function poll() {
    while (!stopped) {
      try {
        const res = await callTelegram('getUpdates', { offset, timeout: 30, allowed_updates: ['message'] })
        if (res?.ok) {
          for (const update of res.result) {
            offset = update.update_id + 1
            if (update.message) {
              await handleMessage(update.message).catch((err) =>
                console.error('[bot] handler error:', err.message),
              )
            }
          }
        } else {
          await new Promise((r) => setTimeout(r, 5000))
        }
      } catch (err) {
        console.error('[bot] poll error:', err.message)
        await new Promise((r) => setTimeout(r, 5000))
      }
    }
  }

  poll()
  console.log('[bot] запущен (long polling)')
  return () => {
    stopped = true
  }
}

export async function notifyAdmin(text) {
  if (!ADMIN_CHAT_ID) return
  await sendMessage(ADMIN_CHAT_ID, text)
}
