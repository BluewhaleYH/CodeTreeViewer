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

    // 프로젝트 분석을 실행하고 탭 상태를 갱신한다. (02 §3)
    const analyze = async (tabId: string, projectPath: string): Promise<void> => {
      store.startAnalysis(tabId)
      try {
        const summary = await window.codetree.runAnalysis(projectPath, (progress) =>
          store.setAnalysisProgress(tabId, progress)
        )
        store.finishAnalysis(tabId, summary)
      } catch (error) {
        store.failAnalysis(tabId, error instanceof Error ? error.message : String(error))
      }
    }

    // 폴더 선택 다이얼로그로 프로젝트를 연다. (01 §4) 열리면 분석을 시작한다.
    const openProject = async (): Promise<void> => {
      const selection = await window.codetree.openProjectDialog()
      if (selection) {
        const tab = store.openProject(selection.path, selection.name)
        void analyze(tab.id, selection.path)
      }
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

    // 자체 검수(스크린샷) 모드: 분석 완료 결과를 시드해 분석 요약 UI를 확인한다.
    if (window.codetree.captureMode) {
      const demo = store.openProject('/home/dev/AndroidProject', 'AndroidProject')
      store.finishAnalysis(demo.id, {
        root: '/home/dev/AndroidProject',
        fileCount: 128,
        parsedCount: 126,
        failureCount: 2,
        byLanguage: { java: 90, kotlin: 36 },
        skippedDirCount: 3,
        nodeCount: 685,
        functionNodeCount: 540,
        externalNodeCount: 17,
        domainCount: 6,
        edgeCount: 214,
        failures: [
          { relativePath: 'app/src/main/java/Broken.java', reason: 'EACCES: permission denied' },
          { relativePath: 'lib/Garbled.kt', reason: 'EACCES: permission denied' }
        ]
      })
    }

    render()
  }
}
