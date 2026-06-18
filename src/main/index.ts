import { app, BrowserWindow } from 'electron'
import { createMainWindow } from './window'
import { buildAppMenu } from './menu'
import { registerIpcHandlers } from './ipc'

// 단일 인스턴스 보장 (01 §7).
// 두 번째 인스턴스가 실행되면 락 획득에 실패하고 즉시 종료한다.
const gotSingleInstanceLock = app.requestSingleInstanceLock()

if (!gotSingleInstanceLock) {
  app.quit()
} else {
  // 두 번째 실행 시도 시: 기존 창을 복원/포커스한다.
  app.on('second-instance', () => {
    focusExistingWindow()
  })

  app.whenReady().then(() => {
    registerIpcHandlers()
    buildAppMenu()
    createMainWindow()

    app.on('activate', () => {
      // macOS: 모든 창이 닫힌 상태에서 dock 클릭 시 창을 다시 연다.
      if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
    })
  })

  app.on('window-all-closed', () => {
    // macOS 외 플랫폼: 모든 창이 닫히면 앱을 종료한다. (01 §3)
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
