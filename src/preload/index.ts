import { contextBridge, ipcRenderer } from 'electron'

export interface ProjectSelection {
  path: string
  name: string
}

export type MenuAction = 'open-project' | 'new-tab' | 'close-tab'

const MENU_CHANNELS: Record<string, MenuAction> = {
  'menu:open-project': 'open-project',
  'menu:new-tab': 'new-tab',
  'menu:close-tab': 'close-tab'
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
  }
}

contextBridge.exposeInMainWorld('codetree', api)

export type CodeTreeApi = typeof api
