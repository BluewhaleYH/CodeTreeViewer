import './index.css'
import { TabStore } from './tabs/tab-store'
import { renderTabBar } from './tabs/tab-bar'
import { renderTabContent } from './tabs/tab-content'

const root = document.getElementById('app')

if (root) {
  root.innerHTML = `
    <div class="layout">
      <header class="tabbar" id="tabbar"></header>
      <main class="workspace" id="workspace"></main>
    </div>
  `

  const tabbar = root.querySelector<HTMLElement>('#tabbar')
  const workspace = root.querySelector<HTMLElement>('#workspace')

  if (tabbar && workspace) {
    const store = new TabStore()

    // 폴더 선택 다이얼로그로 프로젝트를 연다. (01 §4)
    const openProject = async (): Promise<void> => {
      const selection = await window.codetree.openProjectDialog()
      if (selection) store.openProject(selection.path, selection.name)
    }

    const render = (): void => {
      renderTabBar(tabbar, store)
      renderTabContent(workspace, store, { openProject: () => void openProject() })
    }
    store.subscribe(render)

    // 메뉴 액션 연결. (01 §8)
    window.codetree.onMenuAction((action) => {
      if (action === 'open-project') void openProject()
      else if (action === 'new-tab') store.addEmptyTab()
      else if (action === 'close-tab') {
        const active = store.getActiveId()
        if (active) store.closeTab(active)
      }
    })

    // 초기 상태: 빈 탭 1개(→ welcome 화면).
    store.addEmptyTab()

    // 자체 검수(스크린샷) 모드: 프로젝트 탭 + 빈 탭(활성) 시드로 다중 탭 + welcome 확인.
    if (window.codetree.captureMode) {
      store.openProject('/Users/example/AndroidProject', 'AndroidProject')
      store.addEmptyTab()
    }

    render()
  }
}
