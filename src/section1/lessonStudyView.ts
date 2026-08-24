import type { WordPair } from './lessons/types'
import { getCardImageSrc, preloadCardImage } from './cardImages'
import { getCardAudioSrc, playCardAudio } from './cardAudio'
import { normalizeWord } from '../shared/wordKey'
import { getVisibilityPrefs, toggleGlobalFieldVisible, type VisibleField } from './visibilityPrefs'

/** Слово карточки + свой номер урока — нужен на каждом слове, а не один на всю сессию,
 *  чтобы можно было прогонять подборку из нескольких уроков сразу (блок 3). */
export type StudyCard = WordPair & { lessonNumber: number }

export type LessonStudyOptions = {
  words: StudyCard[]
  totalWords?: number
  masteredStartCount?: number
  /** 'lesson' (по умолчанию) — перемешанная очередь с повтором до полного освоения, как в уроке.
   *  'review' — линейный проход по списку в заданном порядке, без перемешивания и повторов;
   *  завершается, дойдя до конца списка (для карточек, открытых из блока 3). */
  mode?: 'lesson' | 'review'
  /** С какой позиции в `words` начать (блок 3 открывает конкретную нажатую карточку). */
  startIndex?: number
  completedTitle?: string
  completedSubtitle?: string
  restartLabel?: string
  emptyTitle?: string
  emptySubtitle?: string
  onRestart?: () => void
  onWordSeen?: (
    lessonNumber: number,
    es: string
  ) => { consecutiveKnow: number; mastered: boolean } | void
  onWordAction?: (
    lessonNumber: number,
    es: string,
    action: 'learn' | 'know'
  ) => { consecutiveKnow: number; mastered: boolean } | void
  onBack: () => void
}

export function createLessonStudyView(options: LessonStudyOptions): HTMLElement {
  const {
    words,
    totalWords,
    masteredStartCount,
    mode = 'lesson',
    startIndex,
    completedTitle = '🏁 Урок завершен',
    completedSubtitle = 'Победа! Вы успешно завершили этот урок.',
    restartLabel = 'Пройти урок еще раз',
    emptyTitle = 'Нет слов',
    emptySubtitle = 'Добавьте слова в файл этого урока.',
    onRestart,
    onWordSeen,
    onWordAction,
    onBack,
  } = options
  const isReview = mode === 'review'
  let cursor = isReview ? Math.max(0, Math.min(startIndex ?? 0, Math.max(0, words.length - 1))) : 0
  // Слова уже отфильтрованы (see mount.ts) до ещё не освоенных, поэтому это множество
  // одновременно и «освоено в этой сессии», и «освоено вообще» — раздельные Set здесь не нужны.
  // В режиме review не используется — там нет ни перемешивания, ни повторов.
  const masteredWordKeys = new Set<string>()
  const totalInLesson = totalWords ?? words.length
  const startMastered = masteredStartCount ?? 0
  let timeline: number[] = isReview
    ? words.map((_, i) => i)
    : shuffle(words.map((_, i) => i))

  const root = document.createElement('div')
  root.className = 'lesson-study'
  root.setAttribute('role', 'dialog')
  root.setAttribute('aria-modal', 'true')
  root.setAttribute('aria-labelledby', 'lesson-study-es')
  root.tabIndex = -1

  const fillKnow = document.createElement('div')
  fillKnow.className = 'lesson-study-swipe-fill lesson-study-swipe-fill--know'
  const fillLearn = document.createElement('div')
  fillLearn.className = 'lesson-study-swipe-fill lesson-study-swipe-fill--learn'
  const swipeCard = document.createElement('div')
  swipeCard.className = 'lesson-study-swipe-card'

  const visual = document.createElement('div')
  visual.className = 'lesson-study-visual'

  const topbar = document.createElement('div')
  topbar.className = 'lesson-study-topbar'

  const backBtn = document.createElement('button')
  backBtn.type = 'button'
  backBtn.className = 'lesson-study-back lesson-study-back--top'
  backBtn.textContent = '←'
  backBtn.setAttribute('aria-label', 'Назад')
  backBtn.addEventListener('click', onBack)

  // Глобальный режим показа: скрывает/открывает картинку, ES или RU сразу на всех
  // карточках всех уроков (хранится в src/section1/visibilityPrefs.ts).
  let globalPrefs = getVisibilityPrefs()
  // Ручной тап по конкретному полю переопределяет глобальный режим только для текущей
  // карточки; на следующей карточке снова действует глобальный режим.
  let cardOverride: Partial<Record<VisibleField, boolean>> = {}

  function isFieldVisible(field: VisibleField): boolean {
    return cardOverride[field] ?? globalPrefs[field]
  }

  const visToggles = document.createElement('div')
  visToggles.className = 'lesson-study-vis-toggles'

  const visToggleConfig: { field: VisibleField; label: string; ariaLabel: string }[] = [
    { field: 'image', label: '🖼', ariaLabel: 'Показывать картинку на всех карточках' },
    { field: 'es', label: 'ES', ariaLabel: 'Показывать испанское слово на всех карточках' },
    { field: 'ru', label: 'RU', ariaLabel: 'Показывать перевод на всех карточках' },
  ]
  const visToggleButtons = new Map<VisibleField, HTMLButtonElement>()
  for (const cfg of visToggleConfig) {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'lesson-study-vis-toggle'
    btn.textContent = cfg.label
    btn.setAttribute('aria-label', cfg.ariaLabel)
    btn.addEventListener('click', () => {
      globalPrefs = toggleGlobalFieldVisible(cfg.field)
      // Глобальный режим должен применяться немедленно и ко всем карточкам —
      // сбрасываем ручные тапы по текущей карточке, чтобы не путать её с новым режимом.
      cardOverride = {}
      syncVisToggleButtons()
      renderEs()
      renderRu()
      renderImage()
    })
    visToggleButtons.set(cfg.field, btn)
    visToggles.appendChild(btn)
  }

  function syncVisToggleButtons(): void {
    for (const cfg of visToggleConfig) {
      visToggleButtons.get(cfg.field)!.setAttribute('aria-pressed', String(globalPrefs[cfg.field]))
    }
  }
  syncVisToggleButtons()

  const lessonLabel = document.createElement('p')
  lessonLabel.className = 'lesson-study-lesson-label'

  const topCounter = document.createElement('p')
  topCounter.className = 'lesson-study-top-counter'

  const imgWrap = document.createElement('div')
  imgWrap.className = 'lesson-study-img-wrap'

  const img = document.createElement('img')
  img.className = 'lesson-study-img'
  img.alt = ''
  img.decoding = 'async'
  img.loading = 'eager'

  // Пока файл качается, показываем крутилку: иначе открытый «глаз» выглядит
  // как пустая белая карточка, и непонятно, грузится она или сломана.
  img.addEventListener('load', () => imgWrap.classList.remove('is-loading'))
  img.addEventListener('error', () => imgWrap.classList.remove('is-loading'))

  const imgPlaceholder = document.createElement('div')
  imgPlaceholder.className = 'lesson-study-hidden-field lesson-study-hidden-field--image'
  imgPlaceholder.innerHTML = '<span class="lesson-study-hidden-field-icon">👁</span><span>Нажми, чтобы показать</span>'

  imgWrap.append(img, imgPlaceholder)
  topbar.append(backBtn, visToggles, lessonLabel, topCounter)
  visual.append(topbar, imgWrap)

  const wordsBlock = document.createElement('div')
  wordsBlock.className = 'lesson-study-words'

  const hearts = document.createElement('div')
  hearts.className = 'lesson-study-hearts'

  const esEl = document.createElement('p')
  esEl.id = 'lesson-study-es'
  esEl.className = 'lesson-study-es'
  esEl.lang = 'es'

  const audioBtn = document.createElement('button')
  audioBtn.type = 'button'
  audioBtn.className = 'lesson-study-audio-toggle'
  audioBtn.textContent = '🔊'
  audioBtn.setAttribute('aria-label', 'Озвучить слово')

  const ruEl = document.createElement('p')
  ruEl.className = 'lesson-study-ru'

  const hintToggle = document.createElement('button')
  hintToggle.type = 'button'
  hintToggle.className = 'lesson-study-hint-toggle'
  hintToggle.textContent = 'Подсказка'

  const hintText = document.createElement('p')
  hintText.className = 'lesson-study-hint-text'
  hintText.hidden = true

  let currentEs = ''
  let currentRu = ''
  let currentAsset: string | undefined
  let currentImgSrc: string | undefined
  let currentLessonNumber = 0
  // Сбрасывается на каждой новой карточке — нужно, чтобы при ответе «знаю»/«учить» понять,
  // проигрывалось ли уже произношение (и не проигрывать его повторно).
  let audioPlayedThisCard = false

  function playCurrentAudio(): void {
    if (!currentEs) return
    const el = playCardAudio(currentLessonNumber, currentEs, currentAsset)
    if (el) audioPlayedThisCard = true
  }

  // Озвучка работает независимо от того, скрыто ли сейчас испанское слово —
  // аудирование на слух это отдельный навык, кнопка 🔊 не должна зависеть от режима показа.
  audioBtn.addEventListener('click', () => {
    if (audioBtn.disabled) return
    playCurrentAudio()
  })

  const HIDDEN_FIELD_TEXT = 'Нажми, чтобы показать'

  function renderEs(): void {
    if (!currentEs) return
    const visible = isFieldVisible('es')
    esEl.classList.toggle('lesson-study-es--hidden', !visible)
    esEl.lang = visible ? 'es' : 'ru'
    esEl.textContent = visible ? currentEs : HIDDEN_FIELD_TEXT
  }

  function renderRu(): void {
    if (!currentEs) return
    const visible = isFieldVisible('ru')
    ruEl.classList.toggle('lesson-study-ru--hidden', !visible)
    ruEl.textContent = visible ? currentRu : HIDDEN_FIELD_TEXT
  }

  function renderImage(): void {
    if (!currentImgSrc) {
      imgWrap.hidden = true
      imgWrap.removeAttribute('tabindex')
      imgWrap.removeAttribute('role')
      imgWrap.removeAttribute('aria-label')
      return
    }
    imgWrap.hidden = false
    imgWrap.tabIndex = 0
    imgWrap.setAttribute('role', 'button')
    imgWrap.setAttribute('aria-label', 'Показать или скрыть картинку')
    const visible = isFieldVisible('image')
    img.classList.toggle('lesson-study-img--hidden', !visible)
    imgPlaceholder.hidden = visible
  }

  /** Тап по видимому полю прячет его, по скрытому — открывает; только для текущей карточки. */
  function toggleCardField(field: VisibleField): void {
    if (!hasCurrentWord()) return
    cardOverride[field] = !isFieldVisible(field)
    if (field === 'es') renderEs()
    else if (field === 'ru') renderRu()
    else renderImage()
  }

  esEl.setAttribute('role', 'button')
  esEl.tabIndex = 0
  esEl.addEventListener('click', () => toggleCardField('es'))
  esEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      toggleCardField('es')
    }
  })

  ruEl.setAttribute('role', 'button')
  ruEl.tabIndex = 0
  ruEl.addEventListener('click', () => toggleCardField('ru'))
  ruEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      toggleCardField('ru')
    }
  })

  imgWrap.addEventListener('click', () => {
    if (!currentImgSrc) return
    toggleCardField('image')
  })
  imgWrap.addEventListener('keydown', (e) => {
    if (!currentImgSrc) return
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      toggleCardField('image')
    }
  })

  let isHintOpen = false
  hintToggle.addEventListener('click', () => {
    if (hintToggle.disabled) return
    isHintOpen = !isHintOpen
    hintText.hidden = !isHintOpen
    playCurrentAudio()
  })

  const headline = document.createElement('div')
  headline.className = 'lesson-study-headline'

  const hintRow = document.createElement('div')
  hintRow.className = 'lesson-study-hint-row'

  const controls = document.createElement('div')
  controls.className = 'lesson-study-controls'
  controls.append(audioBtn)

  headline.append(esEl)
  hintRow.append(hintToggle, controls)
  wordsBlock.append(hearts, headline, ruEl, hintRow, hintText)

  const scroll = document.createElement('div')
  scroll.className = 'lesson-study-scroll'
  scroll.append(visual, wordsBlock)

  function shuffle(values: number[]): number[] {
    const arr = [...values]
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[arr[i], arr[j]] = [arr[j]!, arr[i]!]
    }
    return arr
  }

  function renderHearts(progress: number): void {
    hearts.replaceChildren()
    const filled = Math.max(0, Math.min(3, progress))
    for (let i = 0; i < 3; i++) {
      const span = document.createElement('span')
      span.className = `lesson-study-heart ${i < filled ? 'is-on' : 'is-off'}`
      span.textContent = '❤'
      hearts.appendChild(span)
    }
  }

  function renderCounter(): void {
    if (isReview) {
      const position = Math.min(cursor + 1, words.length)
      topCounter.textContent = `${position} из ${words.length}`
      return
    }
    const masteredNow = Math.min(totalInLesson, startMastered + masteredWordKeys.size)
    topCounter.textContent = `${masteredNow} из ${totalInLesson}`
  }

  function appendRandomReview(indexToRepeat: number): void {
    const minOffset = 5
    const maxOffset = 10
    const offset = minOffset + Math.floor(Math.random() * (maxOffset - minOffset + 1))
    const insertAt = Math.min(cursor + offset, timeline.length)
    timeline.splice(insertAt, 0, indexToRepeat)
  }

  /** Только для режима lesson — review идёт строго по списку без перемешивания и довставки. */
  function ensurePlayableQueue(): void {
    if (isReview) return
    while (cursor < timeline.length) {
      const idx = timeline[cursor]!
      const w = words[idx]
      if (!w) {
        cursor += 1
        continue
      }
      if (masteredWordKeys.has(normalizeWord(w.es))) {
        cursor += 1
        continue
      }
      break
    }

    if (cursor >= timeline.length) {
      const active = words
        .map((w, i) => ({ w, i }))
        .filter((item) => !masteredWordKeys.has(normalizeWord(item.w.es)))
        .map((item) => item.i)

      if (active.length > 0) {
        timeline = timeline.concat(shuffle(active))
      }
    }
  }

  const actions = document.createElement('div')
  actions.className = 'lesson-study-actions'

  const actionsConfig = [
    { label: 'знаю', action: 'know' as const },
    { label: 'учить', action: 'learn' as const },
  ] as const
  const actionButtons: HTMLButtonElement[] = []

  // Создаём один раз, а не заново при каждом showCard() — раньше кнопка пересоздавалась
  // на каждый рендер финального экрана и тут же отбрасывалась проверкой querySelector.
  const restartBtn = document.createElement('button')
  restartBtn.type = 'button'
  restartBtn.className = 'lesson-study-restart'
  restartBtn.textContent = restartLabel
  restartBtn.addEventListener('click', () => {
    onRestart?.()
  })

  function submitCurrentAnswer(action: 'learn' | 'know'): void {
    if (!hasCurrentWord()) {
      resetSwipeVisual(false)
      return
    }
    // Ответ фиксируется сразу; сама смена карточки может быть отложена (см. revealBeforeAdvancing) —
    // блокируем повторный ввод на всё время этой паузы, а не только на анимацию свайпа.
    swipeAnimating = true
    for (const b of actionButtons) {
      b.disabled = true
    }
    audioBtn.disabled = true
    hintToggle.disabled = true

    const idx = timeline[cursor]!
    const current = words[idx]!
    const state = onWordAction?.(current.lessonNumber, current.es, action)
    // В режиме review — просто следующая карточка по списку, без перемешивания и без
    // повторной вставки неотвеченных слов (в отличие от урока).
    if (!isReview) {
      const key = normalizeWord(current.es)
      if (state?.mastered) {
        masteredWordKeys.add(key)
      } else {
        appendRandomReview(idx)
      }
    }
    revealBeforeAdvancing()
  }

  /**
   * Перед переходом к следующей карточке раскрывает всё, что было скрыто на текущей, и
   * при необходимости проигрывает произношение — чтобы поспешный ответ не пропустил слово.
   *
   * - Если звук на этой карточке ещё не звучал и файл для него есть — проигрываем его,
   *   пауза = длительность звука + 0.1с, но не короче 1.5с.
   * - Если звук уже звучал (или файла нет) — просто раскрываем скрытое, пауза ровно 1.5с.
   * - Если раскрывать нечего и звук уже звучал — переходим сразу, без искусственной паузы.
   */
  function revealBeforeAdvancing(): void {
    const minPauseMs = 1500
    const hiddenFields = (['image', 'es', 'ru'] as const).filter((f) => !isFieldVisible(f))
    for (const f of hiddenFields) {
      cardOverride[f] = true
    }
    renderEs()
    renderRu()
    renderImage()

    const hasAudioSrc = Boolean(currentEs && getCardAudioSrc(currentLessonNumber, currentEs, currentAsset))
    const needsAudio = !audioPlayedThisCard && hasAudioSrc
    const needsReveal = hiddenFields.length > 0

    if (!needsAudio && !needsReveal) {
      nextCard()
      return
    }

    if (!needsAudio) {
      window.setTimeout(nextCard, minPauseMs)
      return
    }

    audioPlayedThisCard = true
    const audioEl = playCardAudio(currentLessonNumber, currentEs, currentAsset)
    if (!audioEl) {
      window.setTimeout(nextCard, minPauseMs)
      return
    }

    const startedAt = performance.now()
    let settled = false
    const proceed = () => {
      if (settled) return
      settled = true
      audioEl.removeEventListener('ended', onEnded)
      audioEl.removeEventListener('error', onEnded)
      window.clearTimeout(safetyTimer)
      const elapsed = performance.now() - startedAt
      const remaining = Math.max(100, minPauseMs - elapsed)
      window.setTimeout(nextCard, remaining)
    }
    const onEnded = () => proceed()
    audioEl.addEventListener('ended', onEnded)
    audioEl.addEventListener('error', onEnded)
    // Подстраховка: если по какой-то причине не сработают ни ended, ни error (например,
    // автоплей молча заблокирован), карточка всё равно не должна зависнуть навсегда.
    const safetyTimer = window.setTimeout(proceed, 5000)
  }

  /** Лесон: освоены все слова урока. Review: дошли до конца списка. */
  function isSessionComplete(): boolean {
    if (isReview) return words.length > 0 && cursor >= timeline.length
    return totalInLesson > 0 && startMastered + masteredWordKeys.size >= totalInLesson
  }

  function showCard(): void {
    ensurePlayableQueue()

    if (isSessionComplete()) {
      esEl.classList.remove('lesson-study-es--hidden')
      esEl.lang = 'ru'
      esEl.textContent = completedTitle
      ruEl.classList.remove('lesson-study-ru--hidden')
      ruEl.textContent = completedSubtitle
      currentEs = ''
      currentRu = ''
      currentAsset = undefined
      currentImgSrc = undefined
      audioPlayedThisCard = false
      audioBtn.disabled = true
      renderHearts(3)
      renderCounter()
      hintText.textContent = ''
      hintText.hidden = true
      hintToggle.disabled = true
      renderImage()
      for (const b of actionButtons) {
        b.disabled = true
      }
      if (!restartBtn.isConnected) {
        actions.appendChild(restartBtn)
      }
      return
    }

    if (words.length === 0) {
      esEl.classList.remove('lesson-study-es--hidden')
      esEl.lang = 'ru'
      esEl.textContent = emptyTitle
      ruEl.classList.remove('lesson-study-ru--hidden')
      ruEl.textContent = emptySubtitle
      currentEs = ''
      currentRu = ''
      currentAsset = undefined
      currentImgSrc = undefined
      audioPlayedThisCard = false
      hearts.replaceChildren()
      renderCounter()
      hintText.textContent = ''
      hintText.hidden = true
      hintToggle.disabled = true
      audioBtn.disabled = true
      renderImage()
      for (const b of actionButtons) {
        b.disabled = true
      }
      return
    }
    if (cursor >= timeline.length) return

    const w = words[timeline[cursor]!]!
    currentEs = w.es
    currentRu = w.ru
    currentAsset = w.asset
    currentLessonNumber = w.lessonNumber
    currentImgSrc = getCardImageSrc(w.lessonNumber, w.es, w.asset)
    lessonLabel.textContent = `Урок ${w.lessonNumber}`
    // Новая карточка — ручные тапы по прошлой карточке не переносятся, действует глобальный режим.
    cardOverride = {}
    audioPlayedThisCard = false
    audioBtn.disabled = false
    img.alt = w.es
    const seenState = onWordSeen?.(w.lessonNumber, w.es)
    renderCounter()
    renderHearts(seenState?.consecutiveKnow ?? 0)
    const hint = w.hint
    isHintOpen = false
    hintText.hidden = true
    hintText.textContent = hint ?? ''
    hintToggle.disabled = !hint

    if (currentImgSrc) {
      if (img.src !== currentImgSrc) {
        imgWrap.classList.add('is-loading')
        img.src = currentImgSrc
      }
      // Картинка уже в кеше — крутилку показывать незачем.
      if (img.complete && img.naturalWidth > 0) imgWrap.classList.remove('is-loading')
    } else {
      imgWrap.classList.remove('is-loading')
      img.removeAttribute('src')
    }

    // Тянем ближайшие карточки заранее, чтобы к моменту показа они уже были готовы.
    for (let ahead = 1; ahead <= 3; ahead += 1) {
      const nextIndex = timeline[cursor + ahead]
      if (nextIndex === undefined) break
      const nextWord = words[nextIndex]
      if (nextWord) {
        preloadCardImage(getCardImageSrc(nextWord.lessonNumber, nextWord.es, nextWord.asset))
      }
    }
    renderEs()
    renderRu()
    renderImage()

    for (const b of actionButtons) {
      b.disabled = false
    }
  }

  function nextCard(): void {
    cursor += 1
    swipeAnimating = false
    resetSwipeVisual(false)
    showCard()
  }

  /** Есть ли сейчас слово, на которое можно ответить (не «Урок завершен» и не «Нет слов»). */
  function hasCurrentWord(): boolean {
    if (words.length === 0) return false
    if (isSessionComplete()) return false
    return timeline[cursor] !== undefined
  }

  let touchStartX = 0
  let touchStartY = 0
  let swipeDx = 0
  let isSwipeDragging = false
  let swipeDecisionMade = false
  let swipeAnimating = false
  const swipeThreshold = 70
  const swipeDecisionThreshold = 12

  function applySwipeVisual(dx: number): void {
    swipeDx = dx
    const rotateDeg = Math.max(-10, Math.min(10, dx / 18))
    const opacity = Math.max(0.75, 1 - Math.abs(dx) / 700)
    const progress = Math.max(0, Math.min(1, Math.abs(dx) / 180))
    if (dx < 0) {
      root.style.setProperty('--swipe-know', progress.toFixed(3))
      root.style.setProperty('--swipe-learn', '0')
    } else if (dx > 0) {
      root.style.setProperty('--swipe-learn', progress.toFixed(3))
      root.style.setProperty('--swipe-know', '0')
    } else {
      root.style.setProperty('--swipe-learn', '0')
      root.style.setProperty('--swipe-know', '0')
    }
    swipeCard.style.transform = `translateX(${dx}px) rotate(${rotateDeg}deg)`
    swipeCard.style.opacity = String(opacity)
  }

  function resetSwipeVisual(animated: boolean): void {
    swipeCard.classList.toggle('is-swipe-dragging', !animated && isSwipeDragging)
    if (animated) {
      swipeCard.classList.remove('is-swipe-dragging')
      swipeCard.style.transition = 'transform 180ms ease, opacity 180ms ease'
    } else {
      swipeCard.style.transition = 'none'
    }
    swipeCard.style.transform = ''
    swipeCard.style.opacity = ''
    root.style.setProperty('--swipe-know', '0')
    root.style.setProperty('--swipe-learn', '0')
    swipeDx = 0
  }

  function commitSwipe(action: 'learn' | 'know', direction: -1 | 1): void {
    // Без текущего слова (экран «Урок завершен» / «Нет слов») отвечать нечем — карточка
    // раньше всё равно улетала за экран и не возвращалась, вешая приложение.
    if (swipeAnimating || !hasCurrentWord()) {
      resetSwipeVisual(true)
      return
    }
    swipeAnimating = true
    for (const b of actionButtons) {
      b.disabled = true
    }
    swipeCard.classList.remove('is-swipe-dragging')
    swipeCard.style.transition = 'transform 160ms ease-out, opacity 160ms ease-out'
    swipeCard.style.transform = `translateX(${direction * 480}px) rotate(${direction * 14}deg)`
    swipeCard.style.opacity = '0.15'

    window.setTimeout(() => {
      // swipeAnimating сбросит nextCard() внутри submitCurrentAnswer → revealBeforeAdvancing —
      // сбрасывать здесь нельзя, иначе ввод разблокируется ещё до конца паузы раскрытия/звука.
      submitCurrentAnswer(action)
    }, 165)
  }

  // Pointer Events вместо Touch Events: тот же жест работает мышью и стилусом,
  // а не только пальцем на сенсорном экране.
  let activePointerId: number | null = null

  root.addEventListener(
    'pointerdown',
    (e) => {
      if (swipeAnimating) return
      if (e.pointerType === 'mouse' && e.button !== 0) return
      activePointerId = e.pointerId
      touchStartX = e.clientX
      touchStartY = e.clientY
      swipeDx = 0
      isSwipeDragging = false
      swipeDecisionMade = false
      swipeCard.style.transition = 'none'
    },
    { passive: true }
  )
  root.addEventListener(
    'pointermove',
    (e) => {
      if (swipeAnimating) return
      if (activePointerId === null || e.pointerId !== activePointerId) return
      const dx = e.clientX - touchStartX
      const dy = e.clientY - touchStartY

      if (!swipeDecisionMade) {
        if (Math.abs(dx) < swipeDecisionThreshold && Math.abs(dy) < swipeDecisionThreshold) {
          return
        }
        swipeDecisionMade = true
        isSwipeDragging = Math.abs(dx) > Math.abs(dy)
        if (isSwipeDragging) {
          swipeCard.classList.add('is-swipe-dragging')
          root.setPointerCapture(e.pointerId)
        }
      }

      if (!isSwipeDragging) return
      e.preventDefault()
      applySwipeVisual(dx)
    },
    { passive: false }
  )

  function endPointerSwipe(e: PointerEvent): void {
    if (activePointerId === null || e.pointerId !== activePointerId) return
    activePointerId = null
    if (swipeAnimating) return
    if (!isSwipeDragging) {
      resetSwipeVisual(false)
      return
    }
    const dx = swipeDx
    if (Math.abs(dx) >= swipeThreshold) {
      if (dx < 0) {
        commitSwipe('know', -1)
      } else {
        commitSwipe('learn', 1)
      }
    } else {
      resetSwipeVisual(true)
    }
    isSwipeDragging = false
    swipeDecisionMade = false
  }

  root.addEventListener('pointerup', endPointerSwipe, { passive: true })
  root.addEventListener(
    'pointercancel',
    (e) => {
      if (activePointerId !== null && e.pointerId !== activePointerId) return
      activePointerId = null
      isSwipeDragging = false
      swipeDecisionMade = false
      resetSwipeVisual(true)
    },
    { passive: true }
  )

  for (const item of actionsConfig) {
    const b = document.createElement('button')
    b.type = 'button'
    b.className = 'lesson-study-action'
    b.textContent = item.label
    b.addEventListener('click', () => {
      if (swipeAnimating) return
      submitCurrentAnswer(item.action)
    })
    actionButtons.push(b)
    actions.appendChild(b)
  }

  renderCounter()
  showCard()

  swipeCard.append(scroll, actions)
  root.append(fillKnow, fillLearn, swipeCard)

  return root
}
