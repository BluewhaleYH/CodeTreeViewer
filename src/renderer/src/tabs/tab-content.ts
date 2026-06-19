import type { TabState, TabStore } from './tab-store'

export interface TabContentActions {
  openProject: () => void
}

/**
 * 워크스페이스 오버레이를 렌더한다(그래프 캔버스 위에 표시).
 * - 프로젝트 없음 → welcome(중앙)
 * - 분석 중/오류 → 상태(중앙)
 * - 완료 → 통계 패널(좌상단 코너, 그래프 위)
 * 그래프 캔버스 자체는 GraphView가 관리한다. (03 §2)
 */
export function renderOverlay(
  host: HTMLElement,
  store: TabStore,
  actions: TabContentActions
): void {
  const active = store.getActive()
  host.innerHTML = ''

  if (!active || active.projectPath === null) {
    host.className = 'ws-overlay ws-overlay--center'
    host.appendChild(renderWelcome(actions))
    return
  }

  const { status } = active.analysis
  if (status === 'done' && active.analysis.summary) {
    host.className = 'ws-overlay ws-overlay--corner'
    host.appendChild(renderStatsPanel(active))
    return
  }

  host.className = 'ws-overlay ws-overlay--center'
  host.appendChild(renderStatus(active))
}

function renderStatus(tab: TabState): HTMLElement {
  const box = document.createElement('div')
  box.className = 'content'

  const title = document.createElement('h2')
  title.textContent = tab.projectName ?? ''
  box.appendChild(title)

  const { status, progress, error } = tab.analysis
  if (status === 'running') {
    const done = progress?.processed ?? 0
    const total = progress?.total ?? 0
    const text = document.createElement('p')
    text.className = 'muted'
    text.textContent = progress?.phase === 'scanning' ? '스캔 중…' : `파싱 중… ${done}/${total}`
    const bar = document.createElement('div')
    bar.className = 'progress'
    const fill = document.createElement('div')
    fill.className = 'progress__fill'
    fill.style.width = `${total > 0 ? Math.round((done / total) * 100) : 0}%`
    bar.appendChild(fill)
    box.append(text, bar)
  } else if (status === 'error') {
    const err = document.createElement('p')
    err.className = 'analysis__error'
    err.textContent = `분석 실패: ${error ?? '알 수 없는 오류'}`
    box.appendChild(err)
  } else {
    const text = document.createElement('p')
    text.className = 'muted'
    text.textContent = '분석 대기 중…'
    box.appendChild(text)
  }
  return box
}

function renderStatsPanel(tab: TabState): HTMLElement {
  const summary = tab.analysis.summary!
  const panel = document.createElement('div')
  panel.className = 'stats-panel'

  const title = document.createElement('div')
  title.className = 'stats-panel__title'
  title.textContent = tab.projectName ?? ''

  const stat1 = document.createElement('div')
  stat1.className = 'stats-panel__line'
  stat1.textContent = `파일 ${summary.fileCount} · Java ${summary.byLanguage.java} · Kotlin ${summary.byLanguage.kotlin}`

  const fileNodeCount = summary.nodeCount - summary.functionNodeCount - summary.externalNodeCount
  const stat2 = document.createElement('div')
  stat2.className = 'stats-panel__line muted'
  stat2.textContent = `노드 파일 ${fileNodeCount} · 함수 ${summary.functionNodeCount} · 외부 ${summary.externalNodeCount} · 엣지 ${summary.edgeCount} · 영역 ${summary.domainCount}`

  panel.append(title, stat1, stat2)

  if (summary.failureCount > 0) {
    const warn = document.createElement('div')
    warn.className = 'stats-panel__line analysis__warn'
    warn.textContent = `파싱 실패 ${summary.failureCount} · 건너뛴 폴더 ${summary.skippedDirCount}`
    panel.appendChild(warn)
  }
  return panel
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
