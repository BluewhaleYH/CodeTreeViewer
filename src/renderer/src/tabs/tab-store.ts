/**
 * 탭 상태 저장소 (순수 로직, DOM/electron 비의존 → 단위 테스트 대상).
 * 탭 = 프로젝트 1개. 탭별로 독립적인 프로젝트·분석 결과·뷰 상태를 가진다. (01 §4)
 */

import type { AnalysisProgress, AnalysisSummary } from '../../../shared/analysis'
import type { CodeGraph } from '../../../shared/graph'
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
}

export type AnalysisStatus = 'idle' | 'running' | 'done' | 'error'

/** 탭별 분석 상태 컨테이너. (02 §3) */
export interface TabAnalysisState {
  status: AnalysisStatus
  progress: AnalysisProgress | null
  summary: AnalysisSummary | null
  graph: CodeGraph | null
  error: string | null
}

/** 탭에 열린 로그 덤프(전환 탐색 상태, 세션 미영속). (04 §2, M11_1) */
export interface TabLogState {
  path: string
  name: string
  lines: string[]
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
}

const DEFAULT_VIEW_MODE: ViewMode = 'graph'

function createAnalysisState(): TabAnalysisState {
  return { status: 'idle', progress: null, summary: null, graph: null, error: null }
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
    view: { mode: DEFAULT_VIEW_MODE, selectedNodeId: null, backtrace: null },
    analysis: createAnalysisState(),
    log: null
  }
}

export class TabStore {
  private tabs: TabState[] = []
  private activeId: string | null = null
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
   * 활성 탭이 비어 있으면 그 탭에 로드(재사용), 아니면 새 탭에 로드한다.
   */
  openProject(path: string, name: string): TabState {
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

  /** 함수 호출처 역추적을 시작/전환한다. (02 §6, 03 §5.3, M10_2) */
  setBacktrace(id: string, functionId: string): void {
    const tab = this.tabs.find((t) => t.id === id)
    if (!tab || tab.view.backtrace === functionId) return
    tab.view = { ...tab.view, backtrace: functionId }
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
      error: null
    })
  }

  setAnalysisProgress(id: string, progress: AnalysisProgress): void {
    const tab = this.tabs.find((t) => t.id === id)
    if (!tab || tab.analysis.status !== 'running') return
    tab.analysis = { ...tab.analysis, progress }
    this.emit()
  }

  finishAnalysis(id: string, summary: AnalysisSummary, graph: CodeGraph): void {
    this.patchAnalysis(id, { status: 'done', progress: null, summary, graph, error: null })
  }

  failAnalysis(id: string, error: string): void {
    this.patchAnalysis(id, { status: 'error', progress: null, summary: null, graph: null, error })
  }

  /** 탭을 닫는다. 활성 탭을 닫으면 인접 탭(다음 → 이전)을 활성화한다. (M2_2) */
  closeTab(id: string): void {
    const index = this.tabs.findIndex((tab) => tab.id === id)
    if (index === -1) return
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
  serialize(): { tabs: PersistedTab[]; activeIndex: number } {
    const tabs: PersistedTab[] = this.tabs.map((tab) => ({
      projectPath: tab.projectPath,
      projectName: tab.projectName,
      view: { mode: tab.view.mode, selectedNodeId: tab.view.selectedNodeId }
    }))
    const activeIndex = this.tabs.findIndex((tab) => tab.id === this.activeId)
    return { tabs, activeIndex: activeIndex === -1 ? 0 : activeIndex }
  }

  /**
   * 세션에서 탭 목록을 복원한다. (01 §5, M8_3·M8_4)
   * 기존 탭을 대체하고, 각 탭의 뷰 상태(모드/선택 노드)를 복원하며 activeIndex 탭을 활성화한다.
   * 복원된 탭 목록을 반환한다. 분석 결과는 영속되지 않으므로 호출 측에서 프로젝트 탭을 재분석한다.
   */
  restore(persisted: readonly PersistedTab[], activeIndex: number): TabState[] {
    this.tabs = persisted.map((p) => {
      const tab = createTab(p.projectPath, p.projectName)
      // 역추적은 영속하지 않으므로 항상 null로 복원한다. (M10_2)
      tab.view = { mode: p.view.mode, selectedNodeId: p.view.selectedNodeId, backtrace: null }
      return tab
    })
    const active = this.tabs[activeIndex] ?? this.tabs[0] ?? null
    this.activeId = active ? active.id : null
    this.emit()
    return this.tabs
  }
}
