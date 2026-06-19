import { BrowserWindow, Menu, type MenuItemConstructorOptions } from 'electron'

const isMac = process.platform === 'darwin'

/**
 * 메뉴 액션을 렌더러로 보낸다. 실제 동작(폴더 선택/탭 추가·닫기)은 M2에서 렌더러가 수신해 처리한다.
 * 포커스된 창이 없으면 첫 번째 창으로 보낸다.
 */
function emit(channel: string): void {
  const target = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
  target?.webContents.send(channel)
}

/**
 * 애플리케이션 메뉴를 구성한다. (01 §8)
 * 최소 메뉴: 프로젝트 열기 / 새 탭 / 탭 닫기 / 종료.
 * 단축키 수정자 키는 Ctrl 기준(주 대상 Windows/Linux, macOS 미지원 대상). (00 §10 D13)
 * 종료는 macOS(개발 환경)에서는 앱 메뉴(Cmd+Q), 그 외에는 파일 메뉴에 둔다.
 */
export function buildAppMenu(): void {
  const template: MenuItemConstructorOptions[] = [
    ...(isMac ? [{ role: 'appMenu' as const }] : []),
    {
      label: '파일',
      submenu: [
        {
          label: '프로젝트 열기…',
          accelerator: 'Ctrl+O',
          click: () => emit('menu:open-project')
        },
        {
          label: '로그 덤프 열기…',
          accelerator: 'Ctrl+L',
          click: () => emit('menu:open-log')
        },
        { type: 'separator' },
        { label: '새 탭', accelerator: 'Ctrl+T', click: () => emit('menu:new-tab') },
        { label: '탭 닫기', accelerator: 'Ctrl+W', click: () => emit('menu:close-tab') },
        ...(isMac ? [] : [{ type: 'separator' as const }, { role: 'quit' as const, label: '종료' }])
      ]
    }
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
