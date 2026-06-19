import { app, type BrowserWindow } from 'electron'
import { autoUpdater } from 'electron-updater'

/** 업데이트 확인 주기: 6시간. (DEPLOY.md §4.3) */
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000

/**
 * 자동 업데이트를 초기화한다. (DEPLOY.md §4)
 * - 패키징 배포본에서만 동작한다(개발/프리뷰/테스트·무피드 환경은 건너뛰어 기동 실패를 막는다).
 * - 기동 시 1회 + 6시간 간격으로 확인하고, 백그라운드 다운로드 완료 시 비차단 알림을 보낸다.
 * - 설치는 앱 종료/재시작 시 적용된다(autoInstallOnAppQuit 기본값).
 */
export function initAutoUpdate(win: BrowserWindow): void {
  if (!app.isPackaged) return

  autoUpdater.on('update-downloaded', () => {
    if (!win.isDestroyed()) win.webContents.send('update:notice', { kind: 'downloaded' })
  })
  autoUpdater.on('error', (err) => {
    // 네트워크/피드 부재 등은 치명적이지 않다. 로그만 남기고 앱은 계속 동작한다.
    console.error('[autoUpdater]', err)
  })

  const check = (): void => {
    autoUpdater.checkForUpdates().catch((err) => console.error('[autoUpdater] check 실패', err))
  }
  check()
  const timer = setInterval(check, CHECK_INTERVAL_MS)
  win.on('closed', () => clearInterval(timer))
}
