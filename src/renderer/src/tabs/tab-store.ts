/**
 * 탭 상태 저장소 (순수 로직, DOM/electron 비의존 → 단위 테스트 대상).
 * 탭 = 프로젝트 1개. 탭별로 독립적인 프로젝트·분석 결과·뷰 상태를 가진다. (01 §4)
 */

import type { AnalysisProgress, AnalysisSummary } from '../../../shared/analysis'
import type { CodeGraph } from '../../../shared/graph'

/** 시각화 뷰 모드. 토글 UI는 M5/M6에서 연결한다. (03 §5.2) */
export type ViewMode = 'graph' | 'tree'

export interface TabViewState {
  mode: ViewMode
  /** 선택(포커스)된 노드 id. 뷰 모드 전환 시에도 유지된다. (03 §5.2, M6) */
  selectedNodeId: string | null
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

export interface TabState {
  id: string
  projectPath: string | null
  projectName: string | null
  /** 탭별 독립 뷰 상태. (01 §4, 세션 복원은 M8) */
  view: TabViewState
  /** 탭별 분석 상태/결과. (02 §3) */
  analysis: TabAnalysisState
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
    view: { mode: DEFAULT_VIEW_MODE, selectedNodeId: null },
    analysis: createAnalysisState()
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

  /** 탭의 뷰 모드를 설정한다(탭별 독립). 선택 노드는 유지한다. (03 §5.2) */
  setViewMode(id: string, mode: ViewMode): void {
    const tab = this.tabs.find((t) => t.id === id)
    if (tab && tab.view.mode !== mode) {
      tab.view = { ...tab.view, mode }
      this.emit()
    }
  }

  /** 선택(포커스) 노드를 설정한다. (03 §5.3, M6) */
  setSelectedNode(id: string, nodeId: string | null): void {
    const tab = this.tabs.find((t) => t.id === id)
    if (tab && tab.view.selectedNodeId !== nodeId) {
      tab.view = { ...tab.view, selectedNodeId: nodeId }
      this.emit()
    }
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
}
