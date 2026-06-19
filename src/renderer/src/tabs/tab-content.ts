import type { TabState, TabStore } from './tab-store'

export interface TabContentActions {
  openProject: () => void
}

/**
 * 활성 탭의 콘텐츠 영역을 렌더한다.
 * 프로젝트가 있으면 프로젝트 뷰(분석 상태 포함), 없으면 welcome 화면. (01 §4, 02 §3)
 */
export function renderTabContent(
  container: HTMLElement,
  store: TabStore,
  actions: TabContentActions
): void {
  const active = store.getActive()
  container.innerHTML = ''

  if (active && active.projectPath !== null) {
    container.appendChild(renderProjectView(active))
  } else {
    container.appendChild(renderWelcome(actions))
  }
}

function renderProjectView(tab: TabState): HTMLElement {
  const box = document.createElement('div')
  box.className = 'content'

  const title = document.createElement('h2')
  title.textContent = tab.projectName ?? ''

  const pathEl = document.createElement('p')
  pathEl.className = 'path'
  pathEl.textContent = tab.projectPath ?? ''

  box.append(title, pathEl, renderAnalysis(tab))
  return box
}

function renderAnalysis(tab: TabState): HTMLElement {
  const el = document.createElement('div')
  el.className = 'analysis'
  const { status, progress, summary, error } = tab.analysis

  if (status === 'idle') {
    el.innerHTML = '<p class="muted">분석 대기 중…</p>'
  } else if (status === 'running') {
    const done = progress?.processed ?? 0
    const total = progress?.total ?? 0
    const label = progress?.phase === 'scanning' ? '스캔 중…' : `파싱 중… ${done}/${total}`
    const ratio = total > 0 ? Math.round((done / total) * 100) : 0
    const text = document.createElement('p')
    text.className = 'muted'
    text.textContent = label
    const bar = document.createElement('div')
    bar.className = 'progress'
    const fill = document.createElement('div')
    fill.className = 'progress__fill'
    fill.style.width = `${ratio}%`
    bar.appendChild(fill)
    el.append(text, bar)
  } else if (status === 'done' && summary) {
    const stat = document.createElement('p')
    stat.className = 'analysis__stat'
    stat.textContent = `파일 ${summary.fileCount}개 · Java ${summary.byLanguage.java} · Kotlin ${summary.byLanguage.kotlin}`
    el.appendChild(stat)

    const fileNodeCount = summary.nodeCount - summary.functionNodeCount - summary.externalNodeCount
    const graphStat = document.createElement('p')
    graphStat.className = 'analysis__stat analysis__substat'
    graphStat.textContent = `의존성: 파일 ${fileNodeCount} · 함수 ${summary.functionNodeCount} · 외부 ${summary.externalNodeCount} · 엣지 ${summary.edgeCount}`
    el.appendChild(graphStat)

    if (summary.failureCount > 0) {
      const warn = document.createElement('p')
      warn.className = 'analysis__warn'
      warn.textContent = `파싱 실패 ${summary.failureCount}개${summary.skippedDirCount > 0 ? ` · 건너뛴 폴더 ${summary.skippedDirCount}개` : ''}`
      el.appendChild(warn)
    }
  } else if (status === 'error') {
    const err = document.createElement('p')
    err.className = 'analysis__error'
    err.textContent = `분석 실패: ${error ?? '알 수 없는 오류'}`
    el.appendChild(err)
  }

  return el
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
