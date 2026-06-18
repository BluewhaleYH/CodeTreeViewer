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

describe('TabStore — 탭 추가/닫기/전환 (M2_2)', () => {
  it('setActive로 탭을 전환한다', () => {
    const store = new TabStore()
    const a = store.addEmptyTab()
    const b = store.addEmptyTab()
    expect(store.getActiveId()).toBe(b.id)
    store.setActive(a.id)
    expect(store.getActiveId()).toBe(a.id)
  })

  it('활성 탭을 닫으면 다음 탭(없으면 이전)을 활성화한다', () => {
    const store = new TabStore()
    const a = store.addEmptyTab()
    const b = store.addEmptyTab()
    const c = store.addEmptyTab()
    store.setActive(b.id)
    store.closeTab(b.id)
    // b 자리에 있던 다음 탭 c가 활성화
    expect(store.getActiveId()).toBe(c.id)
    expect(store.getTabs().map((t) => t.id)).toEqual([a.id, c.id])
  })

  it('마지막 탭을 닫으면 이전 탭을 활성화한다', () => {
    const store = new TabStore()
    const a = store.addEmptyTab()
    const b = store.addEmptyTab()
    store.setActive(b.id)
    store.closeTab(b.id)
    expect(store.getActiveId()).toBe(a.id)
  })

  it('유일한 탭을 닫으면 활성 탭이 없다', () => {
    const store = new TabStore()
    const a = store.addEmptyTab()
    store.closeTab(a.id)
    expect(store.getTabs()).toHaveLength(0)
    expect(store.getActiveId()).toBeNull()
  })

  it('비활성 탭을 닫아도 활성 탭은 유지된다', () => {
    const store = new TabStore()
    const a = store.addEmptyTab()
    const b = store.addEmptyTab()
    expect(store.getActiveId()).toBe(b.id)
    store.closeTab(a.id)
    expect(store.getActiveId()).toBe(b.id)
  })
})

describe('TabStore — 탭별 독립 상태 컨테이너 (M2_4)', () => {
  it('새 탭은 기본 뷰 모드(graph)를 가진다', () => {
    const store = new TabStore()
    const tab = store.addEmptyTab()
    expect(tab.view.mode).toBe('graph')
  })

  it('프로젝트를 열어도 뷰 컨테이너가 초기화된다', () => {
    const store = new TabStore()
    store.addEmptyTab()
    const a = store.openProject('/p/A', 'A')
    const b = store.openProject('/p/B', 'B')
    expect(a.view.mode).toBe('graph')
    expect(b.view.mode).toBe('graph')
  })

  it('한 탭의 뷰 모드를 바꿔도 다른 탭에 영향이 없다 (격리)', () => {
    const store = new TabStore()
    const a = store.addEmptyTab()
    const b = store.addEmptyTab()
    store.setViewMode(a.id, 'tree')
    expect(a.view.mode).toBe('tree')
    expect(b.view.mode).toBe('graph')
  })

  it('탭별 프로젝트와 뷰 상태가 서로 독립적이다', () => {
    const store = new TabStore()
    const a = store.addEmptyTab()
    store.openProject('/p/A', 'A') // a 재사용
    const b = store.openProject('/p/B', 'B') // 새 탭
    store.setViewMode(b.id, 'tree')
    expect(a.projectName).toBe('A')
    expect(a.view.mode).toBe('graph')
    expect(b.projectName).toBe('B')
    expect(b.view.mode).toBe('tree')
  })

  it('동일 모드로 setViewMode 시 통지하지 않는다', () => {
    const store = new TabStore()
    const a = store.addEmptyTab()
    let count = 0
    store.subscribe(() => {
      count += 1
    })
    store.setViewMode(a.id, 'graph') // 이미 graph → 변화 없음
    expect(count).toBe(0)
    store.setViewMode(a.id, 'tree')
    expect(count).toBe(1)
  })
})

describe('TabStore — 분석 상태 (M3_3)', () => {
  const summary = {
    root: '/p',
    fileCount: 3,
    parsedCount: 3,
    failureCount: 0,
    byLanguage: { java: 2, kotlin: 1 },
    skippedDirCount: 0,
    nodeCount: 3,
    edgeCount: 2,
    failures: []
  }

  it('새 탭의 분석 상태는 idle이다', () => {
    const store = new TabStore()
    const tab = store.addEmptyTab()
    expect(tab.analysis.status).toBe('idle')
  })

  it('start→progress→finish 흐름을 반영한다', () => {
    const store = new TabStore()
    const tab = store.openProject('/p', 'p')
    store.startAnalysis(tab.id)
    expect(tab.analysis.status).toBe('running')
    store.setAnalysisProgress(tab.id, { phase: 'parsing', processed: 1, total: 3 })
    expect(tab.analysis.progress?.processed).toBe(1)
    store.finishAnalysis(tab.id, summary)
    expect(tab.analysis.status).toBe('done')
    expect(tab.analysis.summary?.fileCount).toBe(3)
    expect(tab.analysis.progress).toBeNull()
  })

  it('running이 아닐 때 progress는 무시한다', () => {
    const store = new TabStore()
    const tab = store.openProject('/p', 'p')
    store.setAnalysisProgress(tab.id, { phase: 'parsing', processed: 1, total: 3 })
    expect(tab.analysis.progress).toBeNull()
  })

  it('실패를 기록한다', () => {
    const store = new TabStore()
    const tab = store.openProject('/p', 'p')
    store.startAnalysis(tab.id)
    store.failAnalysis(tab.id, '경로 없음')
    expect(tab.analysis.status).toBe('error')
    expect(tab.analysis.error).toBe('경로 없음')
  })

  it('분석 상태는 탭별로 독립적이다', () => {
    const store = new TabStore()
    const a = store.openProject('/a', 'a')
    const b = store.openProject('/b', 'b')
    store.finishAnalysis(a.id, summary)
    store.startAnalysis(b.id)
    expect(a.analysis.status).toBe('done')
    expect(b.analysis.status).toBe('running')
  })
})
