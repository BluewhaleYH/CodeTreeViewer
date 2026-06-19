import type { AnalysisProgress, AnalysisResult } from '../../shared/analysis'
import type { PersistedTab, SessionNotice, SessionState } from '../../shared/session'
import type { UpdateNotice } from '../../shared/update'
import type { LogOpenResult } from '../../shared/log'

export interface ProjectSelection {
  path: string
  name: string
}

export type MenuAction = 'open-project' | 'new-tab' | 'close-tab' | 'open-log'

declare global {
  interface Window {
    codetree: {
      platform: string
      captureMode: boolean
      openProjectDialog: () => Promise<ProjectSelection | null>
      onMenuAction: (handler: (action: MenuAction) => void) => () => void
      runAnalysis: (
        projectPath: string,
        onProgress: (progress: AnalysisProgress) => void
      ) => Promise<AnalysisResult>
      loadSession: () => Promise<SessionState>
      saveTabs: (tabs: PersistedTab[], activeIndex: number) => Promise<void>
      onSessionNotice: (handler: (notice: SessionNotice) => void) => () => void
      onUpdateNotice: (handler: (notice: UpdateNotice) => void) => () => void
      openLogDialog: () => Promise<LogOpenResult | null>
    }
  }
}

export {}
