import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { AnalysisProgress, AnalysisResult } from '../shared/analysis'
import type { PersistedTab, SessionNotice, SessionState } from '../shared/session'
import type { UpdateNotice } from '../shared/update'
import type { LogOpenResult, LogSite } from '../shared/log'
import type { SourceReadResult, SourceSaveResult } from '../shared/source'

export interface ProjectSelection {
  path: string
  name: string
}

export type MenuAction = 'open-project' | 'new-tab' | 'close-tab' | 'open-log' | 'reopen-tab'

let analysisCounter = 0

const MENU_CHANNELS: Record<string, MenuAction> = {
  'menu:open-project': 'open-project',
  'menu:new-tab': 'new-tab',
  'menu:close-tab': 'close-tab',
  'menu:open-log': 'open-log',
  'menu:reopen-tab': 'reopen-tab'
}

/**
 * 렌더러에 노출하는 안전한 API. (01 §2)
 * contextIsolation 환경에서 contextBridge로만 노출한다.
 */
const api = {
  platform: process.platform,
  // 자체 검수(스크린샷) 모드 여부. 데모 상태 시드 등에 사용한다.
  captureMode: Boolean(process.env['CAPTURE_SCREENSHOT']),

  /** 폴더 선택 다이얼로그를 띄워 프로젝트를 선택한다. 취소 시 null. (01 §4) */
  openProjectDialog: (): Promise<ProjectSelection | null> =>
    ipcRenderer.invoke('dialog:open-project'),

  /** 메뉴 액션(menu:*) 구독. 해제 함수를 반환한다. (01 §8) */
  onMenuAction: (handler: (action: MenuAction) => void): (() => void) => {
    const registered = Object.entries(MENU_CHANNELS).map(([channel, action]) => {
      const listener = (): void => handler(action)
      ipcRenderer.on(channel, listener)
      return { channel, listener }
    })
    return () => {
      registered.forEach(({ channel, listener }) => ipcRenderer.removeListener(channel, listener))
    }
  },

  /** 프로젝트 분석을 실행한다. 진행률은 onProgress로 통지된다. 결과는 요약+그래프. (02 §3, §8) */
  runAnalysis: (
    projectPath: string,
    onProgress: (progress: AnalysisProgress) => void
  ): Promise<AnalysisResult> => {
    analysisCounter += 1
    const id = `analysis-${analysisCounter}`
    const listener = (
      _event: IpcRendererEvent,
      data: { id: string; progress: AnalysisProgress }
    ): void => {
      if (data.id === id) onProgress(data.progress)
    }
    ipcRenderer.on('analysis:progress', listener)
    return ipcRenderer
      .invoke('analysis:run', { id, projectPath })
      .finally(() => ipcRenderer.removeListener('analysis:progress', listener))
  },

  /** 세션 로드 / 탭 저장. (01 §5) */
  loadSession: (): Promise<SessionState> => ipcRenderer.invoke('session:load'),
  saveTabs: (
    tabs: PersistedTab[],
    activeIndex: number,
    recentlyClosed: PersistedTab[]
  ): Promise<void> =>
    ipcRenderer.invoke('session:save-tabs', { tabs, activeIndex, recentlyClosed }),

  /** 프로젝트 경로가 존재하는 디렉터리인지 확인(복원 시 깨진 경로 감지). (TODO_EXTRA D) */
  projectExists: (path: string): Promise<boolean> =>
    ipcRenderer.invoke('project:exists', { path }),

  /** 세션 비차단 알림(손상 감지 등) 구독. 해제 함수를 반환한다. (01 §10) */
  onSessionNotice: (handler: (notice: SessionNotice) => void): (() => void) => {
    const listener = (_event: IpcRendererEvent, notice: SessionNotice): void => handler(notice)
    ipcRenderer.on('session:notice', listener)
    return () => ipcRenderer.removeListener('session:notice', listener)
  },

  /** 자동 업데이트 비차단 알림(다운로드 완료 등) 구독. 해제 함수를 반환한다. (DEPLOY.md §4) */
  onUpdateNotice: (handler: (notice: UpdateNotice) => void): (() => void) => {
    const listener = (_event: IpcRendererEvent, notice: UpdateNotice): void => handler(notice)
    ipcRenderer.on('update:notice', listener)
    return () => ipcRenderer.removeListener('update:notice', listener)
  },

  /** 로그 덤프 파일 열기 다이얼로그. 취소 시 null. (04 §2, M11_1) */
  openLogDialog: (): Promise<LogOpenResult | null> => ipcRenderer.invoke('log:open'),

  /** 스트리밍 로그: 흩어진 가시 라인 텍스트 읽기. (TODO_EXTRA C) */
  logLines: (id: number, indices: number[]): Promise<string[]> =>
    ipcRenderer.invoke('log:lines', { id, indices }),
  /** 스트리밍 로그: 필터 통과 인덱스(디스크 스캔). */
  logScan: (
    id: number,
    filter: { levels: string[] | null; tag: string; text: string; regex: boolean }
  ): Promise<number[]> => ipcRenderer.invoke('log:scan', { id, filter }),
  /** 스트리밍 로그: visible 중 검색 매치 인덱스. */
  logSearch: (id: number, visible: number[], query: string, regex: boolean): Promise<number[]> =>
    ipcRenderer.invoke('log:search', { id, visible, query, regex }),
  /** 스트리밍 로그: 파일 로그 사이트와 연관된 라인 인덱스. */
  logRelated: (id: number, sites: LogSite[], file: string): Promise<number[]> =>
    ipcRenderer.invoke('log:related', { id, sites, file }),

  /** 프로젝트 내 소스 파일 읽기(content+mtime). 실패 시 null. (04 §6, M11_5·M12_2) */
  readSource: (projectPath: string, relativePath: string): Promise<SourceReadResult | null> =>
    ipcRenderer.invoke('source:read', { projectPath, relativePath }),

  /** 소스 파일 저장(원자적 쓰기 + 외부 변경 충돌 감지). (06 §3, §6, M12_2) */
  saveSource: (
    projectPath: string,
    relativePath: string,
    content: string,
    baseMtime: number | null
  ): Promise<SourceSaveResult> =>
    ipcRenderer.invoke('source:save', { projectPath, relativePath, content, baseMtime }),

  /** 저장 후 증분 재분석. 변경 파일 중심으로 그래프/요약/로그사이트 갱신. (06 §4, M12_3) */
  reanalyze: (projectPath: string, relativePath: string): Promise<AnalysisResult> =>
    ipcRenderer.invoke('analysis:reanalyze', { projectPath, relativePath })
}

contextBridge.exposeInMainWorld('codetree', api)

export type CodeTreeApi = typeof api
