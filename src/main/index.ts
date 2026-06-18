import { app, BrowserWindow } from 'electron'
import { createMainWindow } from './window'

app.whenReady().then(() => {
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
