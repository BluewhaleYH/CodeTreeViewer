import type { TabState, TabStore } from './tab-store'
import { DEFAULT_MAX_INITIAL_NODES } from '../graph/initial-view'
import { assignDomainColors } from '../graph/domain-colors'
import { buildCallerAdjacency } from '../graph/backtrace'
import { parseLogcatLine } from '../log/logcat-parse'
import { matchLogSites } from '../log/log-match'
import type { CodeGraph } from '../../../shared/graph'
import type { LogSite } from '../../../shared/log'

export interface TabContentActions {
  openProject: () => void
  /** 함수 호출처 역추적을 시작한다(함수 노드 id). (M10_2) */
  backtrace: (functionId: string) => void
  /** 역추적을 종료하고 파일 그래프로 돌아간다. (M10_2) */
  exitBacktrace: () => void
  /** 로그→코드 후보를 선택해 해당 소스 노드로 이동한다. (04 §5, M11_4) */
  openCandidate: (site: LogSite) => void
  /** 노드의 소스를 편집기로 연다. (06 §2, M12_1) */
  openSource: (file: string, line: number) => void
  /** 영향 범위 표시를 지운다. (06 §5, M12_4) */
  clearImpact: () => void
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
    const graph = active.analysis.graph
    // 역추적 모드: 전용 패널(함수명 + 호출처 수 + 종료). 그 외: 토글/범례/정보패널. (M10_2)
    if (active.view.backtrace && graph) {
      host.appendChild(renderBacktracePanel(graph, active.view.backtrace, actions))
    } else {
      host.appendChild(renderViewToggle(active, store))
      if (graph) host.appendChild(renderLegend(graph))
      if (graph && active.view.selectedNodeId) {
        const info = renderInfoPanel(graph, active.view.selectedNodeId, actions)
        if (info) host.appendChild(info)
      }
    }
    // 로그→코드 역추적 후보 패널(선택 라인 있을 때). (04 §5, M11_4)
    if (active.log && active.log.selectedLine !== null) {
      host.appendChild(renderCandidatePanel(active, active.log.selectedLine, actions))
    }
    // 재분석 영향 범위 패널. (06 §5, M12_4)
    if (active.impact) {
      host.appendChild(renderImpactPanel(active.impact, actions))
    }
    return
  }

  host.className = 'ws-overlay ws-overlay--center'
  host.appendChild(renderStatus(active))
}

/** 선택 노드 정보 패널(읽기 전용). 함수 목록은 클릭 시 역추적 시작. (03 §10, M6_5, M10_2) */
function renderInfoPanel(
  graph: CodeGraph,
  selectedId: string,
  actions: TabContentActions
): HTMLElement | null {
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

  // 노드 → 소스 편집기 열기. 외부/미해결 노드는 소스가 없으므로 제외. (06 §2, M12_1)
  if (!node.external && node.kind === 'file') {
    const open = document.createElement('button')
    open.className = 'info-panel__open'
    open.textContent = '소스 열기'
    open.addEventListener('click', () => actions.openSource(node.path, node.line ?? 1))
    panel.appendChild(open)
  }

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
        // 함수 클릭 → 호출처 역추적. (M10_2)
        const btn = document.createElement('button')
        btn.className = 'info-panel__fn'
        btn.textContent = fn.name
        btn.title = '호출처 역추적'
        btn.addEventListener('click', () => actions.backtrace(fn.id))
        li.appendChild(btn)
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

/** 역추적 패널: 대상 함수명 + 직접 호출처 수 + 종료 버튼. (02 §6, 03 §5.3, M10_2) */
function renderBacktracePanel(
  graph: CodeGraph,
  functionId: string,
  actions: TabContentActions
): HTMLElement {
  const node = graph.nodes.find((n) => n.id === functionId)
  const callerCount = (buildCallerAdjacency(graph).get(functionId) ?? []).length

  const panel = document.createElement('div')
  panel.className = 'info-panel backtrace-panel'

  const title = document.createElement('div')
  title.className = 'info-panel__title'
  title.textContent = `역추적: ${node?.name ?? functionId}`

  const sub = document.createElement('div')
  sub.className = 'backtrace-panel__sub muted'
  sub.textContent =
    callerCount > 0
      ? `직접 호출처 ${callerCount}곳 · 노드를 클릭해 더 거슬러 올라가기`
      : '직접 호출처가 없습니다(진입점이거나 미해결).'

  const exit = document.createElement('button')
  exit.className = 'backtrace-panel__exit'
  exit.textContent = '← 파일 그래프로'
  exit.addEventListener('click', () => actions.exitBacktrace())

  panel.append(title, sub, exit)
  return panel
}

/** 로그→코드 역추적 후보 패널. 다중 후보는 목록으로 제시(단정 금지). (04 §5.2, M11_4) */
function renderCandidatePanel(
  active: TabState,
  selectedLine: number,
  actions: TabContentActions
): HTMLElement {
  const raw = active.log?.lines[selectedLine] ?? ''
  const fields = parseLogcatLine(raw)
  const candidates = matchLogSites(raw, fields, active.analysis.logSites)

  const panel = document.createElement('div')
  panel.className = 'info-panel candidate-panel'

  const title = document.createElement('div')
  title.className = 'info-panel__title'
  title.textContent = '로그 → 코드'

  const line = document.createElement('div')
  line.className = 'candidate-panel__line muted'
  line.textContent = fields ? `[${fields.level}/${fields.tag}] ${fields.message}` : raw
  line.title = raw

  panel.append(title, line)

  if (candidates.length === 0) {
    const none = document.createElement('div')
    none.className = 'candidate-panel__none muted'
    none.textContent = '일치하는 코드 위치를 찾지 못했습니다.'
    panel.appendChild(none)
    return panel
  }

  const head = document.createElement('div')
  head.className = 'info-panel__section'
  head.textContent = candidates.length === 1 ? '후보 1곳' : `후보 ${candidates.length}곳`
  panel.appendChild(head)

  const list = document.createElement('ul')
  list.className = 'candidate-panel__list'
  for (const site of candidates.slice(0, 20)) {
    const li = document.createElement('li')
    const btn = document.createElement('button')
    btn.className = 'candidate-panel__item'
    const loc = document.createElement('span')
    loc.className = 'candidate-panel__loc'
    loc.textContent = `${site.file}:${site.line}`
    const fmt = document.createElement('span')
    fmt.className = 'candidate-panel__fmt muted'
    fmt.textContent = site.format
    btn.append(loc, fmt)
    btn.addEventListener('click', () => actions.openCandidate(site))
    li.appendChild(btn)
    list.appendChild(li)
  }
  panel.appendChild(list)
  return panel
}

/** 재분석 영향 범위 패널(추가/삭제/엣지 요약 + 강조 안내 + 지우기). (06 §5, M12_4) */
function renderImpactPanel(impact: TabState['impact'], actions: TabContentActions): HTMLElement {
  const panel = document.createElement('div')
  panel.className = 'info-panel impact-panel'
  const s = impact!.summary

  const title = document.createElement('div')
  title.className = 'info-panel__title'
  title.textContent = '재분석 영향 범위'

  const line = document.createElement('div')
  line.className = 'impact-panel__sum muted'
  line.textContent = `노드 +${s.addedNodes} · -${s.removedNodes} · 엣지 +${s.addedEdges} · -${s.removedEdges}`

  const hint = document.createElement('div')
  hint.className = 'impact-panel__hint muted'
  hint.textContent =
    impact!.highlight.length > 0 ? '추가·변경 노드를 초록 테두리로 표시' : '그래프 구조 변화 없음'

  const clear = document.createElement('button')
  clear.className = 'impact-panel__clear'
  clear.textContent = '지우기'
  clear.addEventListener('click', () => actions.clearImpact())

  panel.append(title, line, hint, clear)
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
  const LANG_LABEL: Record<string, string> = { java: 'Java', kotlin: 'Kotlin', c: 'C', cpp: 'C++' }
  const langs = Object.entries(summary.byLanguage)
    .filter(([, n]) => (n ?? 0) > 0)
    .map(([lang, n]) => `${LANG_LABEL[lang] ?? lang} ${n}`)
    .join(' · ')
  stat1.textContent = `파일 ${summary.fileCount}${langs ? ` · ${langs}` : ''}`

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
