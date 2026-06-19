import type { TabState, TabStore } from './tab-store'
import { DEFAULT_MAX_INITIAL_NODES } from '../graph/initial-view'
import { assignDomainColors } from '../graph/domain-colors'
import type { CodeGraph } from '../../../shared/graph'

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
    host.appendChild(renderViewToggle(active, store))
    if (active.analysis.graph) host.appendChild(renderLegend(active.analysis.graph))
    if (active.analysis.graph && active.view.selectedNodeId) {
      const info = renderInfoPanel(active.analysis.graph, active.view.selectedNodeId)
      if (info) host.appendChild(info)
    }
    return
  }

  host.className = 'ws-overlay ws-overlay--center'
  host.appendChild(renderStatus(active))
}

/** 선택 노드 정보 패널(읽기 전용). 편집기 연동은 M12. (03 §10, M6_5) */
function renderInfoPanel(graph: CodeGraph, selectedId: string): HTMLElement | null {
  const node = graph.nodes.find((n) => n.id === selectedId)
  if (!node) return null

  const panel = document.createElement('div')
  panel.className = 'info-panel'

  const title = document.createElement('div')
  title.className = 'info-panel__title'
  title.textContent = node.name

  const meta = document.createElement('dl')
  meta.className = 'info-panel__meta'
  const addRow = (key: string, value: string): void => {
    const dt = document.createElement('dt')
    dt.textContent = key
    const dd = document.createElement('dd')
    dd.textContent = value
    meta.append(dt, dd)
  }

  if (node.external) {
    addRow('종류', '외부 의존성')
    addRow('식별자', node.path)
  } else {
    addRow('경로', node.path)
    addRow('영역', node.domain ?? '—')
    addRow('언어', node.language ?? '—')
    addRow('라인', node.line != null ? String(node.line) : '—')
  }

  panel.append(title, meta)

  // 파일 노드: 정의된 함수 목록(검색·라벨용 데이터). (M4_4)
  if (!node.external) {
    const functions = graph.nodes.filter((n) => n.kind === 'function' && n.path === node.path)
    const fnTitle = document.createElement('div')
    fnTitle.className = 'info-panel__section'
    fnTitle.textContent = `함수 ${functions.length}개`
    panel.appendChild(fnTitle)

    if (functions.length > 0) {
      const list = document.createElement('ul')
      list.className = 'info-panel__fns'
      for (const fn of functions.slice(0, 30)) {
        const li = document.createElement('li')
        li.textContent = fn.name
        list.appendChild(li)
      }
      if (functions.length > 30) {
        const li = document.createElement('li')
        li.className = 'muted'
        li.textContent = `…외 ${functions.length - 30}개`
        list.appendChild(li)
      }
      panel.appendChild(list)
    }
  }

  return panel
}

/** 영역(Domain) 색상 범례. (03 §6, M6_4) */
function renderLegend(graph: CodeGraph): HTMLElement {
  const wrap = document.createElement('div')
  wrap.className = 'legend'

  const colors = assignDomainColors(graph)
  for (const [domain, color] of colors) {
    const row = document.createElement('div')
    row.className = 'legend__row'

    const swatch = document.createElement('span')
    swatch.className = 'legend__swatch'
    swatch.style.backgroundColor = color

    const label = document.createElement('span')
    label.className = 'legend__label'
    label.textContent = domain

    row.append(swatch, label)
    wrap.appendChild(row)
  }

  if (graph.nodes.some((n) => n.external)) {
    const row = document.createElement('div')
    row.className = 'legend__row'
    const swatch = document.createElement('span')
    swatch.className = 'legend__swatch legend__swatch--diamond'
    swatch.style.backgroundColor = '#555a60'
    const label = document.createElement('span')
    label.className = 'legend__label'
    label.textContent = '외부'
    row.append(swatch, label)
    wrap.appendChild(row)
  }

  return wrap
}

/** 관계도 ↔ 트리 전환 토글. (03 §5.2, M6_1) */
function renderViewToggle(tab: TabState, store: TabStore): HTMLElement {
  const wrap = document.createElement('div')
  wrap.className = 'view-toggle'

  const modes: { mode: 'graph' | 'tree'; label: string }[] = [
    { mode: 'graph', label: '관계도' },
    { mode: 'tree', label: '트리' }
  ]
  for (const { mode, label } of modes) {
    const button = document.createElement('button')
    button.className = tab.view.mode === mode ? 'view-toggle__btn is-active' : 'view-toggle__btn'
    button.textContent = label
    button.addEventListener('click', () => store.setViewMode(tab.id, mode))
    wrap.appendChild(button)
  }
  return wrap
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
  stat2.textContent = `노드 파일 ${fileNodeCount} · 함수 ${summary.functionNodeCount} · 외부 ${summary.externalNodeCount} · 엣지 ${summary.edgeCount} · 호출 ${summary.callEdgeCount} · 영역 ${summary.domainCount}`

  panel.append(title, stat1, stat2)

  // 대규모: 초기 뷰가 진입점 중심으로 축소됨을 안내. (M5_5, D15)
  const renderable = summary.nodeCount - summary.functionNodeCount
  if (renderable > DEFAULT_MAX_INITIAL_NODES) {
    const reduced = document.createElement('div')
    reduced.className = 'stats-panel__line muted'
    reduced.textContent = `대규모: 진입점 중심 ${DEFAULT_MAX_INITIAL_NODES}개 표시(클릭으로 확장)`
    panel.appendChild(reduced)
  }

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
