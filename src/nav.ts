export type TabId = '1' | '2' | '3' | '4'

export const TAB_IDS: readonly TabId[] = ['1', '2', '3', '4'] as const

export type TabListener = (tab: TabId) => void

export function createTabStore(initial: TabId) {
  let current = initial
  const listeners = new Set<TabListener>()

  return {
    get(): TabId {
      return current
    },
    set(next: TabId): void {
      if (next === current) return
      current = next
      listeners.forEach((fn) => fn(current))
    },
    subscribe(fn: TabListener): () => void {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
  }
}
