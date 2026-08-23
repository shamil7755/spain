import {
  getCategoryWords,
  toggleFavoriteByKey,
  setFavoriteForKeys,
  moveWordsToCategory,
  type MasteryCategory,
  type WordCategoryItem,
} from './progress'
import { getCardImageSrc } from '../section1/cardImages'
import { playCardAudio } from '../section1/cardAudio'
import { ALL_LESSON_WORDS } from '../section1/lessons'

const CATEGORY_LABELS = [
  { id: 'all', title: 'Все слова' },
  { id: 'easy', title: 'Легко' },
  { id: 'medium', title: 'Средняя' },
  { id: 'hard', title: 'Сложно' },
  { id: 'favorites', title: '★ Избранное' },
] as const

type CategoryId = (typeof CATEGORY_LABELS)[number]['id']

const MOVE_TARGETS: { id: MasteryCategory; title: string }[] = [
  { id: 'easy', title: 'Легко' },
  { id: 'medium', title: 'Средняя' },
  { id: 'hard', title: 'Сложно' },
]

/** Только уроки, где реально есть слова — остальные 15 пустых заготовок незачем предлагать в фильтре. */
const LESSONS_WITH_WORDS = ALL_LESSON_WORDS.filter((l) => l.groups.some((g) => g.entries.length > 0)).map(
  (l) => l.lessonNumber
)

export type Section3Options = {
  /** Открыть карточку на весь экран и идти по списку `items`, начиная с позиции `startIndex`. */
  onOpenReview: (items: WordCategoryItem[], startIndex: number) => void
}

/** Верхняя строка категорий + фильтр по урокам + список слов раздела 3. */
export function createSection3Categories(options: Section3Options): HTMLElement {
  const { onOpenReview } = options
  const root = document.createElement('div')
  root.className = 'section3-root'

  const categoryRow = document.createElement('div')
  categoryRow.className = 'section3-categories'

  const toolbarRow = document.createElement('div')
  toolbarRow.className = 'section3-toolbar'

  const bulkBar = document.createElement('div')
  bulkBar.className = 'section3-bulk-bar'
  bulkBar.hidden = true

  const list = document.createElement('div')
  list.className = 'section3-list'

  let activeCategory: CategoryId = 'all'
  const selectedLessons = new Set<number>()
  let isSelectionMode = false
  const selectedKeys = new Set<string>()

  /** Категория × уроки — оба фильтра действуют одновременно. */
  function currentItems(): WordCategoryItem[] {
    const all = getCategoryWords(activeCategory)
    if (selectedLessons.size === 0) return all
    return all.filter((item) => selectedLessons.has(item.lessonNumber))
  }

  // ---- Фильтр по урокам: раскрывающийся список с чекбоксами, можно выбрать несколько ----
  const lessonFilter = document.createElement('details')
  lessonFilter.className = 'section3-lesson-filter'
  const lessonFilterSummary = document.createElement('summary')
  const lessonFilterList = document.createElement('div')
  lessonFilterList.className = 'section3-lesson-filter-list'
  lessonFilter.append(lessonFilterSummary, lessonFilterList)

  function syncLessonFilterSummary(): void {
    if (selectedLessons.size === 0) {
      lessonFilterSummary.textContent = 'Все уроки'
      return
    }
    const nums = [...selectedLessons].sort((a, b) => a - b)
    lessonFilterSummary.textContent = `Уроки: ${nums.join(', ')}`
  }

  for (const n of LESSONS_WITH_WORDS) {
    const label = document.createElement('label')
    label.className = 'section3-lesson-filter-item'
    const cb = document.createElement('input')
    cb.type = 'checkbox'
    cb.addEventListener('change', () => {
      if (cb.checked) selectedLessons.add(n)
      else selectedLessons.delete(n)
      syncLessonFilterSummary()
      exitSelectionMode()
      renderList()
    })
    const span = document.createElement('span')
    span.textContent = `Урок ${n}`
    label.append(cb, span)
    lessonFilterList.appendChild(label)
  }
  syncLessonFilterSummary()

  // ---- Переключатель режима выбора карточек ----
  const selectToggleBtn = document.createElement('button')
  selectToggleBtn.type = 'button'
  selectToggleBtn.className = 'section3-select-toggle-btn'

  function syncSelectToggleBtn(): void {
    selectToggleBtn.textContent = isSelectionMode ? 'Готово' : 'Выбрать'
    selectToggleBtn.setAttribute('aria-pressed', String(isSelectionMode))
  }
  syncSelectToggleBtn()

  function exitSelectionMode(): void {
    isSelectionMode = false
    selectedKeys.clear()
    syncSelectToggleBtn()
    bulkBar.hidden = true
  }

  selectToggleBtn.addEventListener('click', () => {
    if (isSelectionMode) {
      exitSelectionMode()
    } else {
      isSelectionMode = true
      syncSelectToggleBtn()
      bulkBar.hidden = false
      syncBulkBar()
    }
    renderList()
  })

  toolbarRow.append(lessonFilter, selectToggleBtn)

  // ---- Панель массовых действий (видна только в режиме выбора) ----
  const bulkCountEl = document.createElement('span')
  bulkCountEl.className = 'section3-bulk-count'

  const selectAllBtn = document.createElement('button')
  selectAllBtn.type = 'button'
  selectAllBtn.className = 'section3-bulk-btn'

  function allVisibleSelected(): boolean {
    const items = currentItems()
    return items.length > 0 && items.every((i) => selectedKeys.has(i.key))
  }

  selectAllBtn.addEventListener('click', () => {
    const items = currentItems()
    if (allVisibleSelected()) {
      for (const i of items) selectedKeys.delete(i.key)
    } else {
      for (const i of items) selectedKeys.add(i.key)
    }
    syncBulkBar()
    renderList()
  })

  const studyBtn = document.createElement('button')
  studyBtn.type = 'button'
  studyBtn.className = 'section3-bulk-btn section3-bulk-btn--primary'
  studyBtn.textContent = '▶ Изучить'
  studyBtn.addEventListener('click', () => {
    const items = currentItems().filter((i) => selectedKeys.has(i.key))
    if (items.length === 0) return
    onOpenReview(items, 0)
  })

  const moveDetails = document.createElement('details')
  moveDetails.className = 'section3-move-menu'
  const moveSummary = document.createElement('summary')
  moveSummary.className = 'section3-bulk-btn'
  moveSummary.textContent = 'Переместить в'
  const moveList = document.createElement('div')
  moveList.className = 'section3-move-menu-list'
  for (const target of MOVE_TARGETS) {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'section3-move-menu-item'
    btn.textContent = target.title
    btn.addEventListener('click', () => {
      if (selectedKeys.size === 0) return
      moveWordsToCategory([...selectedKeys], target.id)
      moveDetails.open = false
      selectedKeys.clear()
      syncBulkBar()
      renderList()
    })
    moveList.appendChild(btn)
  }
  moveDetails.append(moveSummary, moveList)

  // Раскрытые <details> сами не закрываются по клику вне себя — оставшись открытыми,
  // они толкают остальной контент вниз. Слушатель на document снимает сам себя, как только
  // этот экран убран из DOM (переключение вкладки пересоздаёт раздел 3 заново) — иначе он
  // накапливался бы при каждом возврате на вкладку 3.
  function onOutsideClick(e: MouseEvent): void {
    if (!root.isConnected) {
      document.removeEventListener('click', onOutsideClick)
      return
    }
    const target = e.target instanceof Node ? e.target : null
    if (lessonFilter.open && !(target && lessonFilter.contains(target))) {
      lessonFilter.open = false
    }
    if (moveDetails.open && !(target && moveDetails.contains(target))) {
      moveDetails.open = false
    }
  }
  document.addEventListener('click', onOutsideClick)

  const favAddBtn = document.createElement('button')
  favAddBtn.type = 'button'
  favAddBtn.className = 'section3-bulk-btn'
  favAddBtn.textContent = '★ В избранное'
  favAddBtn.addEventListener('click', () => {
    if (selectedKeys.size === 0) return
    setFavoriteForKeys([...selectedKeys], true)
    selectedKeys.clear()
    syncBulkBar()
    renderList()
  })

  const favRemoveBtn = document.createElement('button')
  favRemoveBtn.type = 'button'
  favRemoveBtn.className = 'section3-bulk-btn'
  favRemoveBtn.textContent = '☆ Убрать из избранного'
  favRemoveBtn.addEventListener('click', () => {
    if (selectedKeys.size === 0) return
    setFavoriteForKeys([...selectedKeys], false)
    selectedKeys.clear()
    syncBulkBar()
    renderList()
  })

  const cancelBtn = document.createElement('button')
  cancelBtn.type = 'button'
  cancelBtn.className = 'section3-bulk-btn'
  cancelBtn.textContent = 'Отмена'
  cancelBtn.addEventListener('click', () => {
    exitSelectionMode()
    renderList()
  })

  bulkBar.append(bulkCountEl, selectAllBtn, studyBtn, moveDetails, favAddBtn, favRemoveBtn, cancelBtn)

  function syncBulkBar(): void {
    bulkCountEl.textContent = `Выбрано: ${selectedKeys.size}`
    selectAllBtn.textContent = allVisibleSelected() ? 'Снять всё' : 'Выбрать всё'
    const hasSelection = selectedKeys.size > 0
    studyBtn.disabled = !hasSelection
    favAddBtn.disabled = !hasSelection
    favRemoveBtn.disabled = !hasSelection
  }

  function renderList(): void {
    const items = currentItems()
    list.replaceChildren()

    if (items.length === 0) {
      const empty = document.createElement('div')
      empty.className = 'section3-empty'
      empty.textContent = 'Пока нет слов в этой категории.'
      list.appendChild(empty)
      return
    }

    items.forEach((item, index) => {
      const card = document.createElement('article')
      card.className = 'section3-word-card'
      card.classList.toggle('is-selection-mode', isSelectionMode)
      const isSelected = selectedKeys.has(item.key)
      card.classList.toggle('is-selected', isSelectionMode && isSelected)
      card.setAttribute('role', 'button')
      card.tabIndex = 0
      card.setAttribute(
        'aria-label',
        isSelectionMode ? `${isSelected ? 'Убрать' : 'Выбрать'} ${item.es}` : `Открыть карточку ${item.es}`
      )

      function activateCard(): void {
        if (isSelectionMode) {
          if (selectedKeys.has(item.key)) selectedKeys.delete(item.key)
          else selectedKeys.add(item.key)
          syncBulkBar()
          renderList()
        } else {
          onOpenReview(items, index)
        }
      }
      card.addEventListener('click', activateCard)
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          activateCard()
        }
      })

      const wordRow = document.createElement('div')
      wordRow.className = 'section3-word-row'

      if (isSelectionMode) {
        const checkbox = document.createElement('span')
        checkbox.className = 'section3-select-checkbox'
        checkbox.setAttribute('aria-hidden', 'true')
        checkbox.textContent = isSelected ? '✓' : ''
        wordRow.appendChild(checkbox)
      }

      const thumb = document.createElement('img')
      thumb.className = 'section3-word-thumb'
      thumb.alt = ''
      const thumbSrc = getCardImageSrc(item.lessonNumber, item.es, item.asset)
      if (thumbSrc) {
        thumb.src = thumbSrc
      } else {
        thumb.classList.add('is-hidden')
      }

      const content = document.createElement('div')
      content.className = 'section3-word-content'

      const top = document.createElement('div')
      top.className = 'section3-word-top'

      const es = document.createElement('p')
      es.className = 'section3-word-es'
      es.lang = 'es'
      es.textContent = item.es

      const favBtn = document.createElement('button')
      favBtn.type = 'button'
      favBtn.className = 'section3-fav-btn'

      function syncFavoriteUi(isFavorite: boolean): void {
        favBtn.textContent = isFavorite ? '★' : '☆'
        favBtn.setAttribute('aria-pressed', String(isFavorite))
        favBtn.setAttribute(
          'aria-label',
          isFavorite ? 'Убрать из избранного' : 'Добавить в избранное'
        )
      }
      syncFavoriteUi(item.isFavorite)
      favBtn.addEventListener('click', () => {
        const isFavorite = toggleFavoriteByKey(item.key)
        syncFavoriteUi(isFavorite)
        if (activeCategory === 'favorites' && !isFavorite) renderList()
      })

      const audioBtn = document.createElement('button')
      audioBtn.type = 'button'
      audioBtn.className = 'section3-audio-btn'
      audioBtn.textContent = '🔊'
      audioBtn.setAttribute('aria-label', `Озвучить ${item.es}`)
      audioBtn.addEventListener('click', () => {
        playCardAudio(item.lessonNumber, item.es, item.asset)
      })

      const actionsEl = document.createElement('div')
      actionsEl.className = 'section3-word-actions'
      // Кнопки внутри кликабельной карточки: клик/Enter/Space на них не должны также
      // открывать/выделять саму карточку — гасим всплытие один раз на контейнере.
      actionsEl.addEventListener('click', (e) => e.stopPropagation())
      actionsEl.addEventListener('keydown', (e) => e.stopPropagation())
      actionsEl.append(audioBtn, favBtn)

      top.append(es, actionsEl)

      const ru = document.createElement('p')
      ru.className = 'section3-word-ru'
      ru.textContent = item.ru

      const meta = document.createElement('p')
      meta.className = 'section3-word-meta'
      meta.textContent = `Урок ${item.lessonNumber}`

      content.append(top, ru, meta)
      wordRow.append(thumb, content)
      card.append(wordRow)
      list.appendChild(card)
    })
  }

  for (const [index, category] of CATEGORY_LABELS.entries()) {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'section3-category-btn'
    btn.textContent = category.title
    btn.setAttribute('aria-pressed', String(index === 0))
    btn.addEventListener('click', () => {
      for (const other of categoryRow.querySelectorAll<HTMLButtonElement>('.section3-category-btn')) {
        other.setAttribute('aria-pressed', String(other === btn))
      }
      activeCategory = category.id
      exitSelectionMode()
      renderList()
    })
    categoryRow.appendChild(btn)
  }

  renderList()
  root.append(categoryRow, toolbarRow, bulkBar, list)
  return root
}
