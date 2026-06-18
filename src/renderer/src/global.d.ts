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
    }
  }
}

export {}
