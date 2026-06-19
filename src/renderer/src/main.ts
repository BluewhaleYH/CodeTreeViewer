import './index.css'
import { TabStore } from './tabs/tab-store'
import { renderTabBar } from './tabs/tab-bar'
import { renderOverlay } from './tabs/tab-content'
import { GraphView } from './graph/graph-view'
import { buildDemoGraph, DEMO_SUMMARY } from './graph/demo-graph'

const root = document.getElementById('app')

if (root) {
  root.innerHTML = `
    <div class="layout">
      <header class="tabbar" id="tabbar"></header>
      <main class="workspace">
        <div class="ws-graph" id="ws-graph"></div>
        <div class="ws-overlay" id="ws-overlay"></div>
      </main>
    </div>
  `

  const tabbar = root.querySelector<HTMLElement>('#tabbar')
  const wsGraph = root.querySelector<HTMLElement>('#ws-graph')
  const wsOverlay = root.querySelector<HTMLElement>('#ws-overlay')

  if (tabbar && wsGraph && wsOverlay) {
    const store = new TabStore()
    const graphView = new GraphView(wsGraph)

    const render = (): void => {
      renderTabBar(tabbar, store)
      renderOverlay(wsOverlay, store, { openProject: () => void openProject() })
      graphView.sync(store.getActive())
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
    if (window.codetree.captureMode) {
      const demo = store.openProject('/home/dev/AndroidProject', 'AndroidProject')
      store.finishAnalysis(demo.id, DEMO_SUMMARY, buildDemoGraph())
      // 트리 뷰 렌더 확인용. (관계도는 기본 모드)
      store.setViewMode(demo.id, 'tree')
    }

    render()
  }
}
