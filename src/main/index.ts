import { app, BrowserWindow } from 'electron'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * 메인 윈도우를 생성한다.
 * 보안 기본값(01 §2): contextIsolation on, nodeIntegration off, sandbox on, preload 경유.
 * 창 제어(최소화/최대화/종료)와 단일 인스턴스는 M1에서 확장한다.
 */
function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    title: 'CodeTreeViewer',
    backgroundColor: '#1e1e1e',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
    // UI 검수용 스크린샷 캡처 모드 (CLAUDE.md §6). 헤드리스에서는 xvfb-run으로 실행.
    if (process.env['CAPTURE_SCREENSHOT']) {
      void captureAndExit(mainWindow)
    }
  })

  // 개발 모드에서는 electron-vite가 주입하는 렌더러 URL(HMR)을 로드한다.
  const rendererUrl = process.env['ELECTRON_RENDERER_URL']
  if (rendererUrl) {
    void mainWindow.loadURL(rendererUrl)
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

/**
 * 현재 창을 PNG로 캡처해 screenshots/에 저장하고 앱을 종료한다.
 * 자체 검수 자동화를 위한 용도이며 CAPTURE_SCREENSHOT 환경변수로만 동작한다.
 */
async function captureAndExit(win: BrowserWindow): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 800))
  const image = await win.webContents.capturePage()
  const dir = join(process.cwd(), 'screenshots')
  await mkdir(dir, { recursive: true })
  const file = join(dir, `capture-${process.platform}.png`)
  await writeFile(file, image.toPNG())
  console.log(`[screenshot] saved: ${file}`)
  app.quit()
}

app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
