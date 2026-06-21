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
    functionNodeCount: 0,
    externalNodeCount: 0,
    domainCount: 1,
    edgeCount: 2,
    callEdgeCount: 0,
    failures: []
  }
  const graph = { nodes: [], edges: [] }

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
    store.finishAnalysis(tab.id, summary, graph)
    expect(tab.analysis.status).toBe('done')
    expect(tab.analysis.summary?.fileCount).toBe(3)
    expect(tab.analysis.graph).toBe(graph)
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
    store.finishAnalysis(a.id, summary, graph)
    store.startAnalysis(b.id)
    expect(a.analysis.status).toBe('done')
    expect(b.analysis.status).toBe('running')
  })
})

describe('TabStore — 세션 직렬화/복원 (M8_3)', () => {
  it('탭 목록과 활성 인덱스를 직렬화한다', () => {
    const store = new TabStore()
    store.openProject('/p/A', 'A')
    store.openProject('/p/B', 'B')
    store.setActive(store.getTabs()[0].id)
    const snapshot = store.serialize()
    expect(snapshot.tabs.map((t) => t.projectPath)).toEqual(['/p/A', '/p/B'])
    expect(snapshot.tabs.map((t) => t.projectName)).toEqual(['A', 'B'])
    expect(snapshot.activeIndex).toBe(0)
  })

  it('빈 탭(프로젝트 미선택)도 직렬화한다', () => {
    const store = new TabStore()
    store.addEmptyTab()
    const snapshot = store.serialize()
    expect(snapshot.tabs).toHaveLength(1)
    expect(snapshot.tabs[0].projectPath).toBeNull()
    expect(snapshot.activeIndex).toBe(0)
  })

  it('활성 탭이 없으면 activeIndex는 0이다', () => {
    const store = new TabStore()
    const snapshot = store.serialize()
    expect(snapshot.tabs).toHaveLength(0)
    expect(snapshot.activeIndex).toBe(0)
  })

  it('직렬화된 탭을 복원하고 활성 탭을 지정한다', () => {
    const store = new TabStore()
    const restored = store.restore(
      [
        { projectPath: '/p/A', projectName: 'A', view: { mode: 'graph', selectedNodeId: null } },
        { projectPath: '/p/B', projectName: 'B', view: { mode: 'tree', selectedNodeId: null } }
      ],
      1
    )
    expect(restored).toHaveLength(2)
    expect(store.getTabs().map((t) => t.projectName)).toEqual(['A', 'B'])
    expect(store.getActiveId()).toBe(restored[1].id)
  })

  it('복원은 기존 탭을 대체한다', () => {
    const store = new TabStore()
    store.addEmptyTab()
    store.openProject('/old', 'Old')
    store.restore(
      [{ projectPath: '/new', projectName: 'New', view: { mode: 'graph', selectedNodeId: null } }],
      0
    )
    expect(store.getTabs()).toHaveLength(1)
    expect(store.getTabs()[0].projectName).toBe('New')
  })

  it('activeIndex가 범위를 벗어나면 첫 탭을 활성화한다', () => {
    const store = new TabStore()
    const restored = store.restore(
      [{ projectPath: '/p/A', projectName: 'A', view: { mode: 'graph', selectedNodeId: null } }],
      5
    )
    expect(store.getActiveId()).toBe(restored[0].id)
  })

  it('빈 목록을 복원하면 활성 탭이 없다', () => {
    const store = new TabStore()
    store.addEmptyTab()
    store.restore([], 0)
    expect(store.getTabs()).toHaveLength(0)
    expect(store.getActiveId()).toBeNull()
  })

  it('serialize→restore 왕복이 탭 구성을 보존한다', () => {
    const store = new TabStore()
    store.openProject('/p/A', 'A')
    store.openProject('/p/B', 'B')
    const snapshot = store.serialize()

    const store2 = new TabStore()
    store2.restore(snapshot.tabs, snapshot.activeIndex)
    expect(store2.serialize()).toEqual(snapshot)
  })
})

describe('TabStore — 뷰 상태(모드/선택 노드) 영속 (M8_4)', () => {
  it('뷰 모드와 선택 노드를 직렬화한다', () => {
    const store = new TabStore()
    const a = store.openProject('/p/A', 'A')
    store.setViewMode(a.id, 'tree')
    store.setSelectedNode(a.id, 'file:Repository.kt')
    const snapshot = store.serialize()
    expect(snapshot.tabs[0].view).toEqual({ mode: 'tree', selectedNodeId: 'file:Repository.kt' })
  })

  it('뷰 모드와 선택 노드를 복원한다', () => {
    const store = new TabStore()
    const restored = store.restore(
      [
        {
          projectPath: '/p/A',
          projectName: 'A',
          view: { mode: 'tree', selectedNodeId: 'file:Api.kt' }
        }
      ],
      0
    )
    expect(restored[0].view.mode).toBe('tree')
    expect(restored[0].view.selectedNodeId).toBe('file:Api.kt')
  })

  it('복원된 뷰는 원본 persisted 객체와 분리된다(참조 비공유)', () => {
    const store = new TabStore()
    const persisted = [
      {
        projectPath: '/p/A',
        projectName: 'A',
        view: { mode: 'graph' as const, selectedNodeId: 'x' }
      }
    ]
    const restored = store.restore(persisted, 0)
    store.setSelectedNode(restored[0].id, 'y')
    expect(persisted[0].view.selectedNodeId).toBe('x')
  })

  it('뷰 상태까지 포함한 serialize→restore 왕복을 보존한다', () => {
    const store = new TabStore()
    const a = store.openProject('/p/A', 'A')
    store.setViewMode(a.id, 'tree')
    store.setSelectedNode(a.id, 'file:A.kt')
    const b = store.openProject('/p/B', 'B')
    store.setSelectedNode(b.id, 'file:B.kt')
    const snapshot = store.serialize()

    const store2 = new TabStore()
    store2.restore(snapshot.tabs, snapshot.activeIndex)
    expect(store2.serialize()).toEqual(snapshot)
  })
})

describe('TabStore — 동일 프로젝트 중복 탭 방지 (TODO_EXTRA D)', () => {
  it('이미 열린 프로젝트를 다시 열면 새 탭 대신 기존 탭으로 포커스한다', () => {
    const store = new TabStore()
    const a = store.openProject('/p/A', 'A')
    const b = store.openProject('/p/B', 'B')
    expect(store.getActiveId()).toBe(b.id)
    const again = store.openProject('/p/A', 'A')
    expect(again.id).toBe(a.id) // 새 탭 아님
    expect(store.getTabs()).toHaveLength(2)
    expect(store.getActiveId()).toBe(a.id)
  })
})

describe('TabStore — 닫은 탭 복원 (TODO_EXTRA D)', () => {
  it('프로젝트 탭을 닫으면 이력에 쌓이고 reopenClosed로 복원한다', () => {
    const store = new TabStore()
    const a = store.openProject('/p/A', 'A')
    store.setViewMode(a.id, 'tree')
    store.closeTab(a.id)
    expect(store.getRecentlyClosed()).toHaveLength(1)

    const reopened = store.reopenClosed()
    expect(reopened).not.toBeNull()
    expect(reopened?.projectPath).toBe('/p/A')
    expect(reopened?.view.mode).toBe('tree') // 뷰 상태 복원
    expect(store.getRecentlyClosed()).toHaveLength(0) // 이력에서 제거
  })

  it('빈 탭(프로젝트 없음)은 이력에 쌓지 않는다', () => {
    const store = new TabStore()
    const e = store.addEmptyTab()
    store.closeTab(e.id)
    expect(store.getRecentlyClosed()).toHaveLength(0)
  })

  it('이력이 없으면 reopenClosed는 null', () => {
    const store = new TabStore()
    expect(store.reopenClosed()).toBeNull()
  })

  it('가장 최근에 닫은 탭부터 복원한다(LIFO)', () => {
    const store = new TabStore()
    const a = store.openProject('/p/A', 'A')
    const b = store.openProject('/p/B', 'B')
    store.closeTab(a.id)
    store.closeTab(b.id)
    expect(store.reopenClosed()?.projectPath).toBe('/p/B')
    expect(store.reopenClosed()?.projectPath).toBe('/p/A')
  })

  it('이력은 직렬화/복원된다(세션 영속)', () => {
    const store = new TabStore()
    const a = store.openProject('/p/A', 'A')
    store.closeTab(a.id)
    const snapshot = store.serialize()
    expect(snapshot.recentlyClosed.map((t) => t.projectPath)).toEqual(['/p/A'])

    const store2 = new TabStore()
    store2.restore(snapshot.tabs, snapshot.activeIndex, snapshot.recentlyClosed)
    expect(store2.reopenClosed()?.projectPath).toBe('/p/A')
  })
})

describe('TabStore — 깨진 경로 탭 (TODO_EXTRA D)', () => {
  it('setPathMissing으로 경로 부재를 표시/해제한다', () => {
    const store = new TabStore()
    const a = store.openProject('/p/missing', 'Missing')
    expect(a.pathMissing).toBe(false)
    store.setPathMissing(a.id, true)
    expect(a.pathMissing).toBe(true)
  })

  it('pathMissing은 직렬화되지 않는다(런타임 상태)', () => {
    const store = new TabStore()
    const a = store.openProject('/p/A', 'A')
    store.setPathMissing(a.id, true)
    const snapshot = store.serialize()
    expect(snapshot.tabs[0]).not.toHaveProperty('pathMissing')
  })
})

describe('TabStore — 함수 호출처 역추적 상태 (M10_2)', () => {
  it('새 탭은 역추적 상태가 없다', () => {
    const store = new TabStore()
    const tab = store.addEmptyTab()
    expect(tab.view.backtrace).toBeNull()
  })

  it('setBacktrace로 역추적을 시작/전환한다', () => {
    const store = new TabStore()
    const a = store.openProject('/p/A', 'A')
    store.setBacktrace(a.id, 'function:A.kt#load')
    expect(a.view.backtrace).toBe('function:A.kt#load')
    store.setBacktrace(a.id, 'function:A.kt#save')
    expect(a.view.backtrace).toBe('function:A.kt#save')
  })

  it('clearBacktrace로 파일 그래프로 돌아간다', () => {
    const store = new TabStore()
    const a = store.openProject('/p/A', 'A')
    store.setBacktrace(a.id, 'function:A.kt#load')
    store.clearBacktrace(a.id)
    expect(a.view.backtrace).toBeNull()
  })

  it('뷰 모드 전환 시 역추적이 종료된다', () => {
    const store = new TabStore()
    const a = store.openProject('/p/A', 'A')
    store.setBacktrace(a.id, 'function:A.kt#load')
    store.setViewMode(a.id, 'tree')
    expect(a.view.backtrace).toBeNull()
    expect(a.view.mode).toBe('tree')
  })

  it('노드 선택 시 역추적이 종료된다', () => {
    const store = new TabStore()
    const a = store.openProject('/p/A', 'A')
    store.setBacktrace(a.id, 'function:A.kt#load')
    store.setSelectedNode(a.id, 'file:A.kt')
    expect(a.view.backtrace).toBeNull()
    expect(a.view.selectedNodeId).toBe('file:A.kt')
  })

  it('역추적은 직렬화/복원되지 않는다(전환 탐색 상태)', () => {
    const store = new TabStore()
    const a = store.openProject('/p/A', 'A')
    store.setBacktrace(a.id, 'function:A.kt#load')
    const snapshot = store.serialize()
    expect(snapshot.tabs[0].view).not.toHaveProperty('backtrace')

    const store2 = new TabStore()
    const restored = store2.restore(snapshot.tabs, snapshot.activeIndex)
    expect(restored[0].view.backtrace).toBeNull()
  })
})
