import type { TabId } from './nav'
import { getSection1Panel } from './section1'

const titles: Record<TabId, string> = {
  '1': getSection1Panel().heading,
  '2': 'Блок 2',
  '3': 'Блок 3',
  '4': 'Блок 4',
}

const hints: Record<TabId, string> = {
  '1': getSection1Panel().hint,
  '2': 'Второй раздел — заготовка под наборы или темы.',
  '3': 'Третий раздел — заготовка.',
  '4': 'Четвёртый раздел — заготовка.',
}

export function panelTitle(tab: TabId): string {
  return titles[tab]
}

export function panelHint(tab: TabId): string {
  return hints[tab]
}
