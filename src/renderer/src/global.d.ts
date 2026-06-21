import type { AnalysisProgress, AnalysisResult } from '../../shared/analysis'
import type { PersistedTab, SessionNotice, SessionState } from '../../shared/session'
import type { UpdateNotice } from '../../shared/update'
import type { LogOpenResult } from '../../shared/log'
import type { SourceReadResult, SourceSaveResult } from '../../shared/source'

export interface ProjectSelection {
  path: string
  name: string
}

export type MenuAction = 'open-project' | 'new-tab' | 'close-tab' | 'open-log' | 'reopen-tab'

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
      saveTabs: (
        tabs: PersistedTab[],
        activeIndex: number,
        recentlyClosed: PersistedTab[]
      ) => Promise<void>
      projectExists: (path: string) => Promise<boolean>
      onSessionNotice: (handler: (notice: SessionNotice) => void) => () => void
      onUpdateNotice: (handler: (notice: UpdateNotice) => void) => () => void
      openLogDialog: () => Promise<LogOpenResult | null>
      readSource: (projectPath: string, relativePath: string) => Promise<SourceReadResult | null>
      saveSource: (
        projectPath: string,
        relativePath: string,
        content: string,
        baseMtime: number | null
      ) => Promise<SourceSaveResult>
      reanalyze: (projectPath: string, relativePath: string) => Promise<AnalysisResult>
    }
  }
}

export {}
