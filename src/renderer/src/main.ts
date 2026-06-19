import './index.css'
import { TabStore } from './tabs/tab-store'
import { renderTabBar } from './tabs/tab-bar'
import { renderOverlay } from './tabs/tab-content'
import { GraphView } from './graph/graph-view'
import { SearchView } from './search/search-view'
import { buildSearchIndex, focusTargetId } from './search/search-index'
import { buildDemoGraph, DEMO_SUMMARY } from './graph/demo-graph'
import { fileNodeId } from '../../shared/graph'

const root = document.getElementById('app')

if (root) {
  root.innerHTML = `
    <div class="layout">
      <header class="tabbar" id="tabbar"></header>
      <main class="workspace">
        <div class="ws-graph" id="ws-graph"></div>
        <div class="ws-overlay" id="ws-overlay"></div>
        <div class="ws-search" id="ws-search"></div>
      </main>
    </div>
  `

  const tabbar = root.querySelector<HTMLElement>('#tabbar')
  const wsGraph = root.querySelector<HTMLElement>('#ws-graph')
  const wsOverlay = root.querySelector<HTMLElement>('#ws-overlay')
  const wsSearch = root.querySelector<HTMLElement>('#ws-search')

  if (tabbar && wsGraph && wsOverlay && wsSearch) {
    const store = new TabStore()
    const selectNode = (nodeId: string | null): void => {
      const activeId = store.getActiveId()
      if (activeId) store.setSelectedNode(activeId, nodeId)
    }
    const graphView = new GraphView(wsGraph, selectNode)
    const searchView = new SearchView(wsSearch, (entry) => selectNode(focusTargetId(entry)))

    const render = (): void => {
      renderTabBar(tabbar, store)
      renderOverlay(wsOverlay, store, { openProject: () => void openProject() })
      const active = store.getActive()
      graphView.sync(active)
      // 검색 인덱스: done 상태 그래프가 있을 때만 표시.
      if (active && active.analysis.status === 'done' && active.analysis.graph) {
        wsSearch.style.display = 'block'
        searchView.setContext(active.id, buildSearchIndex(active.analysis.graph))
      } else {
        wsSearch.style.display = 'none'
      }
    }
    store.subscribe(render)

    const analyze = async (tabId: string, projectPath: string): Promise<void> => {
      store.startAnalysis(tabId)
      try {
        const result = await window.codetree.runAnalysis(projectPath, (progress) =>
          store.setAnalysisProgress(tabId, progress)
        )
        store.finishAnalysis(tabId, result.summary, result.graph)
      } catch (error) {
        store.failAnalysis(tabId, error instanceof Error ? error.message : String(error))
      }
    }

    const openProject = async (): Promise<void> => {
      const selection = await window.codetree.openProjectDialog()
      if (selection) {
        const tab = store.openProject(selection.path, selection.name)
        void analyze(tab.id, selection.path)
      }
    }

    window.codetree.onMenuAction((action) => {
      if (action === 'open-project') void openProject()
      else if (action === 'new-tab') store.addEmptyTab()
      else if (action === 'close-tab') {
        const active = store.getActiveId()
        if (active) store.closeTab(active)
      }
    })

    store.addEmptyTab()

    // 자체 검수(스크린샷) 모드: 데모 그래프를 시드해 캔버스 렌더를 확인한다.
    const isCapture = window.codetree.captureMode
    if (isCapture) {
      const demo = store.openProject('/home/dev/AndroidProject', 'AndroidProject')
      store.finishAnalysis(demo.id, DEMO_SUMMARY, buildDemoGraph())
      store.setSelectedNode(demo.id, fileNodeId('core/src/main/kotlin/Repository.kt'))
    }

    render()

    // 검색 히스토리 시연(빈 입력 → 최근 검색어).
    if (isCapture) searchView.seedHistory(['Repository', 'ViewModel', 'load'])
  }
}
