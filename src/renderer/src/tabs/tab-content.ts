import type { TabStore } from './tab-store'

/** 활성 탭의 콘텐츠 영역을 렌더한다. 풍부한 빈 상태(welcome)는 M2_3에서 다룬다. */
export function renderTabContent(container: HTMLElement, store: TabStore): void {
  const active = store.getActive()
  container.innerHTML = ''

  const box = document.createElement('div')
  box.className = 'content'

  if (!active) {
    box.innerHTML = '<p class="muted">열린 탭이 없습니다.</p>'
  } else if (active.projectPath === null) {
    box.innerHTML = '<p class="muted">프로젝트가 선택되지 않았습니다.</p>'
  } else {
    const title = document.createElement('h2')
    title.textContent = active.projectName ?? ''
    const path = document.createElement('p')
    path.className = 'path'
    path.textContent = active.projectPath
    box.append(title, path)
  }

  container.appendChild(box)
}
