import { fileNodeId } from '../../shared/graph'
import type { TabStore } from './tabs/tab-store'
import type { SearchView } from './search/search-view'
import type { LogView } from './log/log-view'

/**
 * 자체 검수(스크린샷) 모드 전용 데모 시드. (TODO_EXTRA E)
 * 이 모듈과 데모 데이터(demo-graph/demo-log)는 동적 import로만 로드되어
 * 프로덕션 번들/런타임에는 포함되지 않는다(검수 전용 코드 분리).
 */
export interface CaptureSeedContext {
  store: TabStore
  searchView: SearchView
  logView: LogView
  render: () => void
  showBanner: (message: string) => void
  sessionCorruptedMsg: string
}

/** 데모 그래프/로그/코드를 시드해 캔버스·3-뷰·배너 렌더를 확인할 수 있게 한다. */
export async function seedCaptureDemo(ctx: CaptureSeedContext): Promise<void> {
  const { buildDemoGraph, DEMO_SUMMARY } = await import('./graph/demo-graph')
  const { DEMO_LOG_LINES, DEMO_LOG_SITES, DEMO_CODE_LINES } = await import('./log/demo-log')
  const { store, searchView, logView, render, showBanner, sessionCorruptedMsg } = ctx

  store.addEmptyTab()
  const demo = store.openProject('/home/dev/AndroidProject', 'AndroidProject')
  store.finishAnalysis(demo.id, DEMO_SUMMARY, buildDemoGraph(), DEMO_LOG_SITES)
  store.setSelectedNode(demo.id, fileNodeId('core/src/main/kotlin/Repository.kt'))
  // 영향 범위 데모: Repository.kt 변경 강조. (M12_4)
  store.setImpact(demo.id, {
    highlight: [fileNodeId('core/src/main/kotlin/Repository.kt')],
    summary: { addedNodes: 1, removedNodes: 0, addedEdges: 2, removedEdges: 0 }
  })
  // 전/후 비교 데모: 네이티브 없는 스냅샷 → native 노드가 '추가'로 보임. (M14_3)
  const demoGraph = buildDemoGraph()
  store.setSnapshot(demo.id, {
    nodes: demoGraph.nodes.filter(
      (n) => !n.id.includes('native/') && !n.id.includes('NativeBridge')
    ),
    edges: demoGraph.edges.filter(
      (e) => e.type !== 'jni-boundary' && !e.from.includes('native/') && !e.to.includes('native/')
    )
  })
  store.setCompare(demo.id, true)
  // 로그 분석 데모: 좌측 로그 패널 + 로그→코드 역추적 후보. (M11_1, M11_4)
  store.openLog(demo.id, {
    path: '/logs/app.logcat',
    name: 'app.logcat',
    lines: DEMO_LOG_LINES,
    selectedLine: 5 // E Repository load failed 라인 → 다중 후보 매칭
  })
  // 3-뷰 데모: 코드 편집기에 매칭 소스 표시(우측). (M11_5, M12_1)
  store.setCodeView(demo.id, {
    file: 'core/src/main/kotlin/Repository.kt',
    line: 14,
    content: DEMO_CODE_LINES.join('\n'),
    baseMtime: null,
    dirty: false
  })
  render()
  // 검색 히스토리 시연(빈 입력 → 최근 검색어).
  searchView.seedHistory(['Repository', 'ViewModel', 'load'])
  // 로그 검색 시연. (M11_6)
  logView.seedSearch('Repository')
  // 세션 손상 알림 배너 시연.
  showBanner(sessionCorruptedMsg)
}
