/**
 * 탭 상태 저장소 (순수 로직, DOM/electron 비의존 → 단위 테스트 대상).
 * 탭 = 프로젝트 1개. 탭별로 독립적인 프로젝트·분석 결과·뷰 상태를 가진다. (01 §4)
 */

import type { AnalysisProgress, AnalysisSummary } from '../../../shared/analysis'
import type { CodeGraph } from '../../../shared/graph'
import type { LogSite } from '../../../shared/log'
import type { PersistedTab } from '../../../shared/session'

/** 시각화 뷰 모드. 토글 UI는 M5/M6에서 연결한다. (03 §5.2) */
export type ViewMode = 'graph' | 'tree'

export interface TabViewState {
  mode: ViewMode
  /** 선택(포커스)된 노드 id. 뷰 모드 전환 시에도 유지된다. (03 §5.2, M6) */
  selectedNodeId: string | null
  /**
   * 역추적 중인 함수 노드 id(호출처 표시). null이면 파일 그래프. (02 §6, 03 §5.3, M10_2)
   * 전환 탐색 상태이므로 세션에 영속하지 않는다.
   */
  backtrace: string | null
  /**
   * 포커스 중인 파일 노드 id(검색에서 파일을 고르면 그 파일 중심으로 다시 그림). null이면 일반 뷰.
   * 전환 탐색 상태이므로 세션에 영속하지 않는다. (TODO_MORE)
   */
  focus: string | null
  /** 전/후 비교 모드 활성 여부(스냅샷 vs 현재). 전환 상태(미영속). (03, 06 §5, M14_3) */
  compare: boolean
}

export type AnalysisStatus = 'idle' | 'running' | 'done' | 'error'

/** 탭별 분석 상태 컨테이너. (02 §3) */
export interface TabAnalysisState {
  status: AnalysisStatus
  progress: AnalysisProgress | null
  summary: AnalysisSummary | null
  graph: CodeGraph | null
  /** 로그→코드 역추적용 소스 로그 호출 위치. (04 §5, M11_4) */
  logSites: LogSite[]
  error: string | null
}

/** 탭에 열린 로그 덤프(전환 탐색 상태, 세션 미영속). (04 §2, M11_1) */
export interface TabLogState {
  path: string
  name: string
  /** 선택된 로그 라인(0-based). 역추적 후보 표시용. (04 §5, M11_4) */
  selectedLine: number | null
  /** 선택 라인 원문(후보 패널용; 스트림 모드는 lines 미보유). (TODO_EXTRA C) */
  selectedRaw: string | null
  /**
   * 로그 데이터 소스. memory=전체 라인 보유, stream=대용량 디스크 스트리밍(라인 수만). (TODO_EXTRA C)
   */
  source: { mode: 'memory'; lines: string[] } | { mode: 'stream'; id: number; lineCount: number }
}

export interface TabState {
  id: string
  projectPath: string | null
  projectName: string | null
  /** 탭별 독립 뷰 상태. (01 §4, 세션 복원은 M8) */
  view: TabViewState
  /** 탭별 분석 상태/결과. (02 §3) */
  analysis: TabAnalysisState
  /** 열린 로그 덤프. null이면 로그 분석 비활성. (04 §2, M11) */
  log: TabLogState | null
  /** 코드 뷰(역추적 후보 소스 표시). null이면 코드 뷰 비활성. (04 §6, M11_5) */
  codeView: TabCodeView | null
  /** 직전 재분석 영향 범위. null이면 표시 안 함. (06 §5, M12_4) */
  impact: TabImpact | null
  /** 전/후 비교용 그래프 스냅샷. null이면 미캡처. (03, 06 §5, M14_3) */
  snapshot: CodeGraph | null
  /** 복원 시 프로젝트 경로가 존재하지 않음(이동/삭제). 자동 분석을 건너뛰고 안내를 표시한다. (TODO_EXTRA D) */
  pathMissing: boolean
}

/** 재분석 영향 범위(추가/변경 노드 강조 + 요약). (06 §5, M12_4) */
export interface TabImpact {
  /** 그래프에서 강조할 노드 id(추가 + 변경). */
  highlight: string[]
  summary: { addedNodes: number; removedNodes: number; addedEdges: number; removedEdges: number }
}

/** 코드 편집기 대상(소스 + 이동 라인). (04 §6, M11_5; Monaco 편집 M12) */
export interface TabCodeView {
  file: string
  line: number
  /** 디스크에서 마지막으로 읽거나 저장한 내용(원본/저장본). 편집 중 내용은 에디터가 보유. */
  content: string
  /** 외부 변경 충돌 감지용 mtime. 디스크에 없으면 null. (M12_2) */
  baseMtime: number | null
  /** 미저장 변경 여부. (M12_2) */
  dirty: boolean
}

const DEFAULT_VIEW_MODE: ViewMode = 'graph'

function createAnalysisState(): TabAnalysisState {
  return { status: 'idle', progress: null, summary: null, graph: null, logSites: [], error: null }
}

let idCounter = 0
function nextId(): string {
  idCounter += 1
  return `tab-${idCounter}`
}

/** 기본 상태로 새 탭을 만든다. 각 탭은 독립된 view/analysis 컨테이너를 갖는다. */
function createTab(projectPath: string | null, projectName: string | null): TabState {
  return {
    id: nextId(),
    projectPath,
    projectName,
    view: {
      mode: DEFAULT_VIEW_MODE,
      selectedNodeId: null,
      backtrace: null,
      focus: null,
      compare: false
    },
    analysis: createAnalysisState(),
    log: null,
    codeView: null,
    impact: null,
    snapshot: null,
    pathMissing: false
  }
}

/** 최근 닫은 탭 이력 보관 최대 개수. (TODO_EXTRA D) */
const MAX_RECENTLY_CLOSED = 10

export class TabStore {
  private tabs: TabState[] = []
  private activeId: string | null = null
  private recentlyClosed: PersistedTab[] = []
  private readonly listeners = new Set<() => void>()

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private emit(): void {
    this.listeners.forEach((listener) => listener())
  }

  getTabs(): readonly TabState[] {
    return this.tabs
  }

  getActiveId(): string | null {
    return this.activeId
  }

  getActive(): TabState | null {
    return this.tabs.find((tab) => tab.id === this.activeId) ?? null
  }

  /** 빈 탭(프로젝트 미선택)을 추가하고 활성화한다. */
  addEmptyTab(): TabState {
    const tab = createTab(null, null)
    this.tabs.push(tab)
    this.activeId = tab.id
    this.emit()
    return tab
  }

  /**
   * 프로젝트를 연다. (01 §4, M2_1)
   * 이미 같은 프로젝트를 연 탭이 있으면 그 탭으로 포커스한다(중복 방지). (TODO_EXTRA D)
   * 그렇지 않고 활성 탭이 비어 있으면 그 탭에 로드(재사용), 아니면 새 탭에 로드한다.
   */
  openProject(path: string, name: string): TabState {
    const existing = this.tabs.find((t) => t.projectPath === path)
    if (existing) {
      this.activeId = existing.id
      this.emit()
      return existing
    }
    const active = this.getActive()
    if (active && active.projectPath === null) {
      active.projectPath = path
      active.projectName = name
      this.emit()
      return active
    }
    const tab = createTab(path, name)
    this.tabs.push(tab)
    this.activeId = tab.id
    this.emit()
    return tab
  }

  /** 탭의 경로 부재 상태를 설정한다(복원 시 프로젝트가 사라진 경우). (TODO_EXTRA D) */
  setPathMissing(id: string, missing: boolean): void {
    const tab = this.tabs.find((t) => t.id === id)
    if (!tab || tab.pathMissing === missing) return
    tab.pathMissing = missing
    this.emit()
  }

  /** 최근 닫은 탭(프로젝트) 이력. 최신이 마지막. (TODO_EXTRA D) */
  getRecentlyClosed(): readonly PersistedTab[] {
    return this.recentlyClosed
  }

  /**
   * 가장 최근에 닫은 탭을 다시 연다(Ctrl+Shift+T). 이력이 없으면 null.
   * 프로젝트 탭이면 호출 측에서 재분석한다(분석 결과는 영속되지 않음). (TODO_EXTRA D)
   */
  reopenClosed(): TabState | null {
    const last = this.recentlyClosed.pop()
    if (!last) return null
    const tab = createTab(last.projectPath, last.projectName)
    tab.view = { ...tab.view, mode: last.view.mode, selectedNodeId: last.view.selectedNodeId }
    this.tabs.push(tab)
    this.activeId = tab.id
    this.emit()
    return tab
  }

  /** 탭의 뷰 모드를 설정한다(탭별 독립). 역추적 중이면 파일 그래프로 복귀한다. (03 §5.2, M10_2) */
  setViewMode(id: string, mode: ViewMode): void {
    const tab = this.tabs.find((t) => t.id === id)
    if (!tab) return
    if (tab.view.mode === mode && tab.view.backtrace === null) return
    tab.view = { ...tab.view, mode, backtrace: null }
    this.emit()
  }

  /** 선택(포커스) 노드를 설정한다. 역추적 중이면 종료하고 파일 그래프로 복귀한다. (03 §5.3, M6) */
  setSelectedNode(id: string, nodeId: string | null): void {
    const tab = this.tabs.find((t) => t.id === id)
    if (!tab) return
    if (tab.view.selectedNodeId === nodeId && tab.view.backtrace === null) return
    tab.view = { ...tab.view, selectedNodeId: nodeId, backtrace: null }
    this.emit()
  }

  /**
   * 함수 호출처 역추적을 시작/전환한다. 포커스(focus)는 보존해 역추적 종료 시 그 파일 뷰로 복귀한다.
   * (역추적 패널의 '파일 그래프로'로 나가면 직전 검색 결과 포커스가 유지된다.) (02 §6, 03 §5.3, M10_2, TODO_MORE)
   */
  setBacktrace(id: string, functionId: string): void {
    const tab = this.tabs.find((t) => t.id === id)
    if (!tab || tab.view.backtrace === functionId) return
    tab.view = { ...tab.view, backtrace: functionId }
    this.emit()
  }

  /**
   * 파일 노드를 포커스한다(그 파일 중심으로 그래프/트리를 다시 그림). 역추적은 종료한다. (TODO_MORE)
   * 선택도 함께 갱신해 정보 패널이 그 파일을 가리키게 한다.
   */
  setFocus(id: string, nodeId: string): void {
    const tab = this.tabs.find((t) => t.id === id)
    if (!tab) return
    if (tab.view.focus === nodeId && tab.view.selectedNodeId === nodeId) return
    tab.view = { ...tab.view, focus: nodeId, selectedNodeId: nodeId, backtrace: null }
    this.emit()
  }

  /** 포커스를 해제하고 전체(초기) 그래프로 돌아간다. (TODO_MORE) */
  clearFocus(id: string): void {
    const tab = this.tabs.find((t) => t.id === id)
    if (!tab || tab.view.focus === null) return
    tab.view = { ...tab.view, focus: null }
    this.emit()
  }

  /** 역추적을 종료하고 파일 그래프로 돌아간다. (M10_2) */
  clearBacktrace(id: string): void {
    const tab = this.tabs.find((t) => t.id === id)
    if (!tab || tab.view.backtrace === null) return
    tab.view = { ...tab.view, backtrace: null }
    this.emit()
  }

  /** 탭에 로그 덤프를 연다(로그 분석 활성화). (04 §2, M11_1) */
  openLog(id: string, log: TabLogState): void {
    const tab = this.tabs.find((t) => t.id === id)
    if (!tab) return
    tab.log = log
    this.emit()
  }

  /** 로그 덤프를 닫는다(로그 분석 비활성화). (M11_1) */
  closeLog(id: string): void {
    const tab = this.tabs.find((t) => t.id === id)
    if (!tab || tab.log === null) return
    tab.log = null
    this.emit()
  }

  /** 로그 라인을 선택한다(역추적 후보 표시). raw는 후보 패널용 선택 라인 원문. (04 §5, M11_4) */
  selectLogLine(id: string, index: number | null, raw: string | null = null): void {
    const tab = this.tabs.find((t) => t.id === id)
    if (!tab || !tab.log) return
    if (tab.log.selectedLine === index && tab.log.selectedRaw === raw) return
    tab.log = { ...tab.log, selectedLine: index, selectedRaw: raw }
    this.emit()
  }

  /** 코드 편집기를 연다(소스 표시). (04 §6, M11_5) */
  setCodeView(id: string, codeView: TabCodeView | null): void {
    const tab = this.tabs.find((t) => t.id === id)
    if (!tab) return
    tab.codeView = codeView
    this.emit()
  }

  /** 현재 그래프를 비교용 스냅샷으로 캡처한다. (03, 06 §5, M14_3) */
  setSnapshot(id: string, snapshot: CodeGraph | null): void {
    const tab = this.tabs.find((t) => t.id === id)
    if (!tab) return
    tab.snapshot = snapshot
    if (snapshot === null) tab.view = { ...tab.view, compare: false }
    this.emit()
  }

  /** 전/후 비교 모드를 토글한다. 스냅샷이 없으면 무시. (M14_3) */
  setCompare(id: string, compare: boolean): void {
    const tab = this.tabs.find((t) => t.id === id)
    if (!tab || tab.view.compare === compare) return
    if (compare && !tab.snapshot) return
    tab.view = { ...tab.view, compare }
    this.emit()
  }

  /** 재분석 영향 범위를 설정/해제한다. (06 §5, M12_4) */
  setImpact(id: string, impact: TabImpact | null): void {
    const tab = this.tabs.find((t) => t.id === id)
    if (!tab) return
    tab.impact = impact
    this.emit()
  }

  /** 편집기 미저장 변경 여부를 갱신한다. (M12_2) */
  setCodeDirty(id: string, dirty: boolean): void {
    const tab = this.tabs.find((t) => t.id === id)
    if (!tab || !tab.codeView || tab.codeView.dirty === dirty) return
    tab.codeView = { ...tab.codeView, dirty }
    this.emit()
  }

  /** 저장 성공 후 원본/ mtime을 갱신하고 dirty를 해제한다. (M12_2) */
  setCodeSaved(id: string, content: string, mtime: number): void {
    const tab = this.tabs.find((t) => t.id === id)
    if (!tab || !tab.codeView) return
    tab.codeView = { ...tab.codeView, content, baseMtime: mtime, dirty: false }
    this.emit()
  }

  /** 분석 상태를 갱신한다(탭이 없으면 무시). */
  private patchAnalysis(id: string, analysis: TabAnalysisState): void {
    const tab = this.tabs.find((t) => t.id === id)
    if (!tab) return
    tab.analysis = analysis
    this.emit()
  }

  startAnalysis(id: string): void {
    this.patchAnalysis(id, {
      status: 'running',
      progress: null,
      summary: null,
      graph: null,
      logSites: [],
      error: null
    })
  }

  setAnalysisProgress(id: string, progress: AnalysisProgress): void {
    const tab = this.tabs.find((t) => t.id === id)
    if (!tab || tab.analysis.status !== 'running') return
    tab.analysis = { ...tab.analysis, progress }
    this.emit()
  }

  finishAnalysis(
    id: string,
    summary: AnalysisSummary,
    graph: CodeGraph,
    logSites: LogSite[] = []
  ): void {
    this.patchAnalysis(id, {
      status: 'done',
      progress: null,
      summary,
      graph,
      logSites,
      error: null
    })
  }

  failAnalysis(id: string, error: string): void {
    this.patchAnalysis(id, {
      status: 'error',
      progress: null,
      summary: null,
      graph: null,
      logSites: [],
      error
    })
  }

  /** 탭을 닫는다. 활성 탭을 닫으면 인접 탭(다음 → 이전)을 활성화한다. (M2_2) */
  closeTab(id: string): void {
    const index = this.tabs.findIndex((tab) => tab.id === id)
    if (index === -1) return
    // 프로젝트가 있는 탭은 닫은 탭 이력에 보관(빈 탭은 복원 의미 없음). (TODO_EXTRA D)
    const closed = this.tabs[index]
    if (closed.projectPath !== null) {
      this.recentlyClosed.push({
        projectPath: closed.projectPath,
        projectName: closed.projectName,
        view: { mode: closed.view.mode, selectedNodeId: closed.view.selectedNodeId }
      })
      if (this.recentlyClosed.length > MAX_RECENTLY_CLOSED) this.recentlyClosed.shift()
    }
    this.tabs.splice(index, 1)
    if (this.activeId === id) {
      const fallback = this.tabs[index] ?? this.tabs[index - 1] ?? null
      this.activeId = fallback ? fallback.id : null
    }
    this.emit()
  }

  /** 탭을 활성화(전환)한다. (M2_2) */
  setActive(id: string): void {
    if (this.activeId === id) return
    if (this.tabs.some((tab) => tab.id === id)) {
      this.activeId = id
      this.emit()
    }
  }

  /**
   * 세션 저장용으로 탭 목록을 직렬화한다. (01 §5, M8_3·M8_4)
   * 탭/프로젝트 경로/활성 탭과 각 탭의 뷰 상태(모드 + 선택 노드)를 포함한다.
   */
  serialize(): { tabs: PersistedTab[]; activeIndex: number; recentlyClosed: PersistedTab[] } {
    const tabs: PersistedTab[] = this.tabs.map((tab) => ({
      projectPath: tab.projectPath,
      projectName: tab.projectName,
      view: { mode: tab.view.mode, selectedNodeId: tab.view.selectedNodeId }
    }))
    const activeIndex = this.tabs.findIndex((tab) => tab.id === this.activeId)
    return {
      tabs,
      activeIndex: activeIndex === -1 ? 0 : activeIndex,
      recentlyClosed: [...this.recentlyClosed]
    }
  }

  /**
   * 세션에서 탭 목록을 복원한다. (01 §5, M8_3·M8_4)
   * 기존 탭을 대체하고, 각 탭의 뷰 상태(모드/선택 노드)를 복원하며 activeIndex 탭을 활성화한다.
   * 복원된 탭 목록을 반환한다. 분석 결과는 영속되지 않으므로 호출 측에서 프로젝트 탭을 재분석한다.
   */
  restore(
    persisted: readonly PersistedTab[],
    activeIndex: number,
    recentlyClosed: readonly PersistedTab[] = []
  ): TabState[] {
    this.recentlyClosed = [...recentlyClosed]
    this.tabs = persisted.map((p) => {
      const tab = createTab(p.projectPath, p.projectName)
      // 역추적은 영속하지 않으므로 항상 null로 복원한다. (M10_2)
      tab.view = {
        mode: p.view.mode,
        selectedNodeId: p.view.selectedNodeId,
        backtrace: null,
        focus: null,
        compare: false
      }
      return tab
    })
    const active = this.tabs[activeIndex] ?? this.tabs[0] ?? null
    this.activeId = active ? active.id : null
    this.emit()
    return this.tabs
  }
}
