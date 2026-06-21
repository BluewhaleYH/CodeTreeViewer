import { test, expect, _electron as electron, type ElectronApplication } from '@playwright/test'
import { resolve } from 'node:path'

/**
 * Electron E2E. (TODO_EXTRA E)
 * 네이티브 메뉴/폴더 다이얼로그는 자동 조작이 불가하므로, main에서 dialog를 스텁하고
 * 메뉴 채널을 직접 보내 "메뉴 → 다이얼로그 → 분석 → 렌더" 라운드트립을 검증한다.
 */

const FIXTURE = resolve(__dirname, 'fixture')

let app: ElectronApplication

test.afterEach(async () => {
  await app?.close()
})

async function launch(): Promise<ElectronApplication> {
  app = await electron.launch({
    args: ['.'],
    env: { ...process.env, ELECTRON_DISABLE_SANDBOX: '1' }
  })
  return app
}

test('앱이 기동하면 환영 화면을 보여준다', async () => {
  await launch()
  const win = await app.firstWindow()
  await expect(win.locator('.welcome__title')).toHaveText('프로젝트를 여세요')
})

test('메뉴 → 다이얼로그(스텁) → 분석 → 통계 렌더 라운드트립', async () => {
  await launch()
  const win = await app.firstWindow()
  await expect(win.locator('.welcome__title')).toBeVisible()

  // main의 폴더 선택 다이얼로그를 픽스처 경로로 스텁한다.
  await app.evaluate(async ({ dialog }, fixture) => {
    dialog.showOpenDialog = async () =>
      ({ canceled: false, filePaths: [fixture] }) as Electron.OpenDialogReturnValue
  }, FIXTURE)

  // 메뉴 '프로젝트 열기' 액션을 렌더러로 직접 전송(네이티브 메뉴 클릭 대체).
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.webContents.send('menu:open-project')
  })

  // 분석 완료 후 통계 패널이 나타나고 파일/노드 수가 표시된다.
  await expect(win.locator('.stats-panel')).toBeVisible({ timeout: 30_000 })
  await expect(win.locator('.stats-panel__title')).toHaveText('fixture')
  await expect(win.locator('.stats-panel')).toContainText('파일')
})
