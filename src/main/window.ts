import { app, BrowserWindow, screen } from 'electron'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { SessionManager } from './session/session-manager'
import { chooseBounds, type Rect } from './session/window-bounds'

const MIN_WIDTH = 940
const MIN_HEIGHT = 600
const DEFAULT_WIDTH = 1280
const DEFAULT_HEIGHT = 800

/**
 * 메인 윈도우를 생성한다. (01 §3)
 * 세션의 창 상태(크기/위치/최대화)를 복원하고, 화면 밖이면 기본 크기로 보정한다(멀티모니터). (01 §5)
 * 변경 시 세션에 저장(디바운스). 보안 기본값(01 §2) 유지.
 */
export function createMainWindow(session: SessionManager): BrowserWindow {
  const restored = session.get().window
  const areas: Rect[] = screen.getAllDisplays().map((d) => d.workArea)
  const bounds = chooseBounds(restored?.bounds ?? null, areas, {
    width: DEFAULT_WIDTH,
    height: DEFAULT_HEIGHT
  })

  const window = new BrowserWindow({
    ...bounds,
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

  if (restored?.maximized) window.maximize()

  const persist = (): void => {
    session.setWindow({ bounds: window.getNormalBounds(), maximized: window.isMaximized() })
  }
  window.on('resize', persist)
  window.on('move', persist)
  window.on('maximize', persist)
  window.on('unmaximize', persist)

  window.on('ready-to-show', () => {
    window.show()
    if (process.env['CAPTURE_SCREENSHOT']) {
      void captureAndExit(window)
    }
  })

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
