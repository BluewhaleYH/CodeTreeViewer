import type { TabStore } from './tab-store'

/** 탭 바를 렌더한다. 클릭 전환 / × 닫기 / + 추가 인터랙션을 포함한다. (M2_2) */
export function renderTabBar(container: HTMLElement, store: TabStore): void {
  container.innerHTML = ''

  for (const tab of store.getTabs()) {
    const el = document.createElement('div')
    el.className = tab.id === store.getActiveId() ? 'tab tab--active' : 'tab'
    el.title = tab.projectPath ?? '프로젝트 미선택'
    el.addEventListener('click', () => store.setActive(tab.id))

    const label = document.createElement('span')
    label.className = 'tab__label'
    label.textContent = tab.projectName ?? '새 탭'

    const close = document.createElement('button')
    close.className = 'tab__close'
    close.textContent = '×'
    close.title = '탭 닫기'
    close.addEventListener('click', (event) => {
      event.stopPropagation()
      store.closeTab(tab.id)
    })

    el.append(label, close)
    container.appendChild(el)
  }

  const add = document.createElement('button')
  add.className = 'tab-add'
  add.textContent = '+'
  add.title = '새 탭'
  add.addEventListener('click', () => store.addEmptyTab())
  container.appendChild(add)
}
