/**
 * 세션(영속 상태) 직렬화 타입. main/renderer 공용. (01 §5)
 * 복원 대상: 창 상태, 탭 목록(프로젝트 경로), 각 탭의 뷰 모드 + 선택 노드, 활성 탭.
 */

export const SESSION_VERSION = 1

export interface WindowState {
  bounds: { x: number; y: number; width: number; height: number } | null
  maximized: boolean
}

export interface PersistedViewState {
  mode: 'graph' | 'tree'
  selectedNodeId: string | null
}

export interface PersistedTab {
  projectPath: string | null
  projectName: string | null
  view: PersistedViewState
}

export interface SessionState {
  version: number
  window: WindowState | null
  tabs: PersistedTab[]
  activeIndex: number
  /** 최근 닫은 탭 이력(최신이 마지막). Ctrl+Shift+T 복원용. (TODO_EXTRA D) */
  recentlyClosed: PersistedTab[]
}

export function emptySession(): SessionState {
  return { version: SESSION_VERSION, window: null, tabs: [], activeIndex: 0, recentlyClosed: [] }
}

/** 세션 관련 비차단 알림. 현재는 손상 감지 1종. (01 §10) */
export interface SessionNotice {
  kind: 'corrupted'
}
