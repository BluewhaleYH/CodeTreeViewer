import './index.css'
import { TabStore } from './tabs/tab-store'
import { renderTabBar } from './tabs/tab-bar'
import { renderOverlay } from './tabs/tab-content'
import { GraphView } from './graph/graph-view'
import { SearchView } from './search/search-view'
import { buildSearchIndex, focusTargetId } from './search/search-index'
import { buildDemoGraph, DEMO_SUMMARY } from './graph/demo-graph'
import { LogView } from './log/log-view'
import { CodeView } from './log/code-view'
import { splitLines } from './log/log-lines'
import { DEMO_LOG_LINES, DEMO_LOG_SITES, DEMO_CODE_LINES } from './log/demo-log'
import { fileNodeId } from '../../shared/graph'

const root = document.getElementById('app')

if (root) {
  root.innerHTML = `
    <div class="layout">
      <header class="tabbar" id="tabbar"></header>
      <main class="workspace">
        <div class="ws-log" id="ws-log" hidden></div>
        <div class="ws-main" id="ws-main">
          <div class="ws-graph" id="ws-graph"></div>
          <div class="ws-overlay" id="ws-overlay"></div>
          <div class="ws-search" id="ws-search"></div>
          <div class="session-notice" id="session-notice" hidden></div>
        </div>
        <div class="ws-code" id="ws-code" hidden></div>
      </main>
    </div>
  `

  const tabbar = root.querySelector<HTMLElement>('#tabbar')
  const wsLog = root.querySelector<HTMLElement>('#ws-log')
  const wsCode = root.querySelector<HTMLElement>('#ws-code')
  const wsGraph = root.querySelector<HTMLElement>('#ws-graph')
  const wsOverlay = root.querySelector<HTMLElement>('#ws-overlay')
  const wsSearch = root.querySelector<HTMLElement>('#ws-search')

  if (tabbar && wsLog && wsCode && wsGraph && wsOverlay && wsSearch) {
    const store = new TabStore()
    const selectNode = (nodeId: string | null): void => {
      const activeId = store.getActiveId()
      if (activeId) store.setSelectedNode(activeId, nodeId)
    }
    const graphView = new GraphView(wsGraph, selectNode)
    const startBacktrace = (functionId: string): void => {
      const activeId = store.getActiveId()
      if (activeId) store.setBacktrace(activeId, functionId)
    }
    const exitBacktrace = (): void => {
      const activeId = store.getActiveId()
      if (activeId) store.clearBacktrace(activeId)
    }
    // 검색: 함수 결과는 호출처 역추적, 파일 결과는 포커스. (M7_4, M10_2)
    const searchView = new SearchView(wsSearch, (entry) => {
      if (entry.kind === 'function') startBacktrace(entry.id)
      else selectNode(focusTargetId(entry))
    })
    const closeLog = (): void => {
      const activeId = store.getActiveId()
      if (activeId) store.closeLog(activeId)
    }
    const selectLogLine = (index: number): void => {
      const activeId = store.getActiveId()
      if (activeId) store.selectLogLine(activeId, index)
    }
    const logView = new LogView(wsLog, { onClose: closeLog, onSelectLine: selectLogLine })
    const closeCode = (): void => {
      const activeId = store.getActiveId()
      if (activeId) store.setCodeView(activeId, null)
    }
    const codeView = new CodeView(wsCode, { onClose: closeCode })

    // 로그→코드 후보 열기: 소스를 읽어 코드 뷰에 표시 + 그래프 노드 포커스(3중 연동). (04 §6·§7, M11_5)
    const openCandidate = async (file: string, line: number): Promise<void> => {
      const activeId = store.getActiveId()
      const active = store.getActive()
      if (!activeId || !active?.projectPath) return
      selectNode(fileNodeId(file))
      const content = await window.codetree.readSource(active.projectPath, file)
      if (content !== null) store.setCodeView(activeId, { file, line, lines: splitLines(content) })
    }

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
      renderOverlay(wsOverlay, store, {
        openProject: () => void openProject(),
        backtrace: startBacktrace,
        exitBacktrace,
        openCandidate: (site) => void openCandidate(site.file, site.line)
      })
      const active = store.getActive()
      graphView.sync(active)
      // 로그 분석: 열린 로그가 있으면 좌측 로그 패널 표시. (04 §2, M11_1)
      if (active && active.log) {
        wsLog.hidden = false
        logView.setDump(`${active.id}:${active.log.path}`, {
          name: active.log.name,
          lines: active.log.lines
        })
        logView.setSelectedLine(active.log.selectedLine)
        // 노드→로그 연동: 선택된 파일 노드와 연관된 라인 강조. (04 §7, M11_5)
        const sel = active.view.selectedNodeId
        const relatedFile = sel && sel.startsWith('file:') ? sel.slice('file:'.length) : null
        logView.setRelatedFile(relatedFile, active.analysis.logSites)
      } else {
        wsLog.hidden = true
        logView.setDump(null, null)
      }
      // 코드 뷰(우측): 역추적 후보 소스. (04 §6, M11_5)
      if (active && active.codeView) {
        wsCode.hidden = false
        codeView.setData(`${active.id}:${active.codeView.file}:${active.codeView.line}`, {
          file: active.codeView.file,
          line: active.codeView.line,
          lines: active.codeView.lines
        })
      } else {
        wsCode.hidden = true
        codeView.setData(null, null)
      }
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
        store.finishAnalysis(tabId, result.summary, result.graph, result.logSites)
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

    // 로그 덤프 열기: 활성 탭에 로드(없으면 새 탭). (04 §2, M11_1)
    const openLog = async (): Promise<void> => {
      const result = await window.codetree.openLogDialog()
      if (!result) return
      let activeId = store.getActiveId()
      if (!activeId) activeId = store.addEmptyTab().id
      store.openLog(activeId, {
        path: result.path,
        name: result.name,
        lines: splitLines(result.content),
        selectedLine: null
      })
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
      else if (action === 'open-log') void openLog()
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
        store.finishAnalysis(demo.id, DEMO_SUMMARY, buildDemoGraph(), DEMO_LOG_SITES)
        store.setSelectedNode(demo.id, fileNodeId('core/src/main/kotlin/Repository.kt'))
        // 로그 분석 데모: 좌측 로그 패널 + 로그→코드 역추적 후보. (M11_1, M11_4)
        store.openLog(demo.id, {
          path: '/logs/app.logcat',
          name: 'app.logcat',
          lines: DEMO_LOG_LINES,
          selectedLine: 5 // E Repository load failed 라인 → 다중 후보 매칭
        })
        // 3-뷰 데모: 코드 뷰에 매칭 소스 표시(우측). (M11_5)
        store.setCodeView(demo.id, {
          file: 'core/src/main/kotlin/Repository.kt',
          line: 14,
          lines: DEMO_CODE_LINES
        })
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
