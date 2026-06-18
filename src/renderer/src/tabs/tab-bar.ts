import type { TabStore } from './tab-store'

/** 탭 바를 렌더한다. 추가/닫기/전환 인터랙션은 M2_2에서 확장한다. */
export function renderTabBar(container: HTMLElement, store: TabStore): void {
  container.innerHTML = ''
  for (const tab of store.getTabs()) {
    const el = document.createElement('div')
    el.className = tab.id === store.getActiveId() ? 'tab tab--active' : 'tab'
    el.textContent = tab.projectName ?? '새 탭'
    el.title = tab.projectPath ?? '프로젝트 미선택'
    container.appendChild(el)
  }
}
