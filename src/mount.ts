import { TAB_IDS, createTabStore, type TabId } from './nav'
import { panelHint, panelTitle } from './content'
import { createSection1TopicList } from './section1/render'
import { createSection3Categories } from './section3/render'
import { getLessonWords } from './section1'
import { flattenLessonWords } from './section1/flattenLessonWords'
import { createLessonStudyView, type StudyCard } from './section1/lessonStudyView'
import {
  getLessonMasteredCount,
  isWordMastered,
  markWordSeen,
  recordWordAttempt,
  resetLessonProgress,
  type WordCategoryItem,
} from './section3/progress'

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props?: Partial<HTMLElementTagNameMap[K]> & { className?: string },
  children?: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  if (props) {
    Object.assign(node, props)
    if ('className' in props && props.className) {
      node.className = props.className
    }
  }
  if (children) {
    for (const c of children) {
      node.append(typeof c === 'string' ? document.createTextNode(c) : c)
    }
  }
  return node
}

export type MountOptions = {
  /** Имя пользователя для шапки — пусто в офлайн-сборке, где входа нет. */
  userName?: string
}

export function mountApp(root: HTMLElement, options: MountOptions = {}): void {
  const store = createTabStore('1')

  const heading = el('h1')
  const hint = el('p')

  // Шапка: слева заголовок раздела, справа — под кем вошли.
  const userBadge = el('span', { className: 'app-user-badge' })
  userBadge.textContent = options.userName ?? ''
  userBadge.hidden = !options.userName

  const headingRow = el('div', { className: 'app-panel-heading-row' }, [heading, userBadge])
  const body = el('div', { className: 'app-panel-body' })
  const defaultBody = el('div', { className: 'app-card' }, [
    'Карточки появятся здесь',
  ])

  const panel = el('section', { className: 'app-panel' })
  panel.id = 'panel-main'
  panel.setAttribute('role', 'tabpanel')
  panel.setAttribute('aria-labelledby', 'tab-1')
  panel.append(headingRow, hint, body)

  const main = el('main', { className: 'app-main' }, [panel])

  const lessonOverlay = el('div', { className: 'app-lesson-overlay' })
  lessonOverlay.setAttribute('aria-hidden', 'true')

  const tabElements = new Map<TabId, HTMLButtonElement>()

  const nav = el('nav', { className: 'app-bottom-nav' })
  nav.setAttribute('role', 'tablist')
  nav.setAttribute('aria-label', 'Основные разделы')

  for (const id of TAB_IDS) {
    const btn = el('button', { type: 'button' })
    btn.id = `tab-${id}`
    btn.setAttribute('role', 'tab')
    btn.setAttribute('aria-controls', 'panel-main')
    btn.setAttribute('aria-selected', String(id === store.get()))
    btn.tabIndex = id === store.get() ? 0 : -1
    btn.textContent = id
    btn.addEventListener('click', () => store.set(id))
    tabElements.set(id, btn)
    nav.appendChild(btn)
  }

  // Куда вернуть фокус после закрытия урока (карточка урока, которую нажали).
  let elementToRefocusOnClose: HTMLElement | null = null

  function onLessonKeydown(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      e.preventDefault()
      closeLesson()
    }
  }

  /** Общий показ полноэкранного оверлея карточки — и для урока (раздел 1), и для ревью (раздел 3). */
  function showStudyOverlay(view: HTMLElement): void {
    elementToRefocusOnClose = document.activeElement instanceof HTMLElement ? document.activeElement : null
    lessonOverlay.replaceChildren(view)
    lessonOverlay.classList.add('is-open')
    lessonOverlay.setAttribute('aria-hidden', 'false')
    main.classList.add('is-hidden')
    nav.classList.add('is-hidden')
    document.documentElement.classList.add('lesson-open')
    document.addEventListener('keydown', onLessonKeydown)
    // Без клавиатурного доступа урок можно было закрыть только свайпом/кликом мыши.
    const backBtn = view.querySelector<HTMLElement>('.lesson-study-back')
    ;(backBtn ?? view).focus()
  }

  function openLesson(lessonNumber: number): void {
    const file = getLessonWords(lessonNumber)
    const totals = getLessonMasteredCount(lessonNumber)
    const words: StudyCard[] = file
      ? flattenLessonWords(file)
          .filter((w) => !isWordMastered(lessonNumber, w.es))
          .map((w) => ({ ...w, lessonNumber }))
      : []
    const view = createLessonStudyView({
      words,
      totalWords: totals.total,
      masteredStartCount: totals.mastered,
      onRestart: () => {
        resetLessonProgress(lessonNumber)
        openLesson(lessonNumber)
      },
      onWordSeen: (ln, es) => markWordSeen(ln, es),
      onWordAction: (ln, es, action) => recordWordAttempt(ln, es, action),
      onBack: closeLesson,
    })
    showStudyOverlay(view)
  }

  /** Карточка открыта из блока 3 (список слов): линейный проход по переданному списку,
   *  начиная с нажатой карточки — а не по одному уроку. */
  function openReview(items: WordCategoryItem[], startIndex: number): void {
    const words: StudyCard[] = items.map((item) => ({
      es: item.es,
      ru: item.ru,
      hint: item.hint,
      asset: item.asset,
      lessonNumber: item.lessonNumber,
    }))
    const view = createLessonStudyView({
      words,
      startIndex,
      mode: 'review',
      completedTitle: '✅ Просмотр завершён',
      completedSubtitle: 'Вы прошли все карточки этого списка.',
      restartLabel: 'Смотреть заново',
      emptyTitle: 'Нет карточек',
      emptySubtitle: 'В этом списке пока нет карточек.',
      onRestart: () => openReview(items, 0),
      onWordSeen: (ln, es) => markWordSeen(ln, es),
      onWordAction: (ln, es, action) => recordWordAttempt(ln, es, action),
      onBack: closeLesson,
    })
    showStudyOverlay(view)
  }

  function closeLesson(): void {
    lessonOverlay.classList.remove('is-open')
    lessonOverlay.setAttribute('aria-hidden', 'true')
    lessonOverlay.replaceChildren()
    main.classList.remove('is-hidden')
    nav.classList.remove('is-hidden')
    document.documentElement.classList.remove('lesson-open')
    document.removeEventListener('keydown', onLessonKeydown)
    elementToRefocusOnClose?.focus()
    elementToRefocusOnClose = null
  }

  function syncUi(tab: TabId): void {
    // В блоке 3 заголовок и подсказка не нужны — там сразу начинаются кнопки категорий,
    // остальным вкладкам текст оставляем как есть.
    const showHeader = tab !== '3'
    headingRow.hidden = !showHeader
    heading.hidden = !showHeader
    hint.hidden = !showHeader
    heading.textContent = showHeader ? panelTitle(tab) : ''
    hint.textContent = showHeader ? panelHint(tab) : ''
    panel.setAttribute('aria-labelledby', `tab-${tab}`)

    body.replaceChildren()
    if (tab === '1') {
      body.appendChild(
        createSection1TopicList({
          onLessonSelect: openLesson,
          getLessonProgress: (lessonNumber) => getLessonMasteredCount(lessonNumber),
        })
      )
    } else if (tab === '3') {
      body.appendChild(createSection3Categories({ onOpenReview: openReview }))
    } else {
      body.appendChild(defaultBody)
    }

    for (const id of TAB_IDS) {
      const b = tabElements.get(id)!
      const selected = id === tab
      b.setAttribute('aria-selected', String(selected))
      b.tabIndex = selected ? 0 : -1
    }
  }

  syncUi(store.get())
  store.subscribe(syncUi)

  root.append(main, nav, lessonOverlay)
}
