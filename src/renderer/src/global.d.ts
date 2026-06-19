import type { AnalysisProgress, AnalysisResult } from '../../shared/analysis'
import type { SessionState } from '../../shared/session'

export interface ProjectSelection {
  path: string
  name: string
}

export type MenuAction = 'open-project' | 'new-tab' | 'close-tab'

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
      saveSession: (state: SessionState) => Promise<void>
    }
  }
}

export {}
