import { describe, it, expect } from 'vitest'
import { TabStore } from '../src/renderer/src/tabs/tab-store'

describe('TabStore — 프로젝트 열기 (M2_1)', () => {
  it('빈 탭을 추가하면 활성 탭이 된다', () => {
    const store = new TabStore()
    const tab = store.addEmptyTab()
    expect(store.getTabs()).toHaveLength(1)
    expect(store.getActiveId()).toBe(tab.id)
    expect(tab.projectPath).toBeNull()
  })

  it('활성 탭이 비어 있으면 프로젝트를 그 탭에 로드(재사용)한다', () => {
    const store = new TabStore()
    const empty = store.addEmptyTab()
    const loaded = store.openProject('/p/Demo', 'Demo')
    expect(loaded.id).toBe(empty.id)
    expect(store.getTabs()).toHaveLength(1)
    expect(loaded.projectPath).toBe('/p/Demo')
    expect(loaded.projectName).toBe('Demo')
  })

  it('활성 탭에 이미 프로젝트가 있으면 새 탭에 로드한다', () => {
    const store = new TabStore()
    store.addEmptyTab()
    store.openProject('/p/A', 'A')
    const second = store.openProject('/p/B', 'B')
    expect(store.getTabs()).toHaveLength(2)
    expect(store.getActiveId()).toBe(second.id)
    expect(second.projectName).toBe('B')
  })

  it('구독자에게 변경을 통지한다', () => {
    const store = new TabStore()
    let count = 0
    store.subscribe(() => {
      count += 1
    })
    store.addEmptyTab()
    store.openProject('/p/A', 'A')
    expect(count).toBe(2)
  })
})
