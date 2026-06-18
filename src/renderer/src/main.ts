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

    const render = (): void => {
      renderTabBar(tabbar, store)
      renderTabContent(workspace, store)
    }
    store.subscribe(render)

    // 폴더 선택 다이얼로그로 프로젝트를 연다. (01 §4)
    const openProject = async (): Promise<void> => {
      const selection = await window.codetree.openProjectDialog()
      if (selection) store.openProject(selection.path, selection.name)
    }

    // 메뉴 액션: 프로젝트 열기. 새 탭/탭 닫기 동작은 M2_2에서 연결한다.
    window.codetree.onMenuAction((action) => {
      if (action === 'open-project') void openProject()
    })

    // 초기 상태: 빈 탭 1개.
    store.addEmptyTab()

    // 자체 검수(스크린샷) 모드: 데모 프로젝트를 시드해 로드된 탭 UI를 확인한다.
    if (window.codetree.captureMode) {
      store.openProject('/Users/example/AndroidProject', 'AndroidProject')
    }

    render()
  }
}
