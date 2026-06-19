import { app, BrowserWindow } from 'electron'
import { createMainWindow } from './window'
import { buildAppMenu } from './menu'
import { registerIpcHandlers } from './ipc'
import { getSessionManager } from './session/session-manager'

// 단일 인스턴스 보장 (01 §7).
const gotSingleInstanceLock = app.requestSingleInstanceLock()

if (!gotSingleInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    focusExistingWindow()
  })

  app.whenReady().then(async () => {
    const session = getSessionManager()
    await session.init() // 창 복원 전에 세션을 읽는다. (01 §5)

    registerIpcHandlers()
    buildAppMenu()
    createMainWindow(session)

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createMainWindow(session)
    })
  })

  // 정상 종료 시 세션을 즉시 저장한다. (01 §5)
  app.on('before-quit', () => {
    void getSessionManager().flush()
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}

/** 기존 메인 창을 복원하고 포커스한다. (01 §7) */
function focusExistingWindow(): void {
  const [existing] = BrowserWindow.getAllWindows()
  if (!existing) return
  if (existing.isMinimized()) existing.restore()
  existing.focus()
}
