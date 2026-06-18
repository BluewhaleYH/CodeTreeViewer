import type { TabStore } from './tab-store'

export interface TabContentActions {
  openProject: () => void
}

/**
 * 활성 탭의 콘텐츠 영역을 렌더한다.
 * 프로젝트가 있으면 프로젝트 뷰, 없으면(빈 탭/탭 없음) welcome 화면을 표시한다. (01 §4, M2_3)
 */
export function renderTabContent(
  container: HTMLElement,
  store: TabStore,
  actions: TabContentActions
): void {
  const active = store.getActive()
  container.innerHTML = ''

  if (active && active.projectPath !== null) {
    container.appendChild(renderProjectView(active.projectName ?? '', active.projectPath))
  } else {
    container.appendChild(renderWelcome(actions))
  }
}

function renderProjectView(name: string, path: string): HTMLElement {
  const box = document.createElement('div')
  box.className = 'content'

  const title = document.createElement('h2')
  title.textContent = name

  const pathEl = document.createElement('p')
  pathEl.className = 'path'
  pathEl.textContent = path

  box.append(title, pathEl)
  return box
}

function renderWelcome(actions: TabContentActions): HTMLElement {
  const box = document.createElement('div')
  box.className = 'welcome'

  const icon = document.createElement('div')
  icon.className = 'welcome__icon'
  icon.textContent = '📁'

  const title = document.createElement('h2')
  title.className = 'welcome__title'
  title.textContent = '프로젝트를 여세요'

  const desc = document.createElement('p')
  desc.className = 'welcome__desc'
  desc.textContent = '폴더를 선택하면 파일·함수 관계를 관계도/트리로 시각화합니다.'

  const button = document.createElement('button')
  button.className = 'welcome__button'
  button.textContent = '프로젝트 열기'
  button.addEventListener('click', () => actions.openProject())

  box.append(icon, title, desc, button)
  return box
}
