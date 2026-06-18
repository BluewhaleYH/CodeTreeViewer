import { app, BrowserWindow } from 'electron'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

// 너무 좁아지면 그래프/패널 레이아웃이 깨지므로 최소 크기를 둔다. (03 §2)
const MIN_WIDTH = 940
const MIN_HEIGHT = 600

const DEFAULT_WIDTH = 1280
const DEFAULT_HEIGHT = 800

/**
 * 메인 윈도우를 생성한다. (01 §3)
 * - 최소화/최대화/종료는 기본 프레임(frame: true)이 OS 창 컨트롤로 제공한다.
 * - 보안 기본값(01 §2): contextIsolation on, nodeIntegration off, sandbox on, preload 경유.
 * - 창 크기·위치·최대화 상태의 저장/복원과 멀티모니터 보정은 세션(M8, 01 §5)에서 다룬다.
 */
export function createMainWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: DEFAULT_WIDTH,
    height: DEFAULT_HEIGHT,
    minWidth: MIN_WIDTH,
    minHeight: MIN_HEIGHT,
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

  window.on('ready-to-show', () => {
    window.show()
    // UI 검수용 스크린샷 캡처 모드 (CLAUDE.md §6).
    if (process.env['CAPTURE_SCREENSHOT']) {
      void captureAndExit(window)
    }
  })

  // 개발 모드에서는 electron-vite가 주입하는 렌더러 URL(HMR)을 로드한다.
  const rendererUrl = process.env['ELECTRON_RENDERER_URL']
  if (rendererUrl) {
    void window.loadURL(rendererUrl)
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return window
}

/**
 * 현재 창을 PNG로 캡처해 screenshots/에 저장하고 앱을 종료한다.
 * 자체 검수 자동화 용도이며 CAPTURE_SCREENSHOT 환경변수로만 동작한다.
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
