/**
 * 탭 상태 저장소 (순수 로직, DOM/electron 비의존 → 단위 테스트 대상).
 * 탭 = 프로젝트 1개. 탭별로 독립 상태를 가진다. (01 §4)
 * 탭별 분석·뷰 상태 컨테이너 확장은 M2_4에서 다룬다.
 */

export interface TabState {
  id: string
  projectPath: string | null
  projectName: string | null
}

let idCounter = 0
function nextId(): string {
  idCounter += 1
  return `tab-${idCounter}`
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
    const tab: TabState = { id: nextId(), projectPath: null, projectName: null }
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
    const tab: TabState = { id: nextId(), projectPath: path, projectName: name }
    this.tabs.push(tab)
    this.activeId = tab.id
    this.emit()
    return tab
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
