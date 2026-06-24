import type { TabState, TabStore } from './tab-store'
import { DEFAULT_MAX_INITIAL_NODES } from '../graph/initial-view'
import { assignDomainColors } from '../graph/domain-colors'
import {
  buildCallerAdjacency,
  FILE_BACKTRACE_EDGES,
  FUNCTION_BACKTRACE_EDGES
} from '../graph/backtrace'
import { diffGraphs } from '../graph/graph-diff'
import { parseLogcatLine } from '../../../shared/logcat-parse'
import { matchLogSites, confidenceOf, confidenceLabel } from '../../../shared/log-match'
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
  /** 현재 그래프를 비교 스냅샷으로 캡처한다. (03, 06 §5, M14_3) */
  captureSnapshot: () => void
  /** 전/후 비교 모드 토글. (M14_3) */
  setCompare: (on: boolean) => void
  /** 비교 스냅샷을 해제한다. (M14_3) */
  clearSnapshot: () => void
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

  // 복원된 프로젝트 경로가 사라진 경우: 분석 대신 안내를 표시한다. (TODO_EXTRA D)
  if (active.pathMissing) {
    host.className = 'ws-overlay ws-overlay--center'
    host.appendChild(renderPathMissing(active))
    return
  }

  const { status } = active.analysis
  if (status === 'done' && active.analysis.summary) {
    host.className = 'ws-overlay ws-overlay--corner'
    host.appendChild(renderStatsPanel(active))
    const graph = active.analysis.graph
    // 우상단 정보 패널들을 세로 스택으로 모아 겹침을 방지한다. (TODO_MORE)
    const right = document.createElement('div')
    right.className = 'overlay-right'
    // 역추적 모드: 전용 패널(함수명 + 호출처 수 + 종료). 그 외: 토글/범례/정보패널. (M10_2)
    if (active.view.backtrace && graph) {
      right.appendChild(renderBacktracePanel(graph, active.view.backtrace, actions))
    } else {
      host.appendChild(renderViewToggle(active, store))
      if (graph) host.appendChild(renderLegend(graph))
      if (graph && active.view.selectedNodeId) {
        const info = renderInfoPanel(graph, active.view.selectedNodeId, actions)
        if (info) right.appendChild(info)
      }
    }
    // 로그→코드 역추적 후보 패널(선택 라인 있을 때). (04 §5, M11_4)
    if (active.log && active.log.selectedLine !== null) {
      right.appendChild(renderCandidatePanel(active, active.log.selectedLine, actions))
    }
    // 재분석 영향 범위 패널. (06 §5, M12_4)
    if (active.impact) {
      right.appendChild(renderImpactPanel(active.impact, actions))
    }
    // 전/후 비교 패널. (03, 06 §5, M14_3)
    right.appendChild(renderComparePanel(active, actions))
    host.appendChild(right)
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

  // 노드 → 소스 편집기 열기 + 이 파일 역추적. 외부/미해결 노드는 소스가 없으므로 제외. (06 §2, M12_1)
  if (!node.external && node.kind === 'file') {
    const actionsRow = document.createElement('div')
    actionsRow.className = 'info-panel__actions'
    const open = document.createElement('button')
    open.className = 'info-panel__open'
    open.textContent = '소스 열기'
    open.addEventListener('click', () => actions.openSource(node.path, node.line ?? 1))
    // 파일 노드 역추적: 이 파일을 의존/호출하는 쪽을 depth만큼 거슬러 표시. (TODO_MORE)
    const bt = document.createElement('button')
    bt.className = 'info-panel__open'
    bt.textContent = '이 파일 역추적'
    bt.title = '이 파일을 의존/호출하는 쪽을 거슬러 올라가기'
    bt.addEventListener('click', () => actions.backtrace(node.id))
    actionsRow.append(open, bt)
    panel.appendChild(actionsRow)
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
      // 함수는 전부 표시한다(잘라내지 않음). 목록이 길면 패널 내부 스크롤. (TODO_MORE)
      for (const fn of functions) {
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
  // 함수는 호출 관계로, 파일은 의존/호출 관계로 직접 역추적 대상 수를 센다. (TODO_MORE)
  const isFn = node?.kind === 'function'
  const edges = isFn ? FUNCTION_BACKTRACE_EDGES : FILE_BACKTRACE_EDGES
  const callerCount = (buildCallerAdjacency(graph, edges).get(functionId) ?? []).length
  const term = isFn ? '호출처' : '의존/호출처'

  const panel = document.createElement('div')
  panel.className = 'info-panel backtrace-panel'

  const title = document.createElement('div')
  title.className = 'info-panel__title'
  title.textContent = `역추적: ${node?.name ?? functionId}`

  const sub = document.createElement('div')
  sub.className = 'backtrace-panel__sub muted'
  sub.textContent =
    callerCount > 0
      ? `직접 ${term} ${callerCount}곳 · 노드를 클릭해 더 거슬러 올라가기`
      : `직접 ${term}가 없습니다(진입점이거나 미해결).`

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
  // 선택 라인 원문: 메모리 모드는 lines에서, 스트림 모드는 selectedRaw에서. (TODO_EXTRA C)
  const raw =
    active.log?.source.mode === 'memory'
      ? (active.log.source.lines[selectedLine] ?? '')
      : (active.log?.selectedRaw ?? '')
  const fields = parseLogcatLine(raw)
  const logTag = fields?.tag ?? null
  // 신뢰도 계산 + 내림차순 정렬(가장 그럴듯한 후보 먼저). (04 §5.3, M14_2)
  const candidates = matchLogSites(raw, fields, active.analysis.logSites)
    .map((site) => ({ site, score: confidenceOf(site, logTag) }))
    .sort((a, b) => b.score - a.score)

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
  for (const { site, score } of candidates.slice(0, 20)) {
    const li = document.createElement('li')
    const btn = document.createElement('button')
    btn.className = 'candidate-panel__item'

    const head = document.createElement('span')
    head.className = 'candidate-panel__head'
    const loc = document.createElement('span')
    loc.className = 'candidate-panel__loc'
    loc.textContent = `${site.file}:${site.line}`
    // 신뢰도 배지(높음/중간/낮음 + %). (04 §5.3, M14_2)
    const conf = document.createElement('span')
    const label = confidenceLabel(score)
    conf.className = `candidate-panel__conf conf-${label === '높음' ? 'high' : label === '중간' ? 'mid' : 'low'}`
    conf.textContent = `${label} ${Math.round(score * 100)}%`
    head.append(loc, conf)

    const fmt = document.createElement('span')
    fmt.className = 'candidate-panel__fmt muted'
    fmt.textContent = site.format
    btn.append(head, fmt)
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

/** 전/후 비교 패널: 스냅샷 캡처 / 비교 토글 / 요약. (03, 06 §5, M14_3) */
function renderComparePanel(active: TabState, actions: TabContentActions): HTMLElement {
  const panel = document.createElement('div')
  panel.className = 'info-panel compare-panel'

  const title = document.createElement('div')
  title.className = 'info-panel__title'
  title.textContent = '전/후 비교'
  panel.appendChild(title)

  const button = (label: string, onClick: () => void): HTMLButtonElement => {
    const b = document.createElement('button')
    b.className = 'compare-panel__btn'
    b.textContent = label
    b.addEventListener('click', onClick)
    return b
  }

  if (!active.snapshot) {
    const hint = document.createElement('div')
    hint.className = 'compare-panel__hint muted'
    hint.textContent = '현재 그래프를 기준으로 잡고, 편집·재분석 후 변화를 비교합니다.'
    panel.append(
      hint,
      button('스냅샷 캡처', () => actions.captureSnapshot())
    )
    return panel
  }

  if (active.view.compare && active.analysis.graph) {
    const d = diffGraphs(active.snapshot, active.analysis.graph)
    const sum = document.createElement('div')
    sum.className = 'compare-panel__sum muted'
    sum.textContent = `노드 +${d.addedNodes.length} · -${d.removedNodes.length} · 엣지 +${d.addedEdges} · -${d.removedEdges}`
    const legend = document.createElement('div')
    legend.className = 'compare-panel__legend muted'
    legend.innerHTML =
      '<span class="compare-add">●</span> 추가 &nbsp; <span class="compare-rem">●</span> 삭제'
    panel.append(
      sum,
      legend,
      button('비교 종료', () => actions.setCompare(false))
    )
  } else {
    panel.appendChild(button('비교 보기', () => actions.setCompare(true)))
  }
  panel.appendChild(button('스냅샷 해제', () => actions.clearSnapshot()))
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
  const jni = summary.jniEdgeCount ? ` · JNI ${summary.jniEdgeCount}` : ''
  stat2.textContent = `노드 파일 ${fileNodeCount} · 함수 ${summary.functionNodeCount} · 외부 ${summary.externalNodeCount} · 엣지 ${summary.edgeCount} · 호출 ${summary.callEdgeCount}${jni} · 영역 ${summary.domainCount}`

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

/** 복원된 프로젝트 경로가 사라졌을 때의 안내. (TODO_EXTRA D) */
function renderPathMissing(tab: TabState): HTMLElement {
  const box = document.createElement('div')
  box.className = 'welcome'

  const icon = document.createElement('div')
  icon.className = 'welcome__icon'
  icon.textContent = '⚠️'

  const title = document.createElement('h2')
  title.className = 'welcome__title'
  title.textContent = '프로젝트 경로를 찾을 수 없습니다'

  const desc = document.createElement('p')
  desc.className = 'welcome__desc'
  desc.textContent = `${tab.projectName ?? '프로젝트'} — 폴더가 이동/삭제되었을 수 있습니다.`

  const path = document.createElement('p')
  path.className = 'muted'
  path.textContent = tab.projectPath ?? ''

  box.append(icon, title, desc, path)
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
