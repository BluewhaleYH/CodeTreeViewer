import './index.css'
import { TabStore } from './tabs/tab-store'
import { renderTabBar } from './tabs/tab-bar'
import { renderOverlay } from './tabs/tab-content'
import { GraphView } from './graph/graph-view'
import { SearchView } from './search/search-view'
import { buildSearchIndex, focusTargetId, type SearchEntry } from './search/search-index'
import { diffGraphs } from './graph/graph-diff'
import { LogView } from './log/log-view'
import { EditorView } from './editor/editor-view'
import { SettingsView } from './settings/settings-view'
import { splitLines } from './log/log-lines'
import { fileNodeId, type CodeGraph } from '../../shared/graph'

// 빌드 식별자(타이틀바에 표시 → 어느 빌드인지 확인). 빌드 시 주입. (TODO_MORE)
declare const __BUILD_ID__: string
const BUILD_ID = typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : 'dev'
document.title = `CodeTreeViewer · ${BUILD_ID}`

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
          <div class="ws-search-view" id="ws-search-view" hidden></div>
          <div class="session-notice" id="session-notice" hidden></div>
        </div>
        <div class="ws-resizer" id="ws-code-resizer" title="드래그해서 코드 패널 너비 조절" hidden></div>
        <div class="ws-code" id="ws-code" hidden></div>
      </main>
      <button class="code-toggle" id="code-toggle" title="코드 패널 켜기/끄기">&lt;/&gt;</button>
      <button class="theme-toggle" id="theme-toggle" title="다크/라이트 전환"></button>
    </div>
  `

  const tabbar = root.querySelector<HTMLElement>('#tabbar')
  const wsLog = root.querySelector<HTMLElement>('#ws-log')
  const wsCode = root.querySelector<HTMLElement>('#ws-code')
  const wsGraph = root.querySelector<HTMLElement>('#ws-graph')
  const wsOverlay = root.querySelector<HTMLElement>('#ws-overlay')
  const wsSearch = root.querySelector<HTMLElement>('#ws-search')
  const wsSearchView = root.querySelector<HTMLElement>('#ws-search-view')
  const wsCodeResizer = root.querySelector<HTMLElement>('#ws-code-resizer')

  if (
    tabbar &&
    wsLog &&
    wsCode &&
    wsGraph &&
    wsOverlay &&
    wsSearch &&
    wsSearchView &&
    wsCodeResizer
  ) {
    const store = new TabStore()

    // 코드 패널 표시 여부(토글 버튼 + 노드/후보 클릭으로 제어). (TODO_MORE)
    let codePanelOpen = false

    // 코드 패널 너비 드래그 리사이즈(우측 경계). (TODO_MORE)
    const startCodeResize = (startEvent: PointerEvent): void => {
      startEvent.preventDefault()
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
      const onMove = (e: PointerEvent): void => {
        const width = window.innerWidth - e.clientX
        const clamped = Math.max(280, Math.min(width, Math.round(window.innerWidth * 0.7)))
        wsCode.style.width = `${clamped}px`
      }
      const onUp = (): void => {
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
      }
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
    }
    wsCodeResizer.addEventListener('pointerdown', startCodeResize)
    const selectNode = (nodeId: string | null): void => {
      const activeId = store.getActiveId()
      if (activeId) store.setSelectedNode(activeId, nodeId)
    }
    // 그래프 노드 클릭: 선택 + 해당 파일/함수 소스를 코드 패널에 띄운다. (TODO_MORE)
    const onGraphSelect = (nodeId: string | null): void => {
      selectNode(nodeId)
      if (!nodeId) return
      const node = store.getActive()?.analysis.graph?.nodes.find((n) => n.id === nodeId)
      if (node && !node.external && node.path) {
        void openSource(node.path, node.line ?? 1, false) // 선택은 이미 위에서 처리
      }
    }
    // 역추적 모드 노드 클릭: 선택/모드를 바꾸지 않고 그 노드의 소스를 코드 패널에 연다. (TODO_MORE)
    // 함수 노드면 정의 라인으로, 파일 노드면 파일 첫 줄로 이동한다.
    const onOpenSourceNode = (nodeId: string): void => {
      const node = store.getActive()?.analysis.graph?.nodes.find((n) => n.id === nodeId)
      if (node && !node.external && node.path) void openSource(node.path, node.line ?? 1, false)
    }
    const graphView = new GraphView(wsGraph, onGraphSelect, undefined, onOpenSourceNode)
    const startBacktrace = (functionId: string): void => {
      const activeId = store.getActiveId()
      if (activeId) store.setBacktrace(activeId, functionId)
    }
    const exitBacktrace = (): void => {
      const activeId = store.getActiveId()
      if (activeId) store.clearBacktrace(activeId)
    }
    // 검색: 함수 결과는 호출처 역추적, 파일 결과는 포커스. (M7_4, M10_2)
    const onSearchPick = (entry: SearchEntry): void => {
      if (entry.kind === 'function') startBacktrace(entry.id)
      else selectNode(focusTargetId(entry))
    }
    // 메인 검색(프로젝트 전역).
    const searchView = new SearchView(wsSearch, onSearchPick)
    // 별도 "보기 내 검색" 영역(우상단): 현재 그래프에 표시 중인 노드로만 한정(중첩 검색). (TODO_MORE)
    const viewSearchView = new SearchView(wsSearchView, onSearchPick, {
      scopedToView: true,
      placeholder: '보기 내 검색…'
    })
    viewSearchView.setScopeProvider(() => graphView.getDisplayedIds())
    const closeLog = (): void => {
      const activeId = store.getActiveId()
      if (activeId) store.closeLog(activeId)
    }
    const selectLogLine = (index: number, raw: string): void => {
      const activeId = store.getActiveId()
      if (activeId) store.selectLogLine(activeId, index, raw)
    }
    const logView = new LogView(wsLog, { onClose: closeLog, onSelectLine: selectLogLine })
    const closeCode = (): void => {
      const activeId = store.getActiveId()
      const active = store.getActive()
      if (!activeId) return
      // 미저장 변경이 있으면 닫기 전 경고. (06 §6)
      if (
        active?.codeView?.dirty &&
        !confirm('저장하지 않은 변경이 있습니다. 편집기를 닫을까요?')
      ) {
        return
      }
      store.setCodeView(activeId, null)
    }
    // 저장: 원자적 쓰기 + 외부 변경 충돌 시 덮어쓰기 확인. (06 §3, §6, M12_2)
    const saveSource = async (content: string): Promise<void> => {
      const activeId = store.getActiveId()
      const active = store.getActive()
      const cv = active?.codeView
      if (!activeId || !active?.projectPath || !cv) return
      let res = await window.codetree.saveSource(active.projectPath, cv.file, content, cv.baseMtime)
      if (!res.ok && 'conflict' in res) {
        if (!confirm(`${cv.file} 이(가) 앱 밖에서 변경되었습니다. 덮어쓸까요?`)) return
        res = await window.codetree.saveSource(active.projectPath, cv.file, content, null) // 강제
      }
      if (res.ok) {
        store.setCodeSaved(activeId, content, res.mtime)
        editorView.markSaved()
        // 저장 시 자동 증분 재분석 → 그래프/검색 갱신. (06 §4, M12_3)
        const before = active.analysis.graph
        const updated = await window.codetree.reanalyze(active.projectPath, cv.file)
        store.finishAnalysis(activeId, updated.summary, updated.graph, updated.logSites)
        // 영향 범위(추가/변경 노드 강조 + 요약). (06 §5, M12_4)
        if (before) {
          const d = diffGraphs(before, updated.graph)
          const changed = fileNodeId(cv.file)
          const highlight = [...new Set([...d.addedNodes, changed])]
          store.setImpact(activeId, {
            highlight,
            summary: {
              addedNodes: d.addedNodes.length,
              removedNodes: d.removedNodes.length,
              addedEdges: d.addedEdges,
              removedEdges: d.removedEdges
            }
          })
        }
      } else if ('error' in res) {
        alert(`저장 실패: ${res.error}`)
      }
    }
    const editorView = new EditorView(wsCode, {
      onClose: closeCode,
      onSave: (content) => void saveSource(content),
      onDirtyChange: (dirty) => {
        const id = store.getActiveId()
        if (id) store.setCodeDirty(id, dirty)
      },
      // 코드에서 함수명을 선택하면 그 함수 노드를 그래프에서 보여준다(역추적). (TODO_MORE)
      onSymbolSelect: (name) => {
        const active = store.getActive()
        const graph = active?.analysis.graph
        if (!graph) return
        const cv = active?.codeView
        // 현재 파일에 정의된 함수 우선, 없으면 프로젝트 전역에서 동일명이 유일할 때만(오탐 방지).
        const inFile =
          cv && graph.nodes.find((n) => n.kind === 'function' && n.path === cv.file && n.name === name)
        if (inFile) {
          startBacktrace(inFile.id)
          return
        }
        const matches = graph.nodes.filter((n) => n.kind === 'function' && n.name === name)
        if (matches.length === 1) startBacktrace(matches[0].id)
      }
    })

    // 소스를 편집기로 연다(노드→소스 / 로그 후보→코드). 코드 패널을 자동으로 보이게 한다. (06 §2, M12_1, TODO_MORE)
    const openSource = async (
      file: string,
      line: number,
      focusFileNode = true
    ): Promise<void> => {
      const activeId = store.getActiveId()
      const active = store.getActive()
      if (!activeId || !active?.projectPath) return
      if (focusFileNode) selectNode(fileNodeId(file))
      codePanelOpen = true // 소스를 열면 코드 패널 표시. (TODO_MORE)
      const result = await window.codetree.readSource(active.projectPath, file)
      if (result !== null) {
        store.setCodeView(activeId, {
          file,
          line,
          content: result.content,
          baseMtime: result.mtime,
          dirty: false
        })
      } else {
        render() // 파일을 못 읽어도 패널은 토글되었으니 갱신
      }
    }

    const isCapture = window.codetree.captureMode

    // 코드 패널 토글 버튼. (TODO_MORE)
    const codeToggle = root.querySelector<HTMLButtonElement>('#code-toggle')
    codeToggle?.addEventListener('click', () => {
      codePanelOpen = !codePanelOpen
      render()
    })

    // 테마(다크/라이트) 전환. localStorage에 영속(렌더러 전용 UI 선호). (03 §9, M14_4)
    const themeToggle = root.querySelector<HTMLButtonElement>('#theme-toggle')
    const applyTheme = (theme: 'dark' | 'light'): void => {
      document.documentElement.dataset.theme = theme
      if (themeToggle) themeToggle.textContent = theme === 'dark' ? '☾' : '☀'
      editorView.setTheme(theme)
    }
    let currentTheme: 'dark' | 'light' =
      (isCapture ? 'light' : localStorage.getItem('ctv-theme')) === 'light' ? 'light' : 'dark'
    applyTheme(currentTheme)
    themeToggle?.addEventListener('click', () => {
      currentTheme = currentTheme === 'dark' ? 'light' : 'dark'
      localStorage.setItem('ctv-theme', currentTheme)
      applyTheme(currentTheme)
    })

    // 검색 인덱스 캐시: 그래프 참조가 같으면 재사용(매 렌더마다 재구성 방지, 대규모 가속). (TODO_MORE 성능)
    let searchIndexCache: { graph: CodeGraph; index: ReturnType<typeof buildSearchIndex> } | null =
      null

    // 세션 저장: 탭/활성 탭이 바뀔 때만 IPC 전송(변경 감지). (01 §5, M8_3)
    let lastSerialized = ''
    const persistTabs = (): void => {
      if (isCapture) return // 데모 시드가 실제 세션을 덮어쓰지 않도록.
      const snapshot = store.serialize()
      const json = JSON.stringify(snapshot)
      if (json === lastSerialized) return
      lastSerialized = json
      void window.codetree.saveTabs(snapshot.tabs, snapshot.activeIndex, snapshot.recentlyClosed)
    }

    const render = (): void => {
      renderTabBar(tabbar, store)
      renderOverlay(wsOverlay, store, {
        openProject: () => void openProject(),
        backtrace: startBacktrace,
        exitBacktrace,
        openCandidate: (site) => void openSource(site.file, site.line),
        openSource: (file, line) => void openSource(file, line),
        clearImpact: () => {
          const id = store.getActiveId()
          if (id) store.setImpact(id, null)
        },
        captureSnapshot: () => {
          const a = store.getActive()
          if (a?.analysis.graph) store.setSnapshot(a.id, a.analysis.graph)
        },
        setCompare: (on) => {
          const id = store.getActiveId()
          if (id) store.setCompare(id, on)
        },
        clearSnapshot: () => {
          const id = store.getActiveId()
          if (id) store.setSnapshot(id, null)
        }
      })
      const active = store.getActive()
      // 그래프 렌더가 실패해도 앱 전체가 멈추지 않도록 방어(특정 그래프 구조의 예외 대비). (TODO_MORE #3)
      try {
        graphView.sync(active)
        graphView.setImpact(active?.impact?.highlight ?? []) // 영향 범위 강조. (M12_4)
      } catch (err) {
        console.error('[graph] sync 실패:', err)
      }
      // 로그 분석: 열린 로그가 있으면 좌측 로그 패널 표시. (04 §2, M11_1)
      if (active && active.log) {
        wsLog.hidden = false
        logView.setDump(
          `${active.id}:${active.log.path}`,
          active.log.source.mode === 'memory'
            ? { name: active.log.name, mode: 'memory', lines: active.log.source.lines }
            : {
                name: active.log.name,
                mode: 'stream',
                id: active.log.source.id,
                lineCount: active.log.source.lineCount
              }
        )
        logView.setSelectedLine(active.log.selectedLine)
        // 노드→로그 연동: 선택된 파일 노드와 연관된 라인 강조. (04 §7, M11_5)
        const sel = active.view.selectedNodeId
        const relatedFile = sel && sel.startsWith('file:') ? sel.slice('file:'.length) : null
        logView.setRelatedFile(relatedFile, active.analysis.logSites)
      } else {
        wsLog.hidden = true
        logView.setDump(null, null)
      }
      // 코드 편집기(우측): 토글 ON일 때 표시. 열린 소스가 있으면 그 파일, 없으면 빈 편집기. (TODO_MORE)
      if (codePanelOpen) {
        wsCode.hidden = false
        wsCodeResizer.hidden = false
        if (active && active.codeView) {
          editorView.setFile(`${active.id}:${active.codeView.file}:${active.codeView.line}`, {
            file: active.codeView.file,
            line: active.codeView.line,
            content: active.codeView.content
          })
        } else {
          editorView.setFile(null, null)
        }
      } else {
        wsCode.hidden = true
        wsCodeResizer.hidden = true
        editorView.setFile(null, null)
      }
      if (codeToggle) codeToggle.classList.toggle('is-active', codePanelOpen)
      // 검색 인덱스: done 상태 그래프가 있을 때만 표시. 그래프가 바뀐 경우에만 재구성. (TODO_MORE 성능)
      if (active && active.analysis.status === 'done' && active.analysis.graph) {
        wsSearch.style.display = 'block'
        wsSearchView.hidden = false
        const graph = active.analysis.graph
        if (!searchIndexCache || searchIndexCache.graph !== graph) {
          searchIndexCache = { graph, index: buildSearchIndex(graph) }
        }
        searchView.setContext(active.id, searchIndexCache.index)
        viewSearchView.setContext(active.id, searchIndexCache.index)
      } else {
        wsSearch.style.display = 'none'
        wsSearchView.hidden = true
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
        // 중복 프로젝트면 기존 탭으로 포커스만(이미 분석됨) → idle일 때만 분석한다. (TODO_EXTRA D)
        if (tab.analysis.status === 'idle') void analyze(tab.id, selection.path)
      }
    }

    // 닫은 탭 다시 열기(Ctrl+Shift+T). 프로젝트 탭이면 재분석한다. (TODO_EXTRA D)
    const reopenClosed = (): void => {
      const tab = store.reopenClosed()
      if (tab?.projectPath) void analyze(tab.id, tab.projectPath)
    }

    // 설정 모달(스캔 제외 디렉터리 등). 저장 시 열린 프로젝트를 재분석한다. (TODO_EXTRA D)
    const settingsView = new SettingsView((settings) => {
      void window.codetree.saveSettings(settings).then(() => {
        for (const tab of store.getTabs()) {
          if (tab.projectPath && !tab.pathMissing) void analyze(tab.id, tab.projectPath)
        }
      })
    })
    const openSettings = async (): Promise<void> => {
      settingsView.open(await window.codetree.loadSettings())
    }

    // 로그 덤프 열기: 활성 탭에 로드(없으면 새 탭). (04 §2, M11_1)
    const openLog = async (): Promise<void> => {
      const result = await window.codetree.openLogDialog()
      if (!result) return
      let activeId = store.getActiveId()
      if (!activeId) activeId = store.addEmptyTab().id
      // 대용량은 스트리밍 소스, 그 외는 전체 라인 메모리 적재. (TODO_EXTRA C)
      const source =
        result.mode === 'memory'
          ? { mode: 'memory' as const, lines: splitLines(result.content) }
          : { mode: 'stream' as const, id: result.id, lineCount: result.lineCount }
      store.openLog(activeId, {
        path: result.path,
        name: result.name,
        selectedLine: null,
        selectedRaw: null,
        source
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
      else if (action === 'reopen-tab') reopenClosed()
      else if (action === 'settings') void openSettings()
      else if (action === 'close-tab') {
        const active = store.getActive()
        if (!active) return
        // 미저장 변경이 있으면 탭 닫기 전 경고. (06 §6)
        if (active.codeView?.dirty && !confirm('저장하지 않은 변경이 있습니다. 탭을 닫을까요?')) {
          return
        }
        store.closeTab(active.id)
      }
    })

    // 렌더러 단축키(메뉴 가속기와 겹치지 않는 렌더러 상태 조작). Ctrl 기준(D13). (01 §8, TODO_EXTRA D)
    window.addEventListener('keydown', (event) => {
      if (!event.ctrlKey || event.metaKey || event.altKey) return
      // Ctrl+F: 검색 입력 포커스
      if (event.code === 'KeyF' && !event.shiftKey) {
        event.preventDefault()
        searchView.focus()
        return
      }
      // Ctrl+Shift+G: 관계도 ↔ 트리 뷰 전환
      if (event.code === 'KeyG' && event.shiftKey) {
        const active = store.getActive()
        if (active && active.projectPath && !active.pathMissing) {
          event.preventDefault()
          store.setViewMode(active.id, active.view.mode === 'graph' ? 'tree' : 'graph')
        }
        return
      }
      // Ctrl+1~9: N번째 탭으로 전환(9=마지막 탭)
      if (!event.shiftKey && /^Digit[1-9]$/.test(event.code)) {
        const tabs = store.getTabs()
        if (tabs.length === 0) return
        const n = Number(event.code.slice(5))
        const index = n === 9 ? tabs.length - 1 : n - 1
        if (index < tabs.length) {
          event.preventDefault()
          store.setActive(tabs[index].id)
        }
      }
    })

    // 미저장 변경 상태로 창/앱 종료 시 경고. (06 §6, F-E4)
    if (!isCapture) {
      window.addEventListener('beforeunload', (event) => {
        const hasDirty = store.getTabs().some((t) => t.codeView?.dirty)
        if (hasDirty && !confirm('저장하지 않은 변경이 있습니다. 종료할까요?')) {
          event.preventDefault()
          event.returnValue = ''
        }
      })
    }

    // 부트: 저장된 세션을 복원한다. 프로젝트 탭은 재분석한다. 없으면 빈 탭. (01 §5, M8_3)
    const boot = async (): Promise<void> => {
      if (isCapture) {
        // 자체 검수(스크린샷) 모드: 데모 시드는 동적 import로만 로드 → 프로덕션 번들 제외. (TODO_EXTRA E)
        const { seedCaptureDemo } = await import('./capture-seed')
        await seedCaptureDemo({
          store,
          searchView,
          logView,
          render,
          showBanner,
          sessionCorruptedMsg: SESSION_CORRUPTED_MSG
        })
        return
      }

      const session = await window.codetree.loadSession()
      if (session.tabs.length > 0) {
        const restored = store.restore(session.tabs, session.activeIndex, session.recentlyClosed)
        // 복원 직후 상태를 마지막 직렬화 기준으로 잡아 불필요한 재저장을 막는다.
        lastSerialized = JSON.stringify(store.serialize())
        render()
        // 복원된 프로젝트 탭: 경로가 존재하면 재분석, 사라졌으면 깨진 경로로 표시. (TODO_EXTRA D)
        await Promise.all(
          restored.map(async (tab, i) => {
            const path = session.tabs[i]?.projectPath
            if (!path) return
            if (await window.codetree.projectExists(path)) void analyze(tab.id, path)
            else store.setPathMissing(tab.id, true)
          })
        )
      } else {
        store.addEmptyTab()
        render()
      }
    }

    void boot()
  }
}
