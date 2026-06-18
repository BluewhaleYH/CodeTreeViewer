import { BrowserWindow, dialog, ipcMain } from 'electron'
import { basename } from 'node:path'

export interface ProjectSelection {
  path: string
  name: string
}

/**
 * 메인 프로세스 IPC 핸들러를 등록한다.
 * - `dialog:open-project`: 폴더 선택 다이얼로그를 띄우고 선택된 프로젝트 경로/이름을 반환한다. (01 §4)
 */
export function registerIpcHandlers(): void {
  ipcMain.handle('dialog:open-project', async (event): Promise<ProjectSelection | null> => {
    const owner = BrowserWindow.fromWebContents(event.sender)
    const result = owner
      ? await dialog.showOpenDialog(owner, { properties: ['openDirectory'] })
      : await dialog.showOpenDialog({ properties: ['openDirectory'] })

    if (result.canceled || result.filePaths.length === 0) return null

    const path = result.filePaths[0]
    return { path, name: basename(path) }
  })
}
