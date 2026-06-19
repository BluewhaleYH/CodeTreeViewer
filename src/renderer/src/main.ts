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
        <div class="session-notice" id="session-notice" hidden></div>
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

    const isCapture = window.codetree.captureMode

    // 세션 저장: 탭/활성 탭이 바뀔 때만 IPC 전송(변경 감지). (01 §5, M8_3)
    let lastSerialized = ''
    const persistTabs = (): void => {
      if (isCapture) return // 데모 시드가 실제 세션을 덮어쓰지 않도록.
      const snapshot = store.serialize()
      const json = JSON.stringify(snapshot)
      if (json === lastSerialized) return
      lastSerialized = json
      void window.codetree.saveTabs(snapshot.tabs, snapshot.activeIndex)
    }

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
      persistTabs()
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

    const noticeHost = root.querySelector<HTMLElement>('#session-notice')
    // 비차단 알림 배너(세션 손상·업데이트 등). 사용자가 닫을 수 있으며 동작을 막지 않는다. (01 §10, DEPLOY.md §4)
    const SESSION_CORRUPTED_MSG = '이전 세션 파일이 손상되어 백업본 또는 초기 상태로 복원했습니다.'
    const UPDATE_DOWNLOADED_MSG = '새 버전을 내려받았습니다. 앱을 재시작하면 업데이트가 적용됩니다.'
    const showBanner = (message: string): void => {
      if (!noticeHost) return
      noticeHost.replaceChildren()
      const msg = document.createElement('span')
      msg.textContent = message
      const close = document.createElement('button')
      close.className = 'session-notice__close'
      close.setAttribute('aria-label', '닫기')
      close.textContent = '×'
      close.addEventListener('click', () => noticeHost.setAttribute('hidden', ''))
      noticeHost.append(msg, close)
      noticeHost.removeAttribute('hidden')
    }
    window.codetree.onSessionNotice((notice) =>
      showBanner(notice.kind === 'corrupted' ? SESSION_CORRUPTED_MSG : '세션 알림')
    )
    window.codetree.onUpdateNotice(() => showBanner(UPDATE_DOWNLOADED_MSG))

    window.codetree.onMenuAction((action) => {
      if (action === 'open-project') void openProject()
      else if (action === 'new-tab') store.addEmptyTab()
      else if (action === 'close-tab') {
        const active = store.getActiveId()
        if (active) store.closeTab(active)
      }
    })

    // 부트: 저장된 세션을 복원한다. 프로젝트 탭은 재분석한다. 없으면 빈 탭. (01 §5, M8_3)
    const boot = async (): Promise<void> => {
      if (isCapture) {
        // 자체 검수(스크린샷) 모드: 데모 그래프를 시드해 캔버스 렌더를 확인한다.
        store.addEmptyTab()
        const demo = store.openProject('/home/dev/AndroidProject', 'AndroidProject')
        store.finishAnalysis(demo.id, DEMO_SUMMARY, buildDemoGraph())
        store.setSelectedNode(demo.id, fileNodeId('core/src/main/kotlin/Repository.kt'))
        render()
        // 검색 히스토리 시연(빈 입력 → 최근 검색어).
        searchView.seedHistory(['Repository', 'ViewModel', 'load'])
        // 세션 손상 알림 배너 시연.
        showBanner(SESSION_CORRUPTED_MSG)
        return
      }

      const session = await window.codetree.loadSession()
      if (session.tabs.length > 0) {
        const restored = store.restore(session.tabs, session.activeIndex)
        // 복원 직후 상태를 마지막 직렬화 기준으로 잡아 불필요한 재저장을 막는다.
        lastSerialized = JSON.stringify(store.serialize())
        render()
        restored.forEach((tab, i) => {
          const path = session.tabs[i]?.projectPath
          if (path) void analyze(tab.id, path)
        })
      } else {
        store.addEmptyTab()
        render()
      }
    }

    void boot()
  }
}
